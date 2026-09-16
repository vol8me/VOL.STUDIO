import { describe, expect, it } from 'vitest';
import { buildScalingReport, type ScalingEntry } from '../../scripts/benchmark/particleScaling';

/* Ölçüm değil ŞEMA ve AYRIM testi: süreler donanıma bağlı, oranlar değil. */
const report = buildScalingReport({ iterations: 1, samples: 1, warmupSteps: 2 });

function fieldsOf(entry: ScalingEntry): number[] {
  return [
    entry.particles,
    entry.active,
    entry.maxPerCell,
    entry.candidatePairsPerParticle,
    entry.msPerTick,
    entry.p95MsPerTick,
  ];
}

describe('parçacık ölçekleme raporu', () => {
  /*
   * Kapı bu şemayı okuyor (`quality.json` → scaling.games/vol-life.$measure).
   * Alan adı değişirse kapı "ölçülemedi" ile düşer; şema burada kilitlenir.
   */
  it('iki seri de K7 alanlarını sonlu değerlerle taşır', () => {
    expect(Object.keys(report)).toEqual(['particleKernel', 'productionSeeding']);
    for (const series of [report.particleKernel, report.productionSeeding]) {
      expect(series.map((entry) => entry.particles)).toEqual([512, 2048]);
      for (const entry of series) {
        expect(fieldsOf(entry).every((value) => Number.isFinite(value) && value > 0)).toBe(true);
        expect(entry.active).toBeLessThanOrEqual(entry.particles);
      }
    }
  });

  /*
   * Ayrımın SEBEBİ budur: üretim seeder'ı sabit yama yarıçapı kullandığı için
   * 4× parçacığı aynı yamalara gömer ve hücre doluluğu girdiyle birlikte
   * büyür. Tabakalı yerleşimde doluluk girdiden bağımsızdır; süre oranı ancak
   * o zaman karmaşıklık ölçer. Bu test bozulursa kapı yine yoğunluk ölçmeye
   * başlamış demektir.
   */
  it('algoritmik seride hücre doluluğu sabit kalır, ürün serisinde büyür', () => {
    const [algorithmicLow, algorithmicHigh] = report.particleKernel;
    const [productLow, productHigh] = report.productionSeeding;

    const algorithmicGrowth = algorithmicHigh.maxPerCell / algorithmicLow.maxPerCell;
    const productGrowth = productHigh.maxPerCell / productLow.maxPerCell;

    expect(algorithmicGrowth).toBeLessThanOrEqual(2);
    expect(productGrowth).toBeGreaterThan(algorithmicGrowth);
  });
});
