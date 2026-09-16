import { describe, expect, it } from 'vitest';
import { substrateConfig } from '@/config/substrate';
import { LifeWorld } from '@/runtime/sim/LifeWorld';
import type { PairForceKernel } from '@/runtime/sim/PairForceKernel';
import { createExplicitWorldMetadata } from '@/runtime/sim/WorldMetadata';
import { ClusterTracker, defaultClusterConfig } from '../../scripts/morphology/clusterTracker';
import { MorphologyMetrics, defaultMetricsConfig } from '../../scripts/morphology/metrics';
import {
  PhaseClassifier,
  defaultPhaseConfig,
  type PhaseClassification,
} from '../../scripts/morphology/phaseClassifier';

/*
 * E11: gerekçe kodları GERÇEK FİZİKLE de üretilir. Sentetik seriler
 * `tests/morphology/phaseClassifier.test.ts`te; burada kodu üreten mikro
 * dünyalar var. `MICRO_ORBIT_PERSISTENT` E8'in, `STARTUP_MASSACRE` E9'un uzun
 * testinde gerçek fizikle zaten üretiliyor, burada tekrarlanmaz.
 *
 * Uzun testte durur çünkü §8.4'ün süre kuralları 60 sn ve 5 dk ister; bu
 * birim kapısının 5 saniyelik sınırının çok üstündedir. Timeout BÜYÜTÜLMEDİ.
 */
const CENTER = 512;
const SAMPLE_TICKS = 10;
const HZ = 60;

function attraction(strength: number, cutoff = 96): PairForceKernel {
  return { cutoffUnits: cutoff, magnitude: (d) => (d > 0 && d < cutoff ? strength : 0) };
}

interface FixtureOptions {
  readonly count: number;
  readonly spreadUnits: number;
  readonly seconds: number;
  readonly forceScale?: number;
  readonly damping?: number;
  readonly kernel?: PairForceKernel;
  /** Verilen tick'te maddenin %97'si MUHASEBELİ olarak düşürülür. */
  readonly accountedKillTick?: number;
}

function runFixture(options: FixtureOptions): PhaseClassification {
  const dynamics = substrateConfig.candidate.physics.dynamics;
  const config = {
    ...substrateConfig,
    candidate: {
      ...substrateConfig.candidate,
      physics: {
        ...substrateConfig.candidate.physics,
        dynamics: {
          ...dynamics,
          forceScale: options.forceScale ?? dynamics.forceScale,
          dampingPerReferenceTick: options.damping ?? dynamics.dampingPerReferenceTick,
        },
      },
    },
  };
  const world = new LifeWorld(
    config,
    createExplicitWorldMetadata(11),
    options.kernel ? { kernel: options.kernel } : undefined,
  );
  for (let slot = 0; slot < world.particles.capacity; slot++) world.particles.deactivateSlot(slot);
  let seed = 7;
  const random = (): number => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let index = 0; index < options.count; index++) {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * options.spreadUnits;
    world.particles.activateSlot(
      CENTER + Math.cos(angle) * radius,
      CENTER + Math.sin(angle) * radius,
      0,
      0,
      index % 3,
    );
  }
  const initialActive = world.particles.activeCount;
  const maxSpeed = config.candidate.physics.dynamics.maxSpeedUnitsPerReferenceTick;
  const metrics = new MorphologyMetrics({
    ...defaultMetricsConfig,
    sampleIntervalTicks: SAMPLE_TICKS,
    maxSpeedUnitsPerReferenceTick: maxSpeed,
  });
  const tracker = new ClusterTracker({
    ...defaultClusterConfig,
    sampleIntervalTicks: SAMPLE_TICKS,
    minContinuityTicks: 0,
  });

  for (let tick = 0; tick < options.seconds * HZ; tick++) {
    world.step();
    if (options.accountedKillTick !== undefined && tick === options.accountedKillTick) {
      let killed = 0;
      for (let slot = 0; slot < world.particles.capacity; slot++) {
        if (killed >= initialActive * 0.97) break;
        if (world.particles.active[slot] === 1) {
          world.particles.deactivateSlot(slot);
          world.reservoir.recordVoidLoss(1);
          killed++;
        }
      }
    }
    if (tick % SAMPLE_TICKS === 0) {
      tracker.update(world.particles, tick);
      metrics.sample(
        world.particles,
        world.domain,
        tick,
        world.reservoir.voidLossTotal,
        tracker.activeClusters,
      );
    }
  }

  return new PhaseClassifier({
    ...defaultPhaseConfig,
    sampleIntervalTicks: SAMPLE_TICKS,
    maxSpeedUnitsPerReferenceTick: maxSpeed,
  }).classify(metrics.timeSeries, initialActive);
}

describe('E11 — gerekçe kodları gerçek fizikte', () => {
  it('DEAD: muhasebeli madde çıkarma', () => {
    const verdict = runFixture({
      count: 64,
      spreadUnits: 60,
      seconds: 30,
      accountedKillTick: 600,
    });

    expect(verdict.primary).toBe('DEAD');
    expect(verdict.reasons).toContain('DEAD');
  });

  it('STASIS: kuvvet yok denecek kadar küçük, sönüm hızı yiyor', () => {
    // Kuvvet ölçeği SIFIR olamaz (yapılandırma pozitif ister); ölçülebilir en
    // küçük pozitif değer kullanıldı.
    const verdict = runFixture({
      count: 64,
      spreadUnits: 60,
      seconds: 70,
      forceScale: 1e-6,
      damping: 0.9,
    });

    expect(verdict.primary).toBe('STASIS');
    expect(verdict.reasons).toEqual(['STASIS']);
  });

  it('SPEED_CAP_CHAOS: dev kuvvet ölçeği parçacıkları tavana yapıştırır', () => {
    const verdict = runFixture({ count: 64, spreadUnits: 60, seconds: 70, forceScale: 50 });

    expect(verdict.primary).toBe('SPEED_CAP_CHAOS');
    expect(verdict.reasons).toEqual(['SPEED_CAP_CHAOS']);
  });

  it('SINGLE_COLLAPSE: güçlü çekim maddeyi tek kümeye toplar', () => {
    const verdict = runFixture({
      count: 64,
      spreadUnits: 60,
      seconds: 310,
      kernel: attraction(0.02),
      damping: 1,
    });

    expect(verdict.primary).toBe('SINGLE_COLLAPSE');
    expect(verdict.reasons).toEqual(['SINGLE_COLLAPSE']);
  });

  /*
   * ÖLÇÜLEN KISIT: bu substratta 5 dakika boyunca MADDEYİ KORUYAN bir gaz
   * zorunlu olarak yavaştır, yani aynı zamanda STASIS'tir. Habitatta duvar
   * yoktur; hareket eden parçacık er geç kıyıya varıp ölür. Bağlı hareket
   * denendi ve olmadı: çekim varsa parçacıklar kümeleniyor (küme payı 0,96),
   * zayıf çekimde maddenin %60'ı kıyıyı geçiyor. Bu yüzden fixture GAS'ı
   * üretir ama birincil gerekçe STASIS'tir — gizlenmedi, ölçülen budur.
   */
  it('GAS: itici kernel maddeyi dağıtır, kümeli madde eşiğin altına iner', () => {
    const verdict = runFixture({
      count: 64,
      spreadUnits: 200,
      seconds: 310,
      kernel: attraction(-0.0008),
      damping: 0.99,
    });

    expect(verdict.reasons).toContain('GAS');
    expect(verdict.reasons).toContain('STASIS');
    expect(verdict.primary).toBe('STASIS');
  });
});
