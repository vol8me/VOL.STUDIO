import { describe, expect, it } from 'vitest';
import {
  MIN_CURVATURE_RADIUS_UNITS,
  MIN_SAFE_AREA_RATIO,
  MIN_THROAT_UNITS,
  countHabitatComponents,
  countVoidHoles,
  measureTopology,
} from '../../support/habitatTopology';

/*
 * C7 ön-kaydı: tek bağlı habitat, iç delik yok, eğrilik yarıçapı ≥ 52 birim,
 * boğaz ≥ 192 birim, güvenli iç bölge ≥ %50. İnce boğaz, kapalı cep veya delik
 * üreten bir seed ekolojiyi üretim artefaktına bağımlı kılar (DESIGN §2).
 *
 * Birim kapısında sabit dört seed 256² maskeyle koşar; 1000 seedlik tam korpus
 * ve 1024² maske `tests/long/habitatTopology.long.ts` içindedir (§8.1).
 */
const UNIT_SEEDS = [5000, 109_729, 214_458, 319_187];

describe('habitat topoloji değişmezleri', () => {
  it.each(UNIT_SEEDS)('seed %i: tek bağlı habitat, delik yok, sınırlar tutar', (seed) => {
    const report = measureTopology(seed, [256]);

    expect(report.problems).toEqual([]);
    expect(report.habitatComponents).toBe(1);
    expect(report.voidHoles).toBe(0);
    expect(report.minCurvatureRadius).toBeGreaterThanOrEqual(MIN_CURVATURE_RADIUS_UNITS);
    expect(report.minThroat).toBeGreaterThanOrEqual(MIN_THROAT_UNITS);
    expect(report.safeAreaRatio).toBeGreaterThanOrEqual(MIN_SAFE_AREA_RATIO);
  });

  /*
   * Ölçümün AYIRT ETTİĞİNİ kanıtlamak için bilerek bozulmuş maskeler sayılır:
   * geçen bir korpus tek başına bekçinin çalıştığını göstermez — hep "1 bileşen,
   * 0 delik" döndüren bir ölçüm de aynı korpusu geçerdi.
   */
  it('bilerek açılan iç delik ve ikinci bileşen sayımda görünür', () => {
    const resolution = 64;
    const solid = new Uint8Array(resolution * resolution);
    for (let y = 8; y < resolution - 8; y++) {
      for (let x = 8; x < resolution - 8; x++) solid[y * resolution + x] = 1;
    }

    expect(countHabitatComponents(solid, resolution)).toBe(1);
    expect(countVoidHoles(solid, resolution)).toBe(0);

    const holed = Uint8Array.from(solid);
    for (let y = 28; y < 34; y++) {
      for (let x = 28; x < 34; x++) holed[y * resolution + x] = 0;
    }
    expect(countVoidHoles(holed, resolution)).toBe(1);
    expect(countHabitatComponents(holed, resolution)).toBe(1);

    const split = Uint8Array.from(solid);
    for (let y = 0; y < resolution; y++) split[y * resolution + 32] = 0;
    expect(countHabitatComponents(split, resolution)).toBe(2);
  });
});
