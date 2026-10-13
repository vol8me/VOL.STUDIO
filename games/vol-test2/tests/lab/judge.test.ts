import { describe, expect, it } from 'vitest';
import { buildEnvironment, type Environment } from '../../src/lab/environment';
import {
  BUDGETS,
  REGRESSION,
  judge,
  type Baseline,
  type GpuSummary,
  type JudgeInput,
} from '../../src/lab/judge';
import type { FrameSummary, Summary } from '../../src/lab/probe';

const summary = (value: number): Summary => ({
  count: 500,
  mean: value,
  p50: value,
  p95: value,
  p99: value,
  max: value,
});

function frame(overrides: Partial<FrameSummary> = {}): FrameSummary {
  return {
    frames: 600,
    stalls: 0,
    fps: 60,
    intervalMs: summary(16.7),
    workMs: summary(3),
    updateMs: summary(1),
    renderMs: summary(2),
    longFrames: { over33: 0, over50: 0, over100: 0 },
    ...overrides,
  };
}

function env(renderer: string | null, hz: number | null = 60): Environment {
  return buildEnvironment({
    userAgent: 'Chrome/140',
    platform: 'Win32',
    dpr: 1,
    viewport: { width: 1280, height: 800 },
    hardwareConcurrency: 8,
    deviceMemoryGb: null,
    visibility: 'visible',
    gl:
      renderer === null
        ? null
        : { version: 2, vendor: 'v', renderer, maxTextureSize: 4096, masked: false },
    rafMedianMs: hz === null ? null : 1000 / hz,
    capturedAt: 't',
  });
}

const GPU_READY: GpuSummary = { status: 'ready', samples: 200, p95Ms: 2 };
const GPU_NONE: GpuSummary = { status: 'unsupported', samples: 0, p95Ms: null };

function input(overrides: Partial<JudgeInput> = {}): JudgeInput {
  return {
    workload: 'svg-sprites',
    paramsKey: 'count=100',
    env: env('NVIDIA GeForce RTX'),
    renderer: { kind: 'webgl', fellBack: false },
    frame: frame(),
    gpu: GPU_READY,
    run: { hiddenDuringRun: false, errors: 0, elapsedMs: 10_000 },
    invariants: [],
    ...overrides,
  };
}

const ids = (verdict: ReturnType<typeof judge>, status: string): string[] =>
  verdict.checks.filter((check) => check.status === status).map((check) => check.id);

