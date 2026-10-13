import type Phaser from 'phaser';
import { DisposableScope, GpuTimer, type Diagnostics, type GpuTimerSample } from '@volstudio/core';
import { RingStats } from '@/app/ringStats';
import type { FactoryHost } from '@/app/host';
import {
  buildEnvironment,
  describeGl,
  measureRaf,
  type Environment,
  type GlLike,
} from './environment';
import {
  judge,
  type GpuSummary,
  type Invariant,
  type JudgeInput,
  type JudgeOptions,
  type Verdict,
} from './judge';
import type { LabLog } from './log';
import { resolveParams, type ParamValues } from './params';
import { FrameProbe, type FrameSummary } from './probe';
import type { WorkloadDef, WorkloadInstance } from './workload';

export type RunState = 'idle' | 'starting' | 'warmup' | 'running' | 'finished' | 'failed';
export type StopReason = 'duration' | 'manual' | 'watchdog';

export interface LabError {
  readonly code: string;
  readonly message: string;
}

export type Outcome<T> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: LabError };

export interface StartOptions {
  readonly workload: string;
  readonly params?: unknown;
  readonly durationMs: number;
  readonly warmupMs: number;
}

export interface RunReport {
  readonly runId: number;
  readonly workload: string;
  readonly params: ParamValues;
  readonly paramsKey: string;
  readonly durationMs: number;
  readonly warmupMs: number;
  readonly stoppedBy: StopReason;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly env: Environment;
  readonly renderer: { readonly kind: string; readonly fellBack: boolean } | null;
  readonly frame: FrameSummary;
  readonly gpu: GpuSummary;
  readonly counters: Record<string, number>;
  readonly facts: Record<string, string | number | boolean>;
  readonly run: {
    readonly hiddenDuringRun: boolean;
    readonly errors: number;
    readonly warnings: number;
    readonly longTasks: number;
    readonly heapMb: number | null;
  };
  readonly verdict: Verdict;
}

export interface RuntimeDeps {
  readonly game: Phaser.Game;
  readonly log: LabLog;
  readonly host: FactoryHost;
  readonly diagnostics: Diagnostics | null;
  /** Çizici bilgisi: `Diagnostics` bunu dışarı vermez, CORE'un bildirimini aktaran kit sağlar. */
  readonly renderer: () => { readonly kind: string; readonly fellBack: boolean } | null;
  readonly workloads: readonly WorkloadDef[];
  /** Canlı bir oyun oturumunu bozmamak için yük koşturmaz; yalnız gözlem komutları çalışır. */
  readonly observeOnly: boolean;
  readonly now?: () => number;
}

/** Sahnenin başlamasını beklerken vazgeçme süresi (ms): sekme gizliyse kare gelmez. */
const SCENE_TIMEOUT_MS = 5000;
/** Kareler durursa (gizli sekme, kilitlenme) koşu bu pay sonra zorla bitirilir. */
const WATCHDOG_MS = 3000;

function fail(code: string, message: string): { ok: false; error: LabError } {
  return { ok: false, error: { code, message } };
}

function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

/**
 * Laboratuvarın kalbi: yükü başlatır, kare ölçümünü Phaser olaylarından toplar (`prestep`,
 * `prerender`, `postrender`), CORE `Diagnostics` ve `GpuTimer`ı besler ve koşu bitince yargıyı üretir.
 * Phaser'a yalnız `game.events` ve `game.scene` üzerinden dokunur.
 */
export class LabRuntime {
  readonly probe = new FrameProbe();
  state: RunState = 'idle';
  last: RunReport | null = null;
  lastInput: JudgeInput | null = null;
  lastError: LabError | null = null;

  private readonly scope = new DisposableScope();
  private readonly now: () => number;
  private readonly gpuMs = new RingStats(2048);
  private gpuReady = 0;
  /** Son ölçülemeyen örneğin nedeni (`disjoint`, `context-lost`...); hazır örnek gelince anlamsızlaşır. */
  private gpuLast: GpuSummary['status'] | null = null;
  private gpuTimer: GpuTimer | null = null;
  private def: WorkloadDef | null = null;
  private instance: WorkloadInstance | null = null;
  private instanceBroken = false;
  private params: ParamValues = {};
  private paramsKey = '';
  private runId = 0;
  private durationMs = 0;
  private warmupMs = 0;
  private startedAt = '';
  private startedMs = 0;
  private measureStartMs = 0;
  private hiddenDuringRun = false;
  private errorsAtStart = 0;
  private warnsAtStart = 0;
  private longTasks = 0;
  private longTaskSupported = false;
  private rafMedianMs: number | null = null;
  private readonly waiters: ((report: RunReport) => void)[] = [];

