import { describe, expect, it } from 'vitest';
import { substrateConfig } from '@/config/substrate';
import { defaultHarnessConfig } from '@/../scripts/morphology/harness';
import { measureCalibration } from '@/../scripts/morphology/calibration';
import {
  CONFIRMATION_THRESHOLD_MS,
  FUNNEL_COMMANDS,
  FunnelRefusal,
  assertRunnable,
  formatPreflight,
  planCommand,
  stagesRunBy,
  type Calibration,
  type FunnelOptions,
  type FunnelStages,
} from '@/../scripts/morphology/funnel';

/*
 * E13: huni yeniden kilitlendi. Testler üç şeyi ayrı ayrı sınar — preflight
 * çıktısı, uzun koşunun açık onay istemesi, ve hiçbir komutun önceki aşamayı
 * örtük koşmaması.
 */
const stages: FunnelStages = {
  seeding: defaultHarnessConfig.seeding,
  broad: defaultHarnessConfig.broad,
  refinement: defaultHarnessConfig.refinement,
  qualification: defaultHarnessConfig.qualification,
  canary: defaultHarnessConfig.canary,
};

const FAST: Calibration = { msPerTick: 0.001, particleCount: 512, measuredAtMs: 0 };
const SLOW: Calibration = { msPerTick: 1, particleCount: 512, measuredAtMs: 0 };

function options(overrides: Partial<FunnelOptions> = {}): FunnelOptions {
  return {
    command: 'broad',
    candidateCount: 4,
    workerCount: 1,
    outputDir: '/tmp/vol-life-out',
    yes: false,
    ...overrides,
  };
}

describe('Huni komutları (E13)', () => {
  it('on komut vardır ve `all` yoktur', () => {
    expect(FUNNEL_COMMANDS).toHaveLength(10);
    expect(FUNNEL_COMMANDS).toContain('calibrate');
    expect(FUNNEL_COMMANDS).toContain('canary');
    expect([...FUNNEL_COMMANDS] as string[]).not.toContain('all');
  });

  /* Örtük yeniden koşu yok: bir komut yalnız kendi aşamasını koşar. */
  it('hiçbir komut önceki aşamayı içermez', () => {
    for (const command of FUNNEL_COMMANDS) {
      expect(stagesRunBy(command)).toEqual([command]);
    }
  });

  it('preflight aday, seed, tick, worker ve süreyi yazar', () => {
    const plan = planCommand(options({ calibration: FAST }), stages);
    const text = formatPreflight(plan);

    expect(text).toContain('aday: 4');
    expect(text).toContain(`seed: ${stages.broad.seedCount}`);
    expect(text).toContain(`tick: ${stages.broad.tickCount}`);
    expect(text).toContain('worker: 1');
    expect(text).toContain('tahmini süre');
  });

  it('kalibrasyon yoksa süre uydurulmaz', () => {
    const plan = planCommand(options(), stages);

    expect(plan.estimatedMs).toBeUndefined();
    expect(formatPreflight(plan)).toContain('KALİBRASYON YOK');
  });

  it('worker sayısı tahmini böler', () => {
    const single = planCommand(options({ calibration: SLOW, workerCount: 1 }), stages);
    const quad = planCommand(options({ calibration: SLOW, workerCount: 4 }), stages);

    expect(quad.estimatedMs).toBeCloseTo((single.estimatedMs ?? 0) / 4, 6);
  });

  it('karar adımları tick harcamaz', () => {
    for (const command of ['audition', 'shortlist', 'accept', 'promote'] as const) {
      expect(planCommand(options({ command }), stages).totalTicks).toBe(0);
    }
  });
});

describe('Huni korumaları (E13)', () => {
  it('çıktı dizini olmadan koşu reddedilir', () => {
    const plan = planCommand(options({ outputDir: undefined, calibration: FAST }), stages);

    expect(() =>
      assertRunnable(plan, options({ outputDir: undefined, calibration: FAST })),
    ).toThrow(FunnelRefusal);
  });

  it('10 dakikayı aşan koşu --yes ister', () => {
    const opts = options({ calibration: SLOW, command: 'qualify', candidateCount: 4 });
    const plan = planCommand(opts, stages);

    expect(plan.estimatedMs).toBeGreaterThan(CONFIRMATION_THRESHOLD_MS);
    expect(() => assertRunnable(plan, opts)).toThrow(FunnelRefusal);
    expect(() => assertRunnable(plan, { ...opts, yes: true })).not.toThrow();
  });

  it('kısa koşu onay istemez', () => {
    const opts = options({ calibration: FAST, command: 'broad', candidateCount: 1 });
    const plan = planCommand(opts, stages);

    expect(plan.estimatedMs).toBeLessThan(CONFIRMATION_THRESHOLD_MS);
    expect(() => assertRunnable(plan, opts)).not.toThrow();
  });

  it('kalibrasyonsuz simülasyon koşusu da onay ister', () => {
    const opts = options({ command: 'broad' });
    const plan = planCommand(opts, stages);

    expect(() => assertRunnable(plan, opts)).toThrow(FunnelRefusal);
  });

  /* Karar ASLA uydurulmaz: `accept` açık karar olmadan koşmaz. */
  it('accept açık karar olmadan reddedilir', () => {
    const opts = options({ command: 'accept' });
    const plan = planCommand(opts, stages);

    expect(() => assertRunnable(plan, opts)).toThrow(FunnelRefusal);
    expect(() => assertRunnable(plan, { ...opts, decision: 'accepted' })).not.toThrow();
  });
});

describe('Kalibrasyon (E13)', () => {
  it('tick maliyeti gerçekten ölçülür', () => {
    const small = {
      ...substrateConfig,
      particles: { ...substrateConfig.particles, capacity: 32 },
    };

    const calibration = measureCalibration(small, 120);

    expect(calibration.msPerTick).toBeGreaterThan(0);
    expect(calibration.particleCount).toBeGreaterThan(0);
    expect(calibration.measuredAtMs).toBeGreaterThan(0);
  }, 60_000);
});