describe('judge', () => {
  it('her şey bütçe içindeyse donanımda pass verir', () => {
    const verdict = judge(input());
    expect(verdict.status).toBe('pass');
    expect(verdict.scope).toBe('hardware');
    expect(verdict.reasons).toEqual([]);
    expect(verdict.unmeasured).toEqual([]);
    expect(ids(verdict, 'fail')).toEqual([]);
  });

  it('CPU işi bütçeyi aşarsa fail verir ve hangi denetimin düştüğünü söyler', () => {
    const verdict = judge(
      input({ frame: frame({ workMs: summary(BUDGETS.hardware.workP95Ms + 1) }) }),
    );
    expect(verdict.status).toBe('fail');
    expect(ids(verdict, 'fail')).toContain('frame.work.p95');
    const check = verdict.checks.find((c) => c.id === 'frame.work.p95');
    expect(check).toMatchObject({ observed: 9, limit: 8 });
  });

  it('GPU zamanlayıcısı yoksa pass vermez gibi davranmaz ama yargıyı da bozmaz: unmeasured yazar', () => {
    const verdict = judge(input({ gpu: GPU_NONE }));
    expect(verdict.status).toBe('pass');
    expect(verdict.unmeasured).toContain('gpu');
    expect(verdict.checks.find((c) => c.id === 'gpu.p95')?.status).toBe('skip');
  });

  it('GPU süresi bütçeyi aşarsa fail', () => {
    const verdict = judge(input({ gpu: { status: 'ready', samples: 100, p95Ms: 14 } }));
    expect(verdict.status).toBe('fail');
    expect(ids(verdict, 'fail')).toEqual(['gpu.p95']);
  });

  it('kare yetmezse inconclusive; kare denetimleri atlanır', () => {
    const verdict = judge(input({ frame: frame({ frames: 10 }) }));
    expect(verdict.status).toBe('inconclusive');
    expect(verdict.reasons[0]).toContain('kare sayısı yetersiz');
    expect(verdict.checks.some((c) => c.id === 'frame.work.p95')).toBe(false);
  });

  it('kare yetmese bile hata ve değişmez ihlali fail verir', () => {
    const verdict = judge(
      input({
        frame: frame({ frames: 5 }),
        run: { hiddenDuringRun: false, errors: 2, elapsedMs: 100 },
        invariants: [{ id: 'lockstep', ok: false, detail: 'desynced' }],
      }),
    );
    expect(verdict.status).toBe('fail');
    expect(ids(verdict, 'fail')).toEqual(['run.errors', 'invariant.lockstep']);
  });

  it('sekme gizliydiyse inconclusive', () => {
    const verdict = judge(input({ run: { hiddenDuringRun: true, errors: 0, elapsedMs: 1000 } }));
    expect(verdict.status).toBe('inconclusive');
    expect(verdict.reasons.join()).toContain('gizliydi');
  });

  it('yazılım çizici kendi bütçesiyle yargılanır; kapsamı yazılır, FPS ve GPU atlanır', () => {
    const verdict = judge(
      input({
        env: env('ANGLE (Google, Vulkan, SwiftShader Device)'),
        frame: frame({ fps: 12, workMs: summary(30), intervalMs: summary(80) }),
        gpu: GPU_NONE,
      }),
    );
    expect(verdict.scope).toBe('software');
    expect(verdict.status).toBe('pass');
    expect(verdict.checks.find((c) => c.id === 'frame.fps')?.status).toBe('skip');
    expect(verdict.checks.find((c) => c.id === 'gpu.p95')?.status).toBe('skip');
    expect(verdict.unmeasured).not.toContain('gpu');
  });

  it('requireHardware yazılım çiziciyi inconclusive yapar', () => {
    const verdict = judge(input({ env: env('llvmpipe') }), { requireHardware: true });
    expect(verdict.status).toBe('inconclusive');
    expect(verdict.reasons.join()).toContain('donanım çizici istendi');
  });

  it('tanınmayan çizici sınıfında donanım iddia edilmez: gevşek bütçe, kapsam unknown, sınıf ölçülemeyen', () => {
    const verdict = judge(
      input({
        env: env(null),
        frame: frame({ fps: 12, workMs: summary(30), intervalMs: summary(80) }),
        gpu: GPU_NONE,
      }),
    );
    expect(verdict.scope).toBe('unknown');
    expect(verdict.status).toBe('pass');
    expect(verdict.checks.find((c) => c.id === 'frame.fps')?.status).toBe('skip');
    expect(verdict.unmeasured).toContain('renderer-class');
    expect(judge(input({ env: env(null) }), { requireHardware: true }).status).toBe('inconclusive');
  });

  it('canvas çiziciye düşmek fail; bildirim yoksa unmeasured', () => {
    expect(judge(input({ renderer: { kind: 'canvas', fellBack: true } })).status).toBe('fail');
    const unknown = judge(input({ renderer: null }));
    expect(unknown.unmeasured).toContain('renderer');
    expect(unknown.status).toBe('pass');
  });

  it('yenileme tavanındaki FPS düşüğü ayrıştırılır: tavanda pass, tavan altında fail', () => {
    const lowCap = judge(input({ env: env('GPU', 30), frame: frame({ fps: 30 }) }));
    expect(lowCap.checks.find((c) => c.id === 'frame.fps')).toMatchObject({ status: 'pass' });
    expect(lowCap.checks.find((c) => c.id === 'frame.fps')?.note).toContain('tavan');
    const below = judge(input({ frame: frame({ fps: 40 }) }));
    expect(below.checks.find((c) => c.id === 'frame.fps')?.status).toBe('fail');
  });

  it('duraklama ve uzun kare oranı fail verir', () => {
    expect(judge(input({ frame: frame({ stalls: 1 }) })).status).toBe('fail');
    const long = frame({ longFrames: { over33: 50, over50: 30, over100: 0 } });
    expect(ids(judge(input({ frame: long })), 'fail')).toEqual(['frame.long.ratio']);
  });

  it('ek ölçülemeyenleri yargıya taşır', () => {
    const verdict = judge(input({ extraUnmeasured: ['longtask'] }));
    expect(verdict.unmeasured).toEqual(['longtask']);
  });

  it('bütçe seçenekle ezilebilir', () => {
    const slow = input({ frame: frame({ workMs: summary(10) }) });
    expect(judge(slow).status).toBe('fail');
    expect(judge(slow, { budget: { workP95Ms: 20, workP99Ms: 20 } }).status).toBe('pass');
  });
});

describe('judge: taban çizgi', () => {
  const base: Baseline = {
    workload: 'svg-sprites',
    paramsKey: 'count=100',
    engine: 'chromium',
    rendererClass: 'hardware',
    workP95Ms: 3,
    intervalP99Ms: 17,
  };

  it('oransal ve mutlak eşik birlikte aşılırsa gerileme sayar', () => {
    const limit = Math.max(3 * REGRESSION.ratio, 3 + REGRESSION.minDeltaMs);
    const ok = judge(input({ baseline: base, frame: frame({ workMs: summary(limit - 0.01) }) }));
    expect(ok.status).toBe('pass');
    const bad = judge(input({ baseline: base, frame: frame({ workMs: summary(limit + 0.5) }) }));
    expect(ids(bad, 'fail')).toEqual(['baseline.work.p95']);
  });

  it('küçük tabanda mutlak eşik gürültüyü yutar', () => {
    const tiny = { ...base, workP95Ms: 0.2 };
    const verdict = judge(input({ baseline: tiny, frame: frame({ workMs: summary(0.6) }) }));
    expect(verdict.status).toBe('pass');
  });

  it('başka yük, motor ya da sınıftan taban çizgi karşılaştırılmaz, unmeasured yazar', () => {
    for (const other of [
      { ...base, workload: 'factory-local' },
      { ...base, paramsKey: 'count=999' },
      { ...base, engine: 'webkit' as const },
      { ...base, rendererClass: 'software' as const },
    ]) {
      const verdict = judge(input({ baseline: other, frame: frame({ workMs: summary(7) }) }));
      expect(verdict.unmeasured).toContain('baseline');
      expect(verdict.checks.find((c) => c.id === 'baseline.work.p95')?.status).toBe('skip');
      expect(verdict.status).toBe('pass');
    }
  });
});
