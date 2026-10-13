import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FactoryHost } from '../../src/app/host';
import { LabLog } from '../../src/lab/log';
import type { ParamSpec } from '../../src/lab/params';
import { LabRuntime } from '../../src/lab/runtime';
import type { WorkloadDef, WorkloadInstance } from '../../src/lab/workload';

/**
 * Gerçek GPU zamanlayıcısı CORE'un kendi testindedir; burada WebGL yok. Örnekleri elle besleyen
 * bir taklit, runtime'ın örnekleri doğru pencerede toplayıp raporladığını sınar.
 */
const gpu = vi.hoisted(() => ({
  timers: [] as { options: { onSample(sample: unknown): void } }[],
}));
vi.mock('@volstudio/core/diagnostics', () => ({
  GpuTimer: class FakeGpuTimer {
    status = 'unsupported';
    constructor(
      _gl: unknown,
      readonly options: { onSample(sample: unknown): void },
    ) {
      gpu.timers.push(this);
    }
    begin(): boolean {
      return false;
    }
    end(): void {}
    poll(): void {}
    destroy(): void {
      this.status = 'destroyed';
    }
  },
}));

/** Phaser'sız küçük olay yayıcısı: runtime yalnız `on/off/once` kullanır. */
class Emitter {
  private readonly listeners = new Map<string, Set<() => void>>();

  on(event: string, listener: () => void): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)?.add(listener);
    return this;
  }

  off(event: string, listener: () => void): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  once(event: string, listener: () => void): this {
    const wrapped = (): void => {
      this.off(event, wrapped);
      listener();
    };
    return this.on(event, wrapped);
  }

  emit(event: string): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) listener();
  }

  count(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}

const COUNT_SPEC: ParamSpec = {
  name: 'count',
  type: 'integer',
  default: 3,
  min: 1,
  max: 10,
  description: 'adet',
};

interface Probe {
  updates: number;
  destroyed: number;
  acts: Record<string, unknown>[];
  failUpdateAt: number;
  invariantOk: boolean;
}

function workload(probe: Probe, overrides: Partial<WorkloadDef> = {}): WorkloadDef {
  return {
    id: 'fake',
    title: 'Sahte yük',
    summary: 'test',
    scene: 'fake-scene',
    params: [COUNT_SPEC],
    actions: [{ name: 'setCount', summary: 'adet', args: [COUNT_SPEC] }],
    create(_context, params): Promise<WorkloadInstance> {
      return Promise.resolve({
        update(): void {
          probe.updates++;
          if (probe.updates === probe.failUpdateAt) throw new Error('boom');
        },
        counters: () => ({ count: Number(params.count), updates: probe.updates }),
        facts: () => ({ marker: 'x' }),
        invariants: () => [{ id: 'ok', ok: probe.invariantOk, detail: 'test' }],
        act(_name, args) {
          probe.acts.push({ ...args });
          return { done: true };
        },
        destroy(): void {
          probe.destroyed++;
        },
      });
    },
    ...overrides,
  };
}

interface Rig {
  runtime: LabRuntime;
  events: Emitter;
  probe: Probe;
  log: LabLog;
  /** Bir kare: prestep → prerender → postrender; iki ms iş dahil kare aralığı 16,7 ms (60 FPS). */
  frame(count?: number, intervalMs?: number): void;
  /** Kare olmadan saati ilerletir (donmuş sekme). */
  advance(ms: number): void;
}

const rigs: Rig[] = [];

