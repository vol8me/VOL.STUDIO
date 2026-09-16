import { describe, expect, it } from 'vitest';
import {
  cloneSubstrateConfig,
  fingerprintSubstrateConfig,
  substrateConfig,
  validateSubstrateConfig,
} from '@/config/substrate';

describe('substrateConfig', () => {
  it('varsayılan dünya, parçacık, genom ve habitat birlikte doğrulanır', () => {
    expect(() => validateSubstrateConfig(substrateConfig)).not.toThrow();
  });

  it('fingerprint v4 önekli ve deterministiktir; aday veya habitat değişince değişir', () => {
    const base = fingerprintSubstrateConfig(substrateConfig);
    expect(base).toMatch(/^life-world-v4-[0-9a-f]{16}$/);
    expect(fingerprintSubstrateConfig(cloneSubstrateConfig(substrateConfig))).toBe(base);

    const mutated = cloneSubstrateConfig(substrateConfig);
    mutated.candidate.physics.strength[0] = 0.123;
    expect(fingerprintSubstrateConfig(mutated)).not.toBe(base);

    const habitat = {
      ...substrateConfig,
      habitat: { ...substrateConfig.habitat, superellipseExponent: 3 },
    };
    expect(fingerprintSubstrateConfig(habitat)).not.toBe(base);
  });

  it('klon derin kopyadır', () => {
    const clone = cloneSubstrateConfig(substrateConfig);
    clone.candidate.physics.strength.fill(0);
    (clone.world.boundsUnits as { width: number }).width = 1;
    expect(substrateConfig.candidate.physics.strength[0]).not.toBe(0);
    expect(substrateConfig.world.boundsUnits.width).toBe(1024);
  });

  it('kernel menzili spatial-hash hücresini aşamaz', () => {
    const config = cloneSubstrateConfig(substrateConfig);
    (config.candidate.physics as { cutoffUnits: number }).cutoffUnits = 200;
    expect(() => validateSubstrateConfig(config)).toThrow(/hücresini aşamaz/);
  });

  it('depolama geometrisi hücreye tam bölünmeli ve sonlu olmalı', () => {
    const odd = cloneSubstrateConfig(substrateConfig);
    (odd.world.boundsUnits as { width: number }).width = 1000;
    expect(() => validateSubstrateConfig(odd)).toThrow(/tam bölünmeli/);
    const small = cloneSubstrateConfig(substrateConfig);
    (small.world.boundsUnits as { width: number; height: number }).width = 256;
    (small.world.boundsUnits as { width: number; height: number }).height = 256;
    expect(() => validateSubstrateConfig(small)).toThrow(RangeError);
    const nan = cloneSubstrateConfig(substrateConfig);
    (nan.world.boundsUnits as { x: number }).x = Number.NaN;
    expect(() => validateSubstrateConfig(nan)).toThrow(/sonlu/);
  });

  /*
   * C7'nin config düzeyinde KANITLANABİLEN koşulu: güvenli iç bölge habitat
   * alanının en az yarısı olmalı. Seeding araması yama yarıçapını büyütünce
   * örnek burada reddedilir; gerçek oran ayrıca 1000 seedlik korpusta ölçülür.
   */
  it('güvenli iç bölge yarıdan küçülünce config reddedilir', () => {
    expect(() => validateSubstrateConfig(substrateConfig)).not.toThrow();

    const wideFringe = cloneSubstrateConfig(substrateConfig);
    (wideFringe.candidate.seeding as { patchRadiusUnits: number }).patchRadiusUnits = 110;
    expect(() => validateSubstrateConfig(wideFringe)).toThrow(/Güvenli iç bölge/);

    const stillSafe = cloneSubstrateConfig(substrateConfig);
    (stillSafe.candidate.seeding as { patchRadiusUnits: number }).patchRadiusUnits = 80;
    expect(() => validateSubstrateConfig(stillSafe)).not.toThrow();
  });

  it('habitat konturu depolama kenar boşluğunu, fringe ve yama boyutu habitatı ihlal edemez', () => {
    const margin = {
      ...substrateConfig,
      habitat: { ...substrateConfig.habitat, radiusRatioX: 0.97, radiusRatioY: 0.97 },
    };
    expect(() => validateSubstrateConfig(margin)).toThrow(/kenar boşluğunu/);
    const fringe = cloneSubstrateConfig(substrateConfig);
    (fringe.candidate.void as { widthUnits: number }).widthUnits = 200;
    expect(() => validateSubstrateConfig(fringe)).toThrow(/fringe/);
    const patch = cloneSubstrateConfig(substrateConfig);
    (patch.candidate.seeding as { patchRadiusUnits: number }).patchRadiusUnits = 300;
    expect(() => validateSubstrateConfig(patch)).toThrow(/yaması/);
  });
});