  constructor(private readonly deps: RuntimeDeps) {
    this.now = deps.now ?? (() => performance.now());
    const { events } = deps.game;
    const on = (event: string, listener: () => void): void => {
      events.on(event, listener);
      this.scope.addSubscription(() => events.off(event, listener));
    };
    on('prestep', () => this.onPreStep());
    on('prerender', () => this.onPreRender());
    on('postrender', () => this.onPostRender());
    const renderer = deps.game.renderer;
    const gl = renderer && 'gl' in renderer ? renderer.gl : null;
    this.gpuTimer = this.scope.addDestroyable(
      new GpuTimer(gl, { onSample: (sample) => this.onGpuSample(sample) }),
    );
    if (typeof document !== 'undefined') {
      this.scope.addListener(document, 'visibilitychange', () => {
        if (document.visibilityState === 'hidden' && this.measuring) {
          this.hiddenDuringRun = true;
          deps.log.warn('lab', 'run.hidden');
        }
      });
    }
    this.observeLongTasks();
  }

  get log(): LabLog {
    return this.deps.log;
  }

  get observeOnly(): boolean {
    return this.deps.observeOnly;
  }

  private get measuring(): boolean {
    return this.state === 'warmup' || this.state === 'running';
  }

  /** Ekranın gerçek yenileme hızını oyun döngüsünden bağımsız ölçer; yük başlamadan bir kez çağrılır. */
  async calibrate(): Promise<void> {
    this.rafMedianMs = await measureRaf(30, (callback) => requestAnimationFrame(callback));
    this.log.info('lab', 'calibrate', { rafMedianMs: this.rafMedianMs });
  }