function makeRig(
  options: {
    observeOnly?: boolean;
    workloads?: WorkloadDef[];
    renderer?: boolean;
    /** Verilirse oyun çizicisi bu adı bildiren sahte bir WebGL bağlamı taşır. */
    glRenderer?: string;
  } = {},
): Rig {
  const events = new Emitter();
  const active = new Set<string>();
  let clock = 1000;
  const probe: Probe = { updates: 0, destroyed: 0, acts: [], failUpdateAt: -1, invariantOk: true };
  const scenes = new Map<string, unknown>();
  const game = {
    events,
    loop: { delta: 16.7, frame: 0 },
    renderer:
      options.glRenderer === undefined
        ? undefined
        : {
            gl: {
              VENDOR: 1,
              RENDERER: 2,
              MAX_TEXTURE_SIZE: 3,
              getParameter: (name: number) => (name === 2 ? options.glRenderer : null),
              getExtension: () => null,
            },
          },
    scene: {
      getScenes: () => [...active].map((key) => ({ scene: { key } })),
      stop: (key: string) => active.delete(key),
      isActive: (key: string) => active.has(key),
      start: (key: string) => {
        active.add(key);
        scenes.set(key, { scene: { key }, sys: { isActive: () => true } });
      },
      getScene: (key: string) => scenes.get(key) ?? null,
    },
  };
  const log = new LabLog(500);
  const runtime = new LabRuntime({
    game: game as never,
    log,
    host: {} as FactoryHost,
    diagnostics: null,
    renderer: () => (options.renderer === false ? null : { kind: 'webgl', fellBack: false }),
    workloads: options.workloads ?? [workload(probe)],
    observeOnly: options.observeOnly ?? false,
    now: () => clock,
  });
  const rig: Rig = {
    runtime,
    events,
    probe,
    log,
    frame(count = 1, intervalMs = 14.7) {
      for (let index = 0; index < count; index++) {
        clock += intervalMs;
        game.loop.frame++;
        events.emit('prestep');
        clock += 1;
        events.emit('prerender');
        clock += 1;
        events.emit('postrender');
        events.emit('poststep');
      }
    },
    advance(ms) {
      clock += ms;
    },
  };
  rigs.push(rig);
  return rig;
}

afterEach(() => {
  for (const rig of rigs.splice(0)) rig.runtime.destroy();
  gpu.timers.length = 0;
});

/** `start` sahne beklerken `poststep` bekler; kareleri sürerek çözülmesini sağlar. */
async function start(
  rig: Rig,
  options: { durationMs?: number; warmupMs?: number; params?: unknown; workload?: string } = {},
): ReturnType<LabRuntime['start']> {
  const pending = rig.runtime.start({
    workload: options.workload ?? 'fake',
    params: options.params,
    durationMs: options.durationMs ?? 2000,
    warmupMs: options.warmupMs ?? 500,
  });
  await Promise.resolve();
  rig.events.emit('poststep');
  return pending;
}

