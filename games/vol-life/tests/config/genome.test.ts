import { describe, expect, it } from 'vitest';
import {
  MULTIBAND_KERNEL_ID,
  PARTICLE_ROLE_COUNT,
  PARTICLE_TYPE_COUNT,
  PHYSICS_SCHEMA_VERSION,
  cloneSubstratePhysicsProfile,
  defaultPhysicsProfile,
  digestString,
  digestSubstratePhysicsProfile,
  parseSubstratePhysicsProfile,
  serializeSubstratePhysicsProfile,
  validateSubstratePhysicsProfile,
  type SubstratePhysicsProfile,
} from '@/config/genome';
import { particleConfig } from '@/config/particles';

const RADIUS = particleConfig.radiusUnits;

function withProfile(patch: Partial<SubstratePhysicsProfile['profile']>): SubstratePhysicsProfile {
  return { ...defaultPhysicsProfile, profile: { ...defaultPhysicsProfile.profile, ...patch } };
}

describe('SubstratePhysicsProfile', () => {
  it('varsayılan fizik profili sürümlü, yönlü ve doğrulamadan geçer', () => {
    expect(defaultPhysicsProfile.schemaVersion).toBe(PHYSICS_SCHEMA_VERSION);
    expect(defaultPhysicsProfile.kernelId).toBe(MULTIBAND_KERNEL_ID);
    expect(defaultPhysicsProfile.strength).toHaveLength(PARTICLE_TYPE_COUNT ** 2);
    expect(defaultPhysicsProfile.rangeScale).toHaveLength(PARTICLE_ROLE_COUNT ** 2);
    expect(() => validateSubstratePhysicsProfile(defaultPhysicsProfile, RADIUS)).not.toThrow();
  });

  /* Doğuş koşulları (hız, kenar payı) ve kıyı fiziği artık BU profilde değil (E1). */
  it('seeding ve Void alanları fizik profilinde taşınmaz', () => {
    const fields = Object.keys(defaultPhysicsProfile);

    expect(fields).not.toContain('seeding');
    expect(fields).not.toContain('fringe');
    expect(Object.keys(defaultPhysicsProfile.dynamics)).not.toContain(
      'initialSpeedUnitsPerReferenceTick',
    );
  });

  it('kuvvet matrisi yönlüdür: en az bir A→B ile B→A farklıdır', () => {
    const { strength } = defaultPhysicsProfile;
    const asymmetric = Array.from({ length: PARTICLE_TYPE_COUNT ** 2 }, (_, pair) => pair).some(
      (pair) => {
        const a = Math.floor(pair / PARTICLE_TYPE_COUNT);
        const b = pair % PARTICLE_TYPE_COUNT;
        return strength[a * PARTICLE_TYPE_COUNT + b] !== strength[b * PARTICLE_TYPE_COUNT + a];
      },
    );
    expect(asymmetric).toBe(true);
  });

  it('klon derin kopyadır; kaynak matrisi sonradan değiştirilse profil etkilenmez', () => {
    const clone = cloneSubstratePhysicsProfile(defaultPhysicsProfile);
    clone.strength.fill(0);
    (clone.profile.bandEdges as unknown as number[])[0] = 0.01;

    expect(defaultPhysicsProfile.strength[0]).not.toBe(0);
    expect(defaultPhysicsProfile.profile.bandEdges[0]).toBe(0.3);
  });

  it('serialize → parse gidiş dönüşü aynı digest’i üretir ve yeni nesne döner', () => {
    const serialized = serializeSubstratePhysicsProfile(defaultPhysicsProfile);
    const parsed = parseSubstratePhysicsProfile(serialized, RADIUS);

    expect(digestSubstratePhysicsProfile(parsed)).toBe(
      digestSubstratePhysicsProfile(defaultPhysicsProfile),
    );
    expect(parsed).not.toBe(defaultPhysicsProfile);
    expect(parsed.strength).toBeInstanceOf(Float32Array);
    expect(parsed.roleByType).toBeInstanceOf(Uint8Array);
  });

  it('digest 16 hex karakterdir ve tek bir gen değişince değişir', () => {
    const base = digestSubstratePhysicsProfile(defaultPhysicsProfile);
    const mutated = cloneSubstratePhysicsProfile(defaultPhysicsProfile);
    mutated.strength[3] = 0.111;

    expect(base).toMatch(/^[0-9a-f]{16}$/);
    expect(digestSubstratePhysicsProfile(mutated)).not.toBe(base);
    expect(digestString('a')).not.toBe(digestString('b'));
  });

  it('bozuk serileştirmeyi reddeder', () => {
    expect(() => parseSubstratePhysicsProfile('{"strength": "x"}', RADIUS)).toThrow(RangeError);
    expect(() => parseSubstratePhysicsProfile('{"roleByType": [1, "a"]}', RADIUS)).toThrow(
      RangeError,
    );
    const wrongSchema = JSON.parse(
      serializeSubstratePhysicsProfile(defaultPhysicsProfile),
    ) as Record<string, unknown>;
    wrongSchema.schemaVersion = 99;
    expect(() => parseSubstratePhysicsProfile(JSON.stringify(wrongSchema), RADIUS)).toThrow(
      RangeError,
    );
  });

  it('şema, kernel, rol, kuvvet ve menzil ayrışmalarını reddeder', () => {
    const base = defaultPhysicsProfile;
    expect(() =>
      validateSubstratePhysicsProfile({ ...base, kernelId: 'other' as never }, RADIUS),
    ).toThrow(RangeError);
    expect(() =>
      validateSubstratePhysicsProfile(
        { ...base, roleByType: new Uint8Array([0, 0, 0, 0, 0, 3]) },
        RADIUS,
      ),
    ).toThrow(RangeError);
    const tooStrong = base.strength.slice();
    tooStrong[0] = 1.5;
    expect(() => validateSubstratePhysicsProfile({ ...base, strength: tooStrong }, RADIUS)).toThrow(
      RangeError,
    );
    const zeroRange = base.rangeScale.slice();
    zeroRange[0] = 0;
    expect(() =>
      validateSubstratePhysicsProfile({ ...base, rangeScale: zeroRange }, RADIUS),
    ).toThrow(RangeError);
    expect(() => validateSubstratePhysicsProfile({ ...base, cutoffUnits: 0 }, RADIUS)).toThrow(
      RangeError,
    );
  });

  it('profil sözleşmesini korur: sert çekirdek çaptan büyük, bantlar artan, en dar bandı yutmaz', () => {
    expect(() =>
      validateSubstratePhysicsProfile(withProfile({ hardCoreRadiusUnits: RADIUS * 2 }), RADIUS),
    ).toThrow(RangeError);
    expect(() =>
      validateSubstratePhysicsProfile(withProfile({ bandEdges: [0.5, 0.3, 1] }), RADIUS),
    ).toThrow(RangeError);
    expect(() =>
      validateSubstratePhysicsProfile(withProfile({ bandEdges: [0.3, 0.6, 0.9] }), RADIUS),
    ).toThrow(RangeError);
    expect(() =>
      validateSubstratePhysicsProfile(withProfile({ bandScales: [2, 1, 1] }), RADIUS),
    ).toThrow(RangeError);
    expect(() =>
      validateSubstratePhysicsProfile(withProfile({ hardCoreRadiusUnits: 40 }), RADIUS),
    ).toThrow(RangeError);
    expect(() =>
      validateSubstratePhysicsProfile(withProfile({ hardCoreStrength: 0 }), RADIUS),
    ).toThrow(RangeError);
  });

  it('dinamik genlerini aralıklarında tutar', () => {
    const base = defaultPhysicsProfile;
    const dynamics = (
      patch: Partial<SubstratePhysicsProfile['dynamics']>,
    ): SubstratePhysicsProfile => ({
      ...base,
      dynamics: { ...base.dynamics, ...patch },
    });

    expect(() =>
      validateSubstratePhysicsProfile(dynamics({ dampingPerReferenceTick: 1.1 }), RADIUS),
    ).toThrow();
    expect(() =>
      validateSubstratePhysicsProfile(dynamics({ maxSpeedUnitsPerReferenceTick: 0 }), RADIUS),
    ).toThrow();
    expect(() => validateSubstratePhysicsProfile(dynamics({ forceScale: 0 }), RADIUS)).toThrow();
  });
});
