import { describe, expect, it } from 'vitest';
import { serializeSubstrateCandidate } from '@/config/candidate';
import { substrateConfig } from '@/config/substrate';
import { defaultClusterConfig } from '../../scripts/morphology/clusterTracker';
import { defaultMetricsConfig } from '../../scripts/morphology/metrics';
import { defaultPhaseConfig } from '../../scripts/morphology/phaseClassifier';
import {
  runLongHorizon,
  type LongRunInput,
  type LongRunSummary,
} from '../../scripts/morphology/longRun';
import { runUnits } from '../../scripts/morphology/workerPool';

/*
 * E17: promotion ÖNCESİ varsayılanın uzun ufuk taban koşusu. Promote edilmiş
 * adayla koşu ikinci turun işidir (K15) ve burada yapılmaz.
 *
 * 4 seed × 30 simüle dakika ölçüldü: tick maliyeti 3,22 ms (512 parçacık),
 * yani seri koşu ~27 dakika sürerdi. Seed'ler E12'nin worker havuzuyla PARALEL
 * koşar; iş bölümü ve birleştirme deterministiktir, sonuç seri koşuyla aynıdır.
 */
const SEEDS = [1, 2, 3, 4];
const MINUTES = 30;
const HZ = 60;
/** Dakikada bir örnek; 30 dakikalık koşuda 30 örnek. */
const SAMPLE_TICKS = 60 * HZ;
const RESTORE_MINUTE = 10;
const COST_WINDOW_MINUTES = 5;
/** E17: ilk ve son pencerenin tick maliyeti farkı bunun altında kalmalı. */
const COST_DRIFT_LIMIT = 0.2;

function makeInput(seed: number): LongRunInput {
  return {
    substrate: substrateConfig,
    candidateText: serializeSubstrateCandidate(substrateConfig.candidate),
    seed,
    minutes: MINUTES,
    simulationHz: HZ,
    sampleIntervalTicks: SAMPLE_TICKS,
    restoreAtMinute: RESTORE_MINUTE,
    costWindowMinutes: COST_WINDOW_MINUTES,
    metrics: defaultMetricsConfig,
    cluster: defaultClusterConfig,
    phase: defaultPhaseConfig,
  };
}

describe('E17 — varsayılan adayın uzun ufuk taban koşusu', () => {
  it('4 seed × 30 simüle dakika: sonlu, muhasebeli, restore edilebilir ve maliyeti sabit', async () => {
    const units = SEEDS.map((seed) => ({
      workId: `canary:default:${seed}`,
      input: makeInput(seed),
    }));

    const results = await runUnits(units, SEEDS.length, 'longWorker.mjs', runLongHorizon);
    const summaries: LongRunSummary[] = results.map((result) => result.output);

    // Kanıt ÖNCE yazılır: test düşse bile ölçüm kaydı kalır.
    const table = summaries.map((summary) => ({
      seed: summary.seed,
      koruma: Number(summary.retention.toFixed(3)),
      kümeliMadde: Number(summary.finalClusteredFraction.toFixed(3)),
      ortalamaHız: Number(summary.finalMeanSpeed.toFixed(3)),
      gerekçe: summary.primaryReason,
      hamSapma: Number(summary.costDriftRatio.toFixed(3)),
      parçacıkBaşınaSapma: Number(summary.costPerParticleDriftRatio.toFixed(3)),
      ilkPencereParçacık: summary.firstWindowActiveCount,
      sonPencereParçacık: summary.lastWindowActiveCount,
    }));
    console.log('E17 taban özeti:', JSON.stringify(table));

    for (const summary of summaries) {
      // 1) Bütün değerler sonlu.
      expect(summary.allFinite).toBe(true);
      // 2) Muhasebe değişmezi: aktif + dış rezervuar = başlangıç.
      expect(summary.accountingHeld).toBe(true);
      // 3) 10. dakikada restore edilen kopya 30. dakikada aynı baytı verir.
      expect(summary.restoredFingerprint).toBe(summary.uninterruptedFingerprint);
      expect(summary.restoreMatches).toBe(true);
      /*
       * 4) İlk ve son 5 dakikanın tick maliyeti farkı %20'nin altında.
       *
       * Ölçü PARÇACIK BAŞINADIR. Ham tick maliyeti nüfusla değişir: varsayılan
       * aday 30 dakikada maddesinin yarısını kaybediyor ve tick doğal olarak
       * ucuzluyor (ilk koşuda ham sapma 0,469 ölçüldü, kayıp oranıyla neredeyse
       * birebir). Ölçütün amacı çalışma zamanı bozulmasını yakalamaktır, nüfus
       * düşüşünü değil.
       */
      expect(summary.costPerParticleDriftRatio).toBeLessThan(COST_DRIFT_LIMIT);
    }

    expect(summaries).toHaveLength(SEEDS.length);
    expect(summaries.every((summary) => summary.initialCount > 0)).toBe(true);
  });
});