describe('LabRuntime', () => {
  it('ısınma → ölçüm → bitiş: ısınma kareleri ölçüme girmez ve rapor üretilir', async () => {
    const rig = makeRig();
    const started = await start(rig, { durationMs: 3000 });
    expect(started).toMatchObject({ ok: true, data: { runId: 1 } });
    expect(rig.runtime.state).toBe('warmup');

    rig.frame(20); // ~0,4 sn: hâlâ ısınma
    expect(rig.runtime.state).toBe('warmup');
    rig.frame(20); // ısınma 27. karede biter: toplam 40 kareden yalnız sonrası ölçülür
    expect(rig.runtime.state).toBe('running');
    const measured = rig.runtime.probe.summary().frames;
    expect(measured).toBeGreaterThan(0);
    expect(measured).toBeLessThan(20);

    rig.frame(200); // ölçüm 3 sn sürer; 180 kare yeter
    expect(rig.runtime.state).toBe('finished');
    const report = rig.runtime.last;
    expect(report).not.toBeNull();
    expect(report?.stoppedBy).toBe('duration');
    expect(report?.workload).toBe('fake');
    expect(report?.params).toEqual({ count: 3 });
    expect(report?.frame.frames).toBeGreaterThan(100);
    expect(report?.facts).toEqual({ marker: 'x' });
    expect(report?.counters.count).toBe(3);
    expect(report?.verdict.status).toBe('pass');
    expect(rig.probe.updates).toBeGreaterThan(100);
  });

  it('bittikten sonra yük güncellenmez ve sayaçlar okunabilir kalır', async () => {
    const rig = makeRig();
    await start(rig, { durationMs: 500, warmupMs: 0 });
    rig.frame(60);
    expect(rig.runtime.state).toBe('finished');
    const updates = rig.probe.updates;
    rig.frame(10);
    expect(rig.probe.updates).toBe(updates);
    expect(rig.runtime.metrics().counters.count).toBe(3);
  });

  it('gözlem kipinde start reddedilir', async () => {
    const rig = makeRig({ observeOnly: true });
    const result = await start(rig);
    expect(result).toMatchObject({ ok: false, error: { code: 'observe-only' } });
    expect(rig.runtime.state).toBe('observing');
  });

  it('bilinmeyen yük, bozuk parametre ve meşgul durum açık kodla reddedilir', async () => {
    const rig = makeRig();
    expect(await start(rig, { workload: 'nope' })).toMatchObject({
      ok: false,
      error: { code: 'unknown-workload' },
    });
    expect(await start(rig, { params: { count: 99 } })).toMatchObject({
      ok: false,
      error: { code: 'bad-params' },
    });
    expect(await start(rig, { params: { cnt: 1 } })).toMatchObject({
      ok: false,
      error: { code: 'bad-params' },
    });
    expect(rig.runtime.state).toBe('idle');

    expect(await start(rig)).toMatchObject({ ok: true });
    expect(await start(rig)).toMatchObject({ ok: false, error: { code: 'busy' } });
  });

  it('yük kurulumu fırlatırsa durum failed olur ve hata kaydedilir', async () => {
    const probe: Probe = {
      updates: 0,
      destroyed: 0,
      acts: [],
      failUpdateAt: -1,
      invariantOk: true,
    };
    const rig = makeRig({
      workloads: [
        workload(probe, {
          create: () => Promise.reject(new Error('doku yüklenemedi')),
        }),
      ],
    });
    const result = await start(rig);
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'start-failed', message: 'doku yüklenemedi' },
    });
    expect(rig.runtime.state).toBe('failed');
    expect(rig.runtime.status().lastError?.code).toBe('start-failed');
    expect(rig.log.counts.error).toBe(1);
  });

  it('update hata fırlatırsa kare döngüsü sürer, yük bir kez kaydedilir ve yargı fail olur', async () => {
    const rig = makeRig();
    rig.probe.failUpdateAt = 5;
    await start(rig, { durationMs: 2000, warmupMs: 0 });
    rig.frame(150);
    expect(rig.runtime.state).toBe('finished');
    expect(rig.probe.updates).toBe(5);
    expect(rig.log.counts.error).toBe(1);
    const report = rig.runtime.last;
    expect(report?.verdict.status).toBe('fail');
    expect(report?.verdict.checks.find((check) => check.id === 'invariant.update-ok')?.status).toBe(
      'fail',
    );
    expect(report?.run.errors).toBe(1);
  });

  it('yükün değişmezi bozulursa yargı fail olur', async () => {
    const rig = makeRig();
    rig.probe.invariantOk = false;
    await start(rig, { durationMs: 2000, warmupMs: 0 });
    rig.frame(150);
    expect(rig.runtime.last?.verdict.status).toBe('fail');
  });

  it('stop sürmekte olan koşuyu elle bitirir; bitmiş koşuda son raporu verir; boştayken reddeder', async () => {
    const rig = makeRig();
    expect(rig.runtime.stop()).toMatchObject({ ok: false, error: { code: 'not-running' } });
    await start(rig, { durationMs: 60_000, warmupMs: 0 });
    rig.frame(30);
    const stopped = rig.runtime.stop();
    expect(stopped.ok && stopped.data.stoppedBy).toBe('manual');
    const again = rig.runtime.stop();
    expect(again.ok && again.data.runId).toBe(1);
  });

  it('nöbetçi: kareler durursa koşu watchdog ile biter ve inconclusive çıkar', async () => {
    const rig = makeRig();
    await start(rig, { durationMs: 1000, warmupMs: 0 });
    rig.frame(5);
    rig.runtime.sample();
    expect(rig.runtime.state).toBe('running');
    rig.advance(1000 + 3000 + 1); // kare gelmeden süre ve nöbetçi payı geçer
    rig.runtime.sample();
    expect(rig.runtime.state).toBe('finished');
    expect(rig.runtime.last?.stoppedBy).toBe('watchdog');
    expect(rig.runtime.last?.verdict.status).toBe('inconclusive');
    expect(rig.runtime.last?.verdict.reasons.join(' ')).toContain('kare sayısı yetersiz');
  });

  it('waitFinished bitişi bekler ve zaman aşımında null döner', async () => {
    const rig = makeRig();
    expect(await rig.runtime.waitFinished(5)).toBeNull();
    await start(rig, { durationMs: 500, warmupMs: 0 });
    const waiting = rig.runtime.waitFinished(1000);
    rig.frame(60);
    const report = await waiting;
    expect(report?.runId).toBe(1);
    expect(await rig.runtime.waitFinished(5)).toBe(report);
  });

  it('eylem: şemaya göre doğrular, bilinmeyeni ve yük yokluğunu reddeder', async () => {
    const rig = makeRig();
    expect(rig.runtime.action('setCount', { count: 4 })).toMatchObject({
      ok: false,
      error: { code: 'no-workload' },
    });
    await start(rig);
    expect(rig.runtime.action('yok', {})).toMatchObject({
      ok: false,
      error: { code: 'unknown-action' },
    });
    expect(rig.runtime.action('setCount', { count: 99 })).toMatchObject({
      ok: false,
      error: { code: 'bad-args' },
    });
    expect(rig.runtime.action('setCount', { adet: 3 })).toMatchObject({
      ok: false,
      error: { code: 'bad-args' },
    });
    expect(rig.runtime.action('setCount', { count: 4 })).toEqual({
      ok: true,
      data: { done: true },
    });
    expect(rig.probe.acts).toEqual([{ count: 4 }]);
  });

  it('reset yükü söker, durumu boşa alır ve günlüğü korur', async () => {
    const rig = makeRig();
    await start(rig);
    rig.frame(5);
    rig.runtime.reset();
    expect(rig.runtime.state).toBe('idle');
    expect(rig.probe.destroyed).toBe(1);
    expect(rig.runtime.status().workload).toBeNull();
    expect(rig.log.since(0, 100, 'debug').records.some((record) => record.ev === 'reset')).toBe(
      true,
    );
  });

  it('rejudge: donanım şartı yazılım dışı çizicide yargıyı inconclusive yapar, ölçüm değişmez', async () => {
    const rig = makeRig();
    expect(rig.runtime.rejudge({}, null)).toBeNull();
    await start(rig, { durationMs: 500, warmupMs: 0 });
    rig.frame(60);
    const before = rig.runtime.last?.frame;
    const strict = rig.runtime.rejudge({ requireHardware: true }, null);
    expect(strict?.status).toBe('inconclusive');
    expect(strict?.reasons.join(' ')).toContain('donanım');
    expect(rig.runtime.last?.frame).toBe(before);
  });

  it('sample günlüğe saniyelik örnek yazar; ölçüm yokken sessizdir', async () => {
    const rig = makeRig();
    rig.runtime.sample();
    expect(
      rig.log.since(0, 100, 'debug').records.filter((record) => record.ev === 'sample'),
    ).toHaveLength(0);
    await start(rig, { durationMs: 5000, warmupMs: 0 });
    rig.frame(10);
    rig.runtime.sample();
    const sample = rig.log.since(0, 100, 'debug').records.find((record) => record.ev === 'sample');
    expect(sample?.data).toMatchObject({ phase: 'running', frames: 10 });
  });

  it('çizici türü bildirilmediyse ölçülemeyen olarak yazılır', async () => {
    const rig = makeRig({ renderer: false });
    await start(rig, { durationMs: 3000, warmupMs: 0 });
    rig.frame(200);
    expect(rig.runtime.last?.verdict.unmeasured).toContain('renderer');
  });

  it('GPU örnekleri yalnız ölçüm penceresinde toplanır ve rapora girer', async () => {
    const rig = makeRig();
    const sample = (durationMs: number): void =>
      gpu.timers[0].options.onSample({ frameId: 1, status: 'ready', durationMs });
    await start(rig, { durationMs: 500, warmupMs: 200 });
    sample(9); // ısınmada: sayılmaz
    rig.frame(15);
    expect(rig.runtime.state).toBe('running');
    sample(2);
    sample(4);
    rig.frame(60);
    const gpuSummary = rig.runtime.last?.gpu;
    expect(gpuSummary).toMatchObject({ status: 'ready', samples: 2 });
    expect(gpuSummary?.p95Ms).toBe(4);
  });

  it('GPU zamanlayıcısı örnek vermezse ölçülemeyen olarak yazılır', async () => {
    const rig = makeRig({ glRenderer: 'ANGLE (NVIDIA GeForce RTX 3050, Direct3D11)' });
    await start(rig, { durationMs: 3000, warmupMs: 0 });
    rig.frame(200);
    expect(rig.runtime.last?.gpu.samples).toBe(0);
    expect(rig.runtime.last?.verdict.unmeasured).toContain('gpu');
  });

  it('GPU bağlamı kaybolursa neden rapora geçer', async () => {
    const rig = makeRig();
    await start(rig, { durationMs: 3000, warmupMs: 0 });
    gpu.timers[0].options.onSample({ frameId: 1, status: 'context-lost', durationMs: null });
    rig.frame(200);
    expect(rig.runtime.last?.gpu.status).toBe('context-lost');
  });

  it('destroy bütün Phaser dinleyicilerini söker', () => {
    const rig = makeRig();
    expect(rig.events.count('prestep')).toBe(1);
    rig.runtime.destroy();
    for (const event of ['prestep', 'prerender', 'postrender'])
      expect(rig.events.count(event)).toBe(0);
  });
});
