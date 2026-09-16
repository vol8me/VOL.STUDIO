import { describe, expect, it } from 'vitest';
import {
  CANDIDATE_SCHEMA_VERSION,
  cloneSubstrateCandidate,
  defaultSubstrateCandidate,
  digestSeedingProfile,
  digestSubstrateCandidate,
  digestVoidProfile,
  parseSubstrateCandidate,
  serializeSubstrateCandidate,
  validateExperimentScenario,
  validateSeedingProfile,
  validateSubstrateCandidate,
  validateVoidProfile,
  type ExperimentScenario,
  type SeedingProfile,
  type VoidProfile,
} from '@/config/candidate';
import { digestSubstratePhysicsProfile, defaultPhysicsProfile } from '@/config/genome';
import { particleConfig } from '@/config/particles';

const RADIUS = particleConfig.radiusUnits;

/**
 * ALTIN DIGEST'ler 2026-09-16'da ölçüldü ve kilitlendi. Amaçları performans ya
 * da doğruluk değil: kanonik serileştirmenin (alan sırası, tipli dizilerin
 * düzleştirilmesi) sessizce kaymasını yakalamak. Bir profil bilerek
 * değiştirilirse bu sabitler de aynı commit'te güncellenir.
 */
const GOLDEN = {
  candidate: 'a28b4b2b7e1b4a5c',
  physics: '7c17714ca1a7aac9',
  seeding: 'c623b8e0e47acc04',
  voidProfile: '2f62bd44943160cb',
} as const;

function seeding(patch: Partial<SeedingProfile>): SeedingProfile {
  return { ...defaultSubstrateCandidate.seeding, ...patch };
}

function voidProfile(patch: Partial<VoidProfile>): VoidProfile {
  return { ...defaultSubstrateCandidate.void, ...patch };
}

