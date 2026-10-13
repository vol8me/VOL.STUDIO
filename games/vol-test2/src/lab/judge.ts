import type { Engine, Environment, RendererClass } from './environment';
import type { FrameSummary } from './probe';

/**
 * Yargı: ölçümü eşiklerle karşılaştırıp `pass`, `fail` ya da `inconclusive` söyler. `pass` yalnız
 * ölçülen her şey eşik içindeyse verilir; ölçülemeyen (GPU zamanlayıcısı yok, sekme gizliydi, kare
 * yetmedi) `pass`e sayılmaz, `unmeasured` ve `inconclusive` olarak açıkça yazılır. Ajan "geçti"
 * sözünün neye dayandığını `checks` ve `unmeasured`dan okur.
 */

export type VerdictStatus = 'pass' | 'fail' | 'inconclusive';
export type CheckStatus = 'pass' | 'fail' | 'skip';

export interface Check {
  readonly id: string;
  readonly status: CheckStatus;
  readonly observed: number | string | boolean | null;
  readonly limit: number | string | null;
  readonly note: string;
}

export interface Verdict {
  readonly status: VerdictStatus;
  /** Yargının geçerli olduğu çizici sınıfı: yazılım çizicide `pass` donanım için bir şey söylemez. */
  readonly scope: RendererClass;
  readonly checks: readonly Check[];
  /** `inconclusive` nedenleri; boşsa yargı kesindir. */
  readonly reasons: readonly string[];
  /** Ölçülemeyen boyutlar: `gpu`, `renderer`, `longtask`, `baseline`... */
  readonly unmeasured: readonly string[];
}

/** Bir çizici sınıfı için eşikler. */
export interface Budget {
  /** Bundan az kare ölçüldüyse kare tabanlı denetimler atlanır ve yargı `inconclusive` olur. */
  readonly minFrames: number;
  readonly workP95Ms: number;
  readonly workP99Ms: number;
  readonly intervalP99Ms: number;
  /** 0 ise FPS denetlenmez. */
  readonly minFps: number;
  /** 50 ms'yi aşan kare oranı. */
  readonly maxLongRatio: number;
  /** 0 ise GPU süresi denetlenmez. */
  readonly gpuP95Ms: number;
}

/**
 * Başlangıç eşikleri (`docs/lab.md` "Eşikler"): 60 Hz'de kare bütçesi 16,7 ms'dir; CPU işi bunun
 * yarısına sığmalı ki GPU ve tarayıcı payı kalsın. Yazılım çiziciye gevşek, kendi sınıfı verilir:
 * orada kare süresi çizim maliyetinin değil CPU rasterlemenin ölçüsüdür.
 */
export const BUDGETS: Readonly<Record<'hardware' | 'software', Budget>> = {
  hardware: {
    minFrames: 120,
    workP95Ms: 8,
    workP99Ms: 12,
    intervalP99Ms: 25,
    minFps: 55,
    maxLongRatio: 0.01,
    gpuP95Ms: 10,
  },
  software: {
    minFrames: 60,
    workP95Ms: 40,
    workP99Ms: 80,
    intervalP99Ms: 120,
    minFps: 0,
    maxLongRatio: 0.2,
    gpuP95Ms: 0,
  },
};

/** Taban çizgiye göre gerileme sayılan artış: oransal VE mutlak eşik birlikte aşılmalı (gürültü). */
export const REGRESSION = { ratio: 1.25, minDeltaMs: 0.5 } as const;

/** Bir koşunun özeti; sonraki koşuların karşılaştığı taban çizgi. */
export interface Baseline {
  readonly workload: string;
  readonly paramsKey: string;
  readonly engine: Engine;
  readonly rendererClass: RendererClass;
  readonly workP95Ms: number;
  readonly intervalP99Ms: number;
}

export type GpuStatus =
  'ready' | 'unsupported' | 'unavailable' | 'disjoint' | 'context-lost' | 'error' | 'absent';

export interface GpuSummary {
  readonly status: GpuStatus;
  readonly samples: number;
  readonly p95Ms: number | null;
}

