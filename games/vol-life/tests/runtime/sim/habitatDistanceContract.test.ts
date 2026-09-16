import { describe, expect, it } from 'vitest';
import { habitatConfig } from '@/config/habitat';
import { worldConfig } from '@/config/world';
import { createHabitatDomain, type DomainSample } from '@/runtime/sim/WorldDomain';
import {
  BAND_UNITS,
  MAX_BAND_ERROR_UNITS,
  MAX_NORMAL_ANGLE_DEG,
  MAX_NORMAL_LENGTH_ERROR,
  SIGN_GUARD_UNITS,
  BAND_GUARD_UNITS,
  measureDistanceContract,
} from '../../support/distanceContract';

/*
 * C6 ön-kaydı (ölçümden önce yazıldı): |d| ≤ 64 bandında |hata| ≤ 0,5 birim;
 * bant dışında işaret ve bant üyeliği doğru; bantta ‖n‖ = 1 ± 1e-6 ve açı hatası
 * ≤ 2°. Birim kapısında sabit KÜÇÜK alt küme koşar; 200 seedlik tam korpus
 * `tests/long/habitatDistance.long.ts` içindedir (§8.1).
 *
 * İşaret ve bant üyeliği iddiaları sınır noktalarında tanımsızdır ve orada
 * SINANMAZ: |d_gerçek| < 0,01 birimde "hangi taraf" sorusunun cevabı yuvarlamaya
 * bağlıdır, |d_gerçek| 64 ± 1 birimde "bantta mı" sorusunun cevabı da öyle.
 * Ölçüldü (olcum/c6-isaret-teshis.json): bu iki kovanın DIŞINDA tek bir
 * uyuşmazlık yok. Sınır komşuluğu zaten mesafe hatası iddiasıyla kapsanıyor.
 */
const UNIT_SEEDS = [1000, 8919, 16838, 24757];
const STORAGE = worldConfig.boundsUnits;

describe('WorldDomain mesafe sözleşmesi', () => {
  const report = measureDistanceContract(UNIT_SEEDS);

  it('bant içinde mesafe hatası ön-kayıtlı sınırı aşmaz', () => {
    expect(report.bandSamples).toBeGreaterThan(5000);
    expect(report.bandMaxAbsError).toBeLessThanOrEqual(MAX_BAND_ERROR_UNITS);
    expect(report.bandFailures).toBe(0);
  });

  it(`işaret, |d| >= ${SIGN_GUARD_UNITS} birimdeki her noktada doğrudur`, () => {
    expect(report.signSamples).toBeGreaterThan(5000);
    expect(report.signMismatches).toBe(0);
  });

  it(`bant üyeliği, 64 ± ${BAND_GUARD_UNITS} komşuluğu dışında doğrudur`, () => {
    expect(report.membershipSamples).toBeGreaterThan(5000);
    expect(report.bandMembershipMismatches).toBe(0);
  });

  it('bant içinde normal birim uzunluktadır ve açı hatası sınırlıdır', () => {
    expect(report.normalSamples).toBeGreaterThan(5000);
    expect(report.normalMaxLengthError).toBeLessThanOrEqual(MAX_NORMAL_LENGTH_ERROR);
    expect(report.normalMaxAngleDeg).toBeLessThanOrEqual(MAX_NORMAL_ANGLE_DEG);
  });

  it('merkez ve köşe durumlarında sonlu, işareti doğru örnek üretir', () => {
    const sdf = createHabitatDomain(STORAGE, habitatConfig, UNIT_SEEDS[0]);
    const center = sdf.sampleDistanceAndNormal(
      STORAGE.x + STORAGE.width / 2,
      STORAGE.y + STORAGE.height / 2,
    );
    expect(center.distance).toBeGreaterThan(BAND_UNITS);
    expect(Math.hypot(center.normalX, center.normalY)).toBeCloseTo(1, 9);

    const corners: DomainSample[] = [
      sdf.sampleDistanceAndNormal(STORAGE.x, STORAGE.y),
      sdf.sampleDistanceAndNormal(STORAGE.x + STORAGE.width, STORAGE.y),
      sdf.sampleDistanceAndNormal(STORAGE.x, STORAGE.y + STORAGE.height),
      sdf.sampleDistanceAndNormal(STORAGE.x + STORAGE.width, STORAGE.y + STORAGE.height),
    ];
    for (const corner of corners) {
      expect(corner.distance).toBeLessThan(-BAND_UNITS);
      expect(Math.hypot(corner.normalX, corner.normalY)).toBeCloseTo(1, 9);
    }
  });
});