describe('SubstrateCandidate', () => {
  it('varsayılan aday sürümlü ve doğrulamadan geçer', () => {
    expect(defaultSubstrateCandidate.schemaVersion).toBe(CANDIDATE_SCHEMA_VERSION);
    expect(defaultSubstrateCandidate.scenario).toEqual({ kind: 'intrinsic' });
    expect(() => validateSubstrateCandidate(defaultSubstrateCandidate, RADIUS)).not.toThrow();
  });

  /*
   * Bölmenin ANLAMI: doğuş hızı ve güvenli kenar payı seeding'e, kıyı fiziği
   * Void profiline ait. Alanlar geri sızarsa bölme kâğıt üstünde kalır.
   */
  it('doğuş hızı ve güvenli kenar payı seeding profilindedir', () => {
    expect(defaultSubstrateCandidate.seeding.initialSpeedUnitsPerReferenceTick).toBe(0.25);
    expect(defaultSubstrateCandidate.seeding.safeEdgeMarginUnits).toBe(24);
    expect(defaultSubstrateCandidate.void.widthUnits).toBe(24);
    expect(Object.keys(defaultSubstrateCandidate.physics)).not.toContain('seeding');
  });

  it('altın digest’ler kanonik serileştirmeyi kilitler', () => {
    expect(digestSubstrateCandidate(defaultSubstrateCandidate)).toBe(GOLDEN.candidate);
    expect(digestSubstratePhysicsProfile(defaultPhysicsProfile)).toBe(GOLDEN.physics);
    expect(digestSeedingProfile(defaultSubstrateCandidate.seeding)).toBe(GOLDEN.seeding);
    expect(digestVoidProfile(defaultSubstrateCandidate.void)).toBe(GOLDEN.voidProfile);
  });

  it('her profil digest’i kendi alanına duyarlıdır', () => {
    const base = digestSubstrateCandidate(defaultSubstrateCandidate);
    const movedSpeed = { ...defaultSubstrateCandidate, seeding: seeding({ patchCount: 5 }) };
    const movedVoid = { ...defaultSubstrateCandidate, void: voidProfile({ tidalStrength: 0 }) };
    const movedScenario: ExperimentScenario = { kind: 'void-stress', tidalControl: true };

    expect(digestSubstrateCandidate(movedSpeed)).not.toBe(base);
    expect(digestSubstrateCandidate(movedVoid)).not.toBe(base);
    expect(
      digestSubstrateCandidate({ ...defaultSubstrateCandidate, scenario: movedScenario }),
    ).not.toBe(base);
  });

  it('serialize → parse gidiş dönüşü aynı digest’i üretir ve tipli dizileri geri kurar', () => {
    const parsed = parseSubstrateCandidate(
      serializeSubstrateCandidate(defaultSubstrateCandidate),
      RADIUS,
    );

    expect(digestSubstrateCandidate(parsed)).toBe(GOLDEN.candidate);
    expect(parsed).not.toBe(defaultSubstrateCandidate);
    expect(parsed.physics.strength).toBeInstanceOf(Float32Array);
    expect(parsed.physics.roleByType).toBeInstanceOf(Uint8Array);
    expect(parsed.seeding).toEqual(defaultSubstrateCandidate.seeding);
    expect(parsed.void).toEqual(defaultSubstrateCandidate.void);
  });

  it('klon derin kopyadır; klonu bozmak varsayılanı etkilemez', () => {
    const clone = cloneSubstrateCandidate(defaultSubstrateCandidate);
    clone.physics.strength.fill(0);
    (clone.seeding.typeWeights as number[])[0] = 99;
    (clone.void as { widthUnits: number }).widthUnits = 1;

    expect(defaultSubstrateCandidate.physics.strength[0]).not.toBe(0);
    expect(defaultSubstrateCandidate.seeding.typeWeights[0]).toBe(1);
    expect(defaultSubstrateCandidate.void.widthUnits).toBe(24);
  });

  it('bilinmeyen kernel kimliği ve şema sürümü reddedilir', () => {
    expect(() =>
      validateSubstrateCandidate(
        { ...defaultSubstrateCandidate, schemaVersion: 9 as never },
        RADIUS,
      ),
    ).toThrow(RangeError);
    expect(() =>
      validateSubstrateCandidate(
        {
          ...defaultSubstrateCandidate,
          physics: { ...defaultPhysicsProfile, kernelId: 'other' as never },
        },
        RADIUS,
      ),
    ).toThrow(RangeError);
    expect(() => validateSeedingProfile(seeding({ schemaVersion: 7 as never }))).toThrow(
      RangeError,
    );
    expect(() => validateVoidProfile(voidProfile({ schemaVersion: 7 as never }))).toThrow(
      RangeError,
    );
  });

  it('seeding profilinin geçersiz alanları reddedilir', () => {
    expect(() => validateSeedingProfile(seeding({ patchCount: 0 }))).toThrow(RangeError);
    expect(() =>
      validateSeedingProfile(seeding({ patchFraction: 0.8, cloudFraction: 0.5 })),
    ).toThrow(RangeError);
    expect(() => validateSeedingProfile(seeding({ cloudRadiusRatio: 0.5 }))).toThrow(RangeError);
    expect(() => validateSeedingProfile(seeding({ typeWeights: [0, 0, 0, 0, 0, 0] }))).toThrow(
      RangeError,
    );
    expect(() => validateSeedingProfile(seeding({ typeWeights: [1, 1, 1] }))).toThrow(RangeError);
    expect(() => validateSeedingProfile(seeding({ safeEdgeMarginUnits: 0 }))).toThrow(RangeError);
    expect(() =>
      validateSeedingProfile(seeding({ initialSpeedUnitsPerReferenceTick: Number.NaN })),
    ).toThrow(RangeError);
  });

  it('Void profilinin geçersiz alanları reddedilir', () => {
    expect(() => validateVoidProfile(voidProfile({ widthUnits: 0 }))).toThrow(RangeError);
    expect(() => validateVoidProfile(voidProfile({ tidalStrength: 2 }))).toThrow(RangeError);
    expect(() => validateVoidProfile(voidProfile({ tidalStrength: -0.1 }))).toThrow(RangeError);
  });

  /* E10: senaryo iki türdür; void-stress koşusu tidal kontrolünü işaretler. */
  it('deney senaryosu yalnız intrinsic ya da void-stress olabilir', () => {
    expect(() => validateExperimentScenario({ kind: 'intrinsic' })).not.toThrow();
    expect(() =>
      validateExperimentScenario({ kind: 'void-stress', tidalControl: false }),
    ).not.toThrow();
    expect(() => validateExperimentScenario({ kind: 'başka' } as never)).toThrow(RangeError);
    expect(() =>
      validateExperimentScenario({ kind: 'void-stress' } as unknown as ExperimentScenario),
    ).toThrow(RangeError);
  });

  /* Profil başına doğrulama göremez: iki AYRI profilin alanlarını karşılaştırır. */
  it('doğuş hızı hareket yasasının hız tavanını aşamaz', () => {
    const tooFast = {
      ...defaultSubstrateCandidate,
      seeding: seeding({
        initialSpeedUnitsPerReferenceTick:
          defaultPhysicsProfile.dynamics.maxSpeedUnitsPerReferenceTick + 0.1,
      }),
    };

    expect(() => validateSubstrateCandidate(tooFast, RADIUS)).toThrow(RangeError);
  });

  it('bozuk serileştirme reddedilir', () => {
    expect(() => parseSubstrateCandidate('{}', RADIUS)).toThrow(RangeError);
    expect(() => parseSubstrateCandidate('{"physics":{"strength":"x"}}', RADIUS)).toThrow(
      RangeError,
    );
  });
});