/** Yük tarafının kendi değişmezleri: örneğin "kilit adım eşitliği bozulmadı". */
export interface Invariant {
  readonly id: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface JudgeInput {
  readonly workload: string;
  readonly paramsKey: string;
  readonly env: Environment;
  readonly renderer: { readonly kind: string; readonly fellBack: boolean } | null;
  readonly frame: FrameSummary;
  readonly gpu: GpuSummary;
  readonly run: {
    readonly hiddenDuringRun: boolean;
    readonly errors: number;
    readonly elapsedMs: number;
  };
  readonly invariants: readonly Invariant[];
  readonly baseline?: Baseline | null;
  /** Tarayıcıda ölçülemeyen ek boyutlar (`longtask` API'si yok gibi). */
  readonly extraUnmeasured?: readonly string[];
}

export interface JudgeOptions {
  /** Donanım dışı çizicide `pass` yerine `inconclusive` ver (CI olmayan gerçek cihaz kabulü için). */
  readonly requireHardware?: boolean;
  readonly budget?: Partial<Budget>;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function limitCheck(id: string, observed: number, limit: number, note: string): Check {
  return {
    id,
    status: observed <= limit ? 'pass' : 'fail',
    observed: round(observed),
    limit,
    note,
  };
}

function skip(id: string, note: string): Check {
  return { id, status: 'skip', observed: null, limit: null, note };
}

function frameChecks(input: JudgeInput, budget: Budget): Check[] {
  const { frame, env } = input;
  const checks: Check[] = [
    limitCheck(
      'frame.work.p95',
      frame.workMs.p95,
      budget.workP95Ms,
      'CPU işi (güncelleme + çizim hazırlığı), ms',
    ),
    limitCheck('frame.work.p99', frame.workMs.p99, budget.workP99Ms, 'CPU işi en kötü %1, ms'),
    limitCheck(
      'frame.interval.p99',
      frame.intervalMs.p99,
      budget.intervalP99Ms,
      'kare aralığı en kötü %1, ms',
    ),
    limitCheck(
      'frame.long.ratio',
      frame.frames > 0 ? frame.longFrames.over50 / frame.frames : 0,
      budget.maxLongRatio,
      '50 ms üstü kare oranı',
    ),
    limitCheck('frame.stalls', frame.stalls, 0, '1 sn üstü duraklama sayısı'),
  ];
  if (budget.minFps === 0) {
    checks.push(skip('frame.fps', 'bu çizici sınıfında FPS donanımla karşılaştırılamaz'));
  } else {
    const hz = env.refresh.hz;
    const capped = hz !== null && frame.fps >= hz * 0.95;
    checks.push({
      id: 'frame.fps',
      status: capped || frame.fps >= budget.minFps ? 'pass' : 'fail',
      observed: round(frame.fps),
      limit: budget.minFps,
      note: capped
        ? `yenileme tavanında (${hz} Hz): FPS başlık payını söylemez, CPU işine bakın`
        : 'ortalama kare hızı',
    });
  }
  return checks;
}

function gpuCheck(gpu: GpuSummary, budget: Budget, unmeasured: string[]): Check {
  if (budget.gpuP95Ms === 0) return skip('gpu.p95', 'bu çizici sınıfında GPU süresi anlamsız');
  if (gpu.status !== 'ready' || gpu.p95Ms === null || gpu.samples === 0) {
    unmeasured.push('gpu');
    return skip('gpu.p95', `GPU zamanlayıcısı kullanılamadı (${gpu.status})`);
  }
  return limitCheck('gpu.p95', gpu.p95Ms, budget.gpuP95Ms, 'GPU süresi, ms');
}

function baselineChecks(input: JudgeInput, unmeasured: string[]): Check[] {
  const base = input.baseline;
  if (base === undefined || base === null) return [];
  const same =
    base.workload === input.workload &&
    base.paramsKey === input.paramsKey &&
    base.engine === input.env.engine &&
    base.rendererClass === input.env.rendererClass;
  if (!same) {
    unmeasured.push('baseline');
    return [
      skip('baseline.work.p95', 'taban çizgi başka yük, parametre, motor ya da çizici sınıfından'),
    ];
  }
  const now = input.frame.workMs.p95;
  const limit = Math.max(base.workP95Ms * REGRESSION.ratio, base.workP95Ms + REGRESSION.minDeltaMs);
  return [
    limitCheck(
      'baseline.work.p95',
      now,
      round(limit),
      `taban ${round(base.workP95Ms)} ms; ${REGRESSION.ratio}x ve +${REGRESSION.minDeltaMs} ms aşılırsa gerileme`,
    ),
  ];
}

export function judge(input: JudgeInput, options: JudgeOptions = {}): Verdict {
  const scope = input.env.rendererClass;
  const budget: Budget = {
    ...BUDGETS[scope === 'software' ? 'software' : 'hardware'],
    ...options.budget,
  };
  const checks: Check[] = [];
  const reasons: string[] = [];
  const unmeasured: string[] = [...(input.extraUnmeasured ?? [])];

  checks.push(limitCheck('run.errors', input.run.errors, 0, 'sayfa/konsol hatası'));
  for (const invariant of input.invariants) {
    checks.push({
      id: `invariant.${invariant.id}`,
      status: invariant.ok ? 'pass' : 'fail',
      observed: invariant.ok,
      limit: null,
      note: invariant.detail,
    });
  }
  if (input.renderer === null) {
    unmeasured.push('renderer');
    checks.push(skip('renderer.fellBack', 'çizici türü henüz bildirilmedi'));
  } else {
    checks.push({
      id: 'renderer.fellBack',
      status: input.renderer.fellBack ? 'fail' : 'pass',
      observed: input.renderer.kind,
      limit: null,
      note: 'WebGL kurulamayıp canvas çiziciye düşülmedi',
    });
  }

  if (input.run.hiddenDuringRun)
    reasons.push('sekme koşu sırasında gizliydi; rAF durur, ölçüm geçersiz');
  if (input.frame.frames < budget.minFrames) {
    reasons.push(`kare sayısı yetersiz: ${input.frame.frames} < ${budget.minFrames}`);
    checks.push(skip('frame.enough', 'kare tabanlı denetimler atlandı'));
  } else {
    checks.push(...frameChecks(input, budget));
    checks.push(gpuCheck(input.gpu, budget, unmeasured));
    checks.push(...baselineChecks(input, unmeasured));
  }
  if (options.requireHardware === true && scope !== 'hardware')
    reasons.push(`donanım çizici istendi, bulunan sınıf: ${scope}`);

  const failed = checks.some((check) => check.status === 'fail');
  const status: VerdictStatus = failed ? 'fail' : reasons.length > 0 ? 'inconclusive' : 'pass';
  return { status, scope, checks, reasons, unmeasured: [...new Set(unmeasured)] };
}
