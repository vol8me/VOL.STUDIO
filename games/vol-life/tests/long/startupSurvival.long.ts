import { describe, expect, it } from 'vitest';
import { substrateConfig } from '@/config/substrate';
import { LifeWorld } from '@/runtime/sim/LifeWorld';
import { createExplicitWorldMetadata } from '@/runtime/sim/WorldMetadata';
import {
  defaultStartupGate,
  evaluateStartupSurvival,
  measureStartupSurvival,
  sampleStartupSeries,
  type StartupMetrics,
} from '../../scripts/morphology/startupSurvival';

/*
 * E9: kapının GERÇEKTEN ayırt ettiğinin kanıtı. Aynı kapı nesnesi, aynı ölçüm
 * hattı, iki uç yapılandırma — sonuçlar zıt olmalı.
 *
 * Uzun testte durur çünkü 24 gerçek koşu × 60 simüle saniye birim kapısının 5
 * saniyelik sınırının çok üstünde; timeout BÜYÜTÜLMEDİ, test taşındı (E8
 * presedansı).
 *
 * Seed sayısı 12'dir: §8.4'ün "en kötü ondalık dilim" satırı 10'un altında
 * anlamsızdır (nearest-rank ondalık dilim minimuma çöker).
 */
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const HZ = 60;
const SECONDS = 60;
const SAMPLE_TICKS = 6;

/** Zayıf kuvvet, yüksek sönüm, başlangıç hızı sıfır. */
function gentleConfig(): typeof substrateConfig {
  return {
    ...substrateConfig,
    candidate: {
      ...substrateConfig.candidate,
      physics: {
        ...substrateConfig.candidate.physics,
        dynamics: {
          ...substrateConfig.candidate.physics.dynamics,
          forceScale: 0.005,
          dampingPerReferenceTick: 0.85,
        },
      },
      seeding: { ...substrateConfig.candidate.seeding, initialSpeedUnitsPerReferenceTick: 0 },
    },
  };
}

/* Örnekleyici olay döngüsünü bırakır (gerekçesi modülde); bu yüzden await'li. */
async function corpus(config: typeof substrateConfig): Promise<StartupMetrics[]> {
  const metrics: StartupMetrics[] = [];
  for (const seed of SEEDS) {
    const world = new LifeWorld(config, createExplicitWorldMetadata(seed));
    const series = await sampleStartupSeries(world, {
      seed,
      maxSpeed: config.candidate.physics.dynamics.maxSpeedUnitsPerReferenceTick,
      seconds: SECONDS,
      simulationHz: HZ,
      sampleIntervalTicks: SAMPLE_TICKS,
    });
    metrics.push(measureStartupSurvival(series));
  }
  return metrics;
}

describe('E9 — başlangıç sağkalımı kapısı gerçek fizikte', () => {
  it('bugünkü varsayılan aday sağkalım satırından kalır (STARTUP_MASSACRE)', async () => {
    const verdict = evaluateStartupSurvival(await corpus(substrateConfig));

    expect(verdict.startupMassacre).toBe(true);
    expect(verdict.initialSurvival).toBe(false);
    expect(verdict.passed).toBe(false);
    // Transient satırı da ayırt ediyor: seed'lerin bir kısmı 60 sn'de rejime girmiyor.
    expect(verdict.transientSettling).toBe(false);
    // Kayıp marjinal değil: 10 sn medyanı eşiğin belirgin altında.
    expect(verdict.retention10Median).toBeLessThan(defaultStartupGate.retention10MedianMin);
    expect(verdict.retention30Median).toBeLessThan(defaultStartupGate.retention30MedianMin);
  });

  it('zayıf kuvvetli, yüksek sönümlü, sıfır başlangıç hızlı yapılandırma sağkalımı geçer', async () => {
    const verdict = evaluateStartupSurvival(await corpus(gentleConfig()));

    expect(verdict.initialSurvival).toBe(true);
    expect(verdict.startupMassacre).toBe(false);
    // Ölçüldü: bu yapılandırma üç satırın da altından geçiyor.
    expect(verdict.passed).toBe(true);
    expect(verdict.transientSettling).toBe(true);
    expect(verdict.retention10Median).toBeGreaterThanOrEqual(
      defaultStartupGate.retention10MedianMin,
    );
    expect(verdict.retention10WorstDecile).toBeGreaterThanOrEqual(
      defaultStartupGate.retention10WorstDecileMin,
    );
    expect(verdict.retention30Median).toBeGreaterThanOrEqual(
      defaultStartupGate.retention30MedianMin,
    );
    // Erken patlama da ayrışır: sıfır başlangıç hızında tavana kimse değmez.
    expect(verdict.earlyBurstFailureFraction).toBe(0);
  });
});