  private observeLongTasks(): void {
    if (typeof PerformanceObserver === 'undefined') return;
    const supported = PerformanceObserver.supportedEntryTypes;
    if (!supported.includes('longtask')) return;
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!this.measuring) continue;
          this.longTasks++;
          this.log.info('lab', 'longtask', { durationMs: Math.round(entry.duration) });
        }
      });
      observer.observe({ type: 'longtask' });
      this.longTaskSupported = true;
      this.scope.addSubscription(() => observer.disconnect());
    } catch {
      this.longTaskSupported = false;
    }
  }

  private onGpuSample(sample: GpuTimerSample): void {
    if (sample.status === 'ready' && sample.durationMs !== null) {
      if (this.state === 'running') {
        this.gpuMs.push(sample.durationMs);
        this.gpuReady++;
      }
    } else {
      this.gpuLast = sample.status;
    }
  }

  private onPreStep(): void {
    this.deps.diagnostics?.beginFrame();
    if (!this.measuring) return;
    const started = this.now();
    this.probe.begin(started);
    const instance = this.instance;
    if (instance === null || this.instanceBroken || instance.update === undefined) return;
    try {
      instance.update(this.deps.game.loop.delta);
    } catch (error) {
      // Kare döngüsünü kıran bir yük ölçümü de kırar: bir kez yazılır, sonra güncellenmez ve hata sayılır.
      this.instanceBroken = true;
      this.log.error('workload', 'update.threw', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private onPreRender(): void {
    if (!this.measuring) return;
    this.probe.renderStart(this.now());
    this.gpuTimer?.poll();
    this.gpuTimer?.begin(this.deps.game.loop.frame);
  }

  private onPostRender(): void {
    if (this.measuring) {
      this.gpuTimer?.end();
      const now = this.now();
      this.probe.end(now);
      if (this.state === 'warmup' && now - this.startedMs >= this.warmupMs)
        this.beginMeasuring(now);
      else if (this.state === 'running' && now - this.measureStartMs >= this.durationMs)
        this.finish('duration');
    }
    this.deps.diagnostics?.endFrame();
  }

  private beginMeasuring(now: number): void {
    this.probe.reset();
    this.gpuMs.clear();
    this.gpuReady = 0;
    this.gpuLast = null;
    this.measureStartMs = now;
    this.state = 'running';
    this.log.info('lab', 'run.measure', { runId: this.runId });
  }

  list(): readonly WorkloadDef[] {
    return this.deps.workloads;
  }

  /** Koşuyu başlatır: sahneyi hazırlar, yükü kurar, ısınmayı başlatır. Yük kurulunca döner. */
  async start(options: StartOptions): Promise<Outcome<{ runId: number; paramsKey: string }>> {
    if (this.deps.observeOnly)
      return fail(
        'observe-only',
        'Bu sayfa gözlem kipinde: yük koşturmak canlı oturumu bozar (?lab=run).',
      );
    if (this.state === 'starting' || this.measuring)
      return fail('busy', `Bir koşu sürüyor (${this.state}); önce stop ya da reset.`);
    const def = this.deps.workloads.find((workload) => workload.id === options.workload);
    if (def === undefined)
      return fail(
        'unknown-workload',
        `Bilinmeyen yük: ${options.workload} (geçerli: ${this.deps.workloads.map((w) => w.id).join(', ')})`,
      );
    const resolved = resolveParams(def.params, options.params);
    if (!resolved.ok) return fail('bad-params', resolved.message);

    this.teardownInstance();
    this.runId++;
    this.state = 'starting';
    this.lastError = null;
    this.log.info('lab', 'run.starting', {
      runId: this.runId,
      workload: def.id,
      params: resolved.values,
    });
    try {
      const scene = await this.ensureScene(def.scene);
      this.deps.diagnostics?.setScene(def.scene);
      this.instance = await def.create(
        { game: this.deps.game, scene, log: this.log, host: this.deps.host },
        resolved.values,
      );
    } catch (error) {
      this.state = 'failed';
      this.lastError = {
        code: 'start-failed',
        message: error instanceof Error ? error.message : String(error),
      };
      this.log.error('lab', 'run.failed', { ...this.lastError });
      return { ok: false, error: this.lastError };
    }
    this.def = def;
    this.params = resolved.values;
    this.paramsKey = resolved.key;
    this.durationMs = options.durationMs;
    this.warmupMs = options.warmupMs;
    this.instanceBroken = false;
    this.probe.reset();
    this.gpuMs.clear();
    this.gpuReady = 0;
    this.gpuLast = null;
    this.hiddenDuringRun = false;
    this.longTasks = 0;
    this.errorsAtStart = this.log.counts.error;
    this.warnsAtStart = this.log.counts.warn;
    this.startedAt = new Date().toISOString();
    this.startedMs = this.now();
    this.measureStartMs = this.startedMs;
    this.state = options.warmupMs > 0 ? 'warmup' : 'running';
    this.deps.diagnostics?.recordEvent('lab.run.start', { workload: def.id });
    this.log.info('lab', 'run.start', {
      runId: this.runId,
      workload: def.id,
      paramsKey: this.paramsKey,
      durationMs: this.durationMs,
      warmupMs: this.warmupMs,
    });
    return ok({ runId: this.runId, paramsKey: this.paramsKey });
  }

  /** İstenen sahneyi başlatır, ötekileri durdurur ve sahne etkin olana kadar bekler. */
  private async ensureScene(key: string): Promise<Phaser.Scene> {
    const manager = this.deps.game.scene;
    for (const scene of manager.getScenes(true)) {
      if (scene.scene.key !== key) manager.stop(scene.scene.key);
    }
    if (!manager.isActive(key)) manager.start(key, {});
    const deadline = this.now() + SCENE_TIMEOUT_MS;
    for (;;) {
      const scene = manager.getScene(key);
      if (scene !== null && manager.isActive(key) && scene.sys.isActive()) return scene;
      if (this.now() > deadline)
        throw new Error(
          `Sahne ${SCENE_TIMEOUT_MS} ms içinde başlamadı: ${key} (sekme gizli olabilir)`,
        );
      await new Promise<void>((resolve) => this.deps.game.events.once('poststep', resolve));
    }
  }

  private teardownInstance(): void {
    try {
      this.instance?.destroy();
    } catch (error) {
      this.log.error('lab', 'teardown.threw', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    this.instance = null;
  }

  /** Canlı ölçüm: sürüyorsa o ana kadarki pencere, bittiyse son koşunun kareleri. */
  metrics(): {
    state: RunState;
    runId: number;
    workload: string | null;
    frame: FrameSummary;
    gpu: GpuSummary;
    counters: Record<string, number>;
    log: { warn: number; error: number };
  } {
    return {
      state: this.state,
      runId: this.runId,
      workload: this.def?.id ?? null,
      frame: this.probe.summary(),
      gpu: this.gpuSummary(),
      counters: this.readCounters(),
      log: { warn: this.log.counts.warn, error: this.log.counts.error },
    };
  }

  status(): {
    state: RunState;
    runId: number;
    workload: string | null;
    paramsKey: string;
    elapsedMs: number;
    remainingMs: number;
    frames: number;
    hiddenDuringRun: boolean;
    observeOnly: boolean;
    lastError: LabError | null;
  } {
    const elapsed = this.measuring ? this.now() - this.startedMs : 0;
    const total = this.warmupMs + this.durationMs;
    return {
      state: this.state,
      runId: this.runId,
      workload: this.def?.id ?? null,
      paramsKey: this.paramsKey,
      elapsedMs: Math.round(elapsed),
      remainingMs: this.measuring ? Math.max(0, Math.round(total - elapsed)) : 0,
      frames: this.probe.summary().frames,
      hiddenDuringRun: this.hiddenDuringRun,
      observeOnly: this.deps.observeOnly,
      lastError: this.lastError,
    };
  }

  private readCounters(): Record<string, number> {
    if (this.instance === null || this.instanceBroken) return {};
    try {
      return this.instance.counters();
    } catch {
      return {};
    }
  }

  private gpuSummary(): GpuSummary {
    if (this.gpuReady > 0)
      return { status: 'ready', samples: this.gpuReady, p95Ms: this.gpuMs.percentile(0.95) };
    const timer = this.gpuTimer?.status;
    // Zamanlayıcı hazır ama hiç örnek gelmediyse ölçüm yok: `unavailable`, "hazır" değil.
    const fromTimer: GpuSummary['status'] =
      timer === undefined || timer === 'destroyed'
        ? 'absent'
        : timer === 'ready'
          ? 'unavailable'
          : timer;
    return { status: this.gpuLast ?? fromTimer, samples: 0, p95Ms: null };
  }

  environment(): Environment {
    const renderer = this.deps.game.renderer;
    const gl = renderer && 'gl' in renderer ? (renderer.gl as unknown as GlLike) : null;
    const isWebGl2 =
      typeof WebGL2RenderingContext !== 'undefined' &&
      (renderer as { gl?: unknown } | undefined)?.gl instanceof WebGL2RenderingContext;
    const memory = (navigator as { deviceMemory?: number }).deviceMemory;
    return buildEnvironment({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      dpr: window.devicePixelRatio,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      hardwareConcurrency: navigator.hardwareConcurrency ?? null,
      deviceMemoryGb: memory ?? null,
      visibility: document.visibilityState,
      gl: describeGl(gl, isWebGl2),
      rafMedianMs: this.rafMedianMs,
      capturedAt: new Date().toISOString(),
    });
  }

  private heapMb(): number | null {
    const memory = (performance as { memory?: { usedJSHeapSize?: number } }).memory;
    return memory?.usedJSHeapSize === undefined
      ? null
      : Math.round((memory.usedJSHeapSize / 1048576) * 10) / 10;
  }

  /** Saniyelik örnek ve kare durursa nöbetçi. Zamanlayıcıyı kuran `install` çağırır. */
  sample(): void {
    if (!this.measuring) return;
    const now = this.now();
    const frame = this.probe.summary();
    const counters = this.readCounters();
    this.log.info('lab', 'sample', {
      phase: this.state,
      frames: frame.frames,
      fps: Math.round(frame.fps * 10) / 10,
      workP95: Math.round(frame.workMs.p95 * 100) / 100,
      intervalP99: Math.round(frame.intervalMs.p99 * 100) / 100,
      over50: frame.longFrames.over50,
      heapMb: this.heapMb(),
      counters,
    });
    for (const [name, value] of Object.entries(counters))
      this.deps.diagnostics?.setCount(`lab.${name}`, value);
    const limit = this.state === 'warmup' ? this.warmupMs : this.warmupMs + this.durationMs;
    if (now - this.startedMs > limit + WATCHDOG_MS) {
      this.log.warn('lab', 'run.watchdog', { state: this.state });
      this.finish('watchdog');
    }
  }

  stop(): Outcome<RunReport> {
    if (this.measuring) return ok(this.finish('manual'));
    if (this.state === 'finished' && this.last !== null) return ok(this.last);
    return fail('not-running', `Koşu yok (durum: ${this.state}).`);
  }

  /** Koşu bitene kadar bekler; zaman aşımında null. */
  waitFinished(timeoutMs: number): Promise<RunReport | null> {
    if (this.state === 'finished' && this.last !== null) return Promise.resolve(this.last);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const index = this.waiters.indexOf(wake);
        if (index >= 0) this.waiters.splice(index, 1);
        resolve(null);
      }, timeoutMs);
      const wake = (report: RunReport): void => {
        clearTimeout(timer);
        resolve(report);
      };
      this.waiters.push(wake);
    });
  }

  private finish(reason: StopReason): RunReport {
    const def = this.def!;
    const frame = this.probe.summary();
    const gpu = this.gpuSummary();
    const counters = this.readCounters();
    let facts: Record<string, string | number | boolean> = {};
    let invariants: Invariant[] = [];
    try {
      facts = this.instance?.facts() ?? {};
      invariants = this.instance?.invariants() ?? [];
    } catch (error) {
      invariants = [
        {
          id: 'instance-readable',
          ok: false,
          detail: error instanceof Error ? error.message : String(error),
        },
      ];
    }
    if (this.instanceBroken)
      invariants.push({ id: 'update-ok', ok: false, detail: 'yükün update çağrısı hata fırlattı' });
    const env = this.environment();
    const errors = this.log.counts.error - this.errorsAtStart;
    const warnings = this.log.counts.warn - this.warnsAtStart;
    const renderer = this.deps.renderer();
    const input: JudgeInput = {
      workload: def.id,
      paramsKey: this.paramsKey,
      env,
      renderer,
      frame,
      gpu,
      run: {
        hiddenDuringRun: this.hiddenDuringRun,
        errors,
        elapsedMs: Math.round(this.now() - this.startedMs),
      },
      invariants,
      extraUnmeasured: this.longTaskSupported ? [] : ['longtask'],
    };
    const verdict = judge(input);
    this.state = 'finished';
    const report: RunReport = {
      runId: this.runId,
      workload: def.id,
      params: this.params,
      paramsKey: this.paramsKey,
      durationMs: this.durationMs,
      warmupMs: this.warmupMs,
      stoppedBy: reason,
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      env,
      renderer,
      frame,
      gpu,
      counters,
      facts,
      run: {
        hiddenDuringRun: this.hiddenDuringRun,
        errors,
        warnings,
        longTasks: this.longTasks,
        heapMb: this.heapMb(),
      },
      verdict,
    };
    this.last = report;
    this.lastInput = input;
    this.log.info('lab', 'run.finish', {
      runId: this.runId,
      status: verdict.status,
      stoppedBy: reason,
      frames: frame.frames,
      fps: Math.round(frame.fps * 10) / 10,
      workP95: Math.round(frame.workMs.p95 * 100) / 100,
    });
    this.deps.diagnostics?.recordEvent('lab.run.finish', { status: verdict.status });
    for (const wake of this.waiters.splice(0)) wake(report);
    return report;
  }

  /** Son koşuyu yeni seçeneklerle (donanım şartı, taban çizgi) yeniden yargılar; ölçüm değişmez. */
  rejudge(options: JudgeOptions, baseline: JudgeInput['baseline']): Verdict | null {
    if (this.lastInput === null) return null;
    return judge({ ...this.lastInput, baseline }, options);
  }

  action(name: string, args: Record<string, unknown>): Outcome<unknown> {
    if (this.instance === null || this.def === null)
      return fail('no-workload', 'Çalışan yük yok; önce start.');
    const spec = this.def.actions.find((action) => action.name === name);
    if (spec === undefined)
      return fail(
        'unknown-action',
        `Bilinmeyen eylem: ${name} (geçerli: ${this.def.actions.map((a) => a.name).join(', ') || 'yok'})`,
      );
    const resolved = resolveParams(spec.args, args);
    if (!resolved.ok) return fail('bad-args', resolved.message);
    try {
      return ok(this.instance.act?.(name, resolved.values));
    } catch (error) {
      return fail('action-failed', error instanceof Error ? error.message : String(error));
    }
  }

  /** Yükü söker, sayaçları sıfırlar; günlük ve son rapor kalır. */
  reset(): void {
    this.teardownInstance();
    this.probe.reset();
    this.state = 'idle';
    this.def = null;
    this.lastError = null;
    this.log.info('lab', 'reset');
  }

  destroy(): void {
    this.teardownInstance();
    this.scope.dispose();
  }
}
