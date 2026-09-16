import { describe, expect, it } from 'vitest';
import {
  MIN_CURVATURE_RADIUS_UNITS,
  MIN_SAFE_AREA_RATIO,
  MIN_THROAT_UNITS,
  measureTopology,
} from '../support/habitatTopology';

/*
 * C7'nin TAM korpusu: 1000 seed, hem 256² hem 1024² maske. Birim kapısında
 * dört seedlik alt küme koşar. Seedler sabit ve sürümlüdür; koşu başına
 * yeniden üretilmez, kötü çıkan seed korpustan ÇIKARILMAZ.
 */
const CORPUS = Array.from({ length: 1000 }, (_, index) => (5000 + index * 104_729) >>> 0);

/**
 * Korpus dilimlere bölünür çünkü tek parçada koşan 8,5 dakikalık bir gövde
 * olay döngüsünü hiç bırakmıyor ve vitest raportörü "Timeout calling
 * onTaskUpdate" ile düşüyordu — testin kendisi geçse bile koşum "1 error"
 * bildiriyordu. Dilimleme korpusu KÜÇÜLTMEZ: aynı 1000 seed, aynı iddia.
 */
const SLICE_SIZE = 100;
/**
 * Dilimleme tek başına YETMEDİ: 100 seedlik dilim de ~51 saniye kesintisiz
 * senkron blok demek ve vitest raportörü o blok boyunca `onTaskUpdate`
 * çağrısını tamamlayamıyor ("Timeout calling onTaskUpdate", koşum "1 error"
 * bildiriyor). Kök neden dilim sayısı değil, olay döngüsünün hiç bırakılmaması;
 * ölçüm her on seedde bir döngüyü bırakır. Korpus, iddia ve eşikler aynıdır.
 */
const YIELD_EVERY = 10;

describe('habitat topoloji değişmezleri — 1000 seed korpusu', () => {
  let worstCurvature = Number.POSITIVE_INFINITY;
  let worstThroat = Number.POSITIVE_INFINITY;
  let worstSafeRatio = 1;

  for (let start = 0; start < CORPUS.length; start += SLICE_SIZE) {
    const slice = CORPUS.slice(start, start + SLICE_SIZE);
    it(`seed ${start + 1}–${start + slice.length}: tek bağlı habitat, delik yok`, async () => {
      const failures: string[] = [];
      for (const [index, seed] of slice.entries()) {
        // Ölçüm tamamen senkron; döngü bırakılmazsa raportör RPC'si aç kalır.
        if (index % YIELD_EVERY === 0) await new Promise((resolve) => setImmediate(resolve));
        const report = measureTopology(seed);
        if (report.problems.length > 0) failures.push(`${seed}: ${report.problems.join(', ')}`);
        worstCurvature = Math.min(worstCurvature, report.minCurvatureRadius);
        worstThroat = Math.min(worstThroat, report.minThroat);
        worstSafeRatio = Math.min(worstSafeRatio, report.safeAreaRatio);
      }

      expect(failures).toEqual([]);
    });
  }

  it('korpusun en kötü değerleri ön-kayıtlı sınırların üstünde', () => {
    console.log(
      `[C7] 1000 seed: eğrilik ${worstCurvature.toFixed(1)}, boğaz ${worstThroat.toFixed(1)}, ` +
        `güvenli oran ${(worstSafeRatio * 100).toFixed(2)}%`,
    );

    expect(worstCurvature).toBeGreaterThanOrEqual(MIN_CURVATURE_RADIUS_UNITS);
    expect(worstThroat).toBeGreaterThanOrEqual(MIN_THROAT_UNITS);
    expect(worstSafeRatio).toBeGreaterThanOrEqual(MIN_SAFE_AREA_RATIO);
  });
});
