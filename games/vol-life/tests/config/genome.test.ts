import { describe, expect, it } from 'vitest';
import {
  GENOME_SCHEMA_VERSION,
  MULTIBAND_KERNEL_ID,
  PARTICLE_ROLE_COUNT,
  PARTICLE_TYPE_COUNT,
  clonePhysicsGenome,
  defaultPhysicsGenome,
  digestPhysicsGenome,
  digestString,
  parsePhysicsGenome,
  serializePhysicsGenome,
  validatePhysicsGenome,
  type PhysicsGenome,
} from '@/config/genome';
import { particleConfig } from '@/config/particles';

const RADIUS = particleConfig.radiusUnits;

function withProfile(patch: Partial<PhysicsGenome['profile']>): PhysicsGenome {
  return { ...defaultPhysicsGenome, profile: { ...defaultPhysicsGenome.profile, ...patch } };
}

describe('PhysicsGenome', () => {
  it('varsayılan genom sürümlü, yönlü ve doğrulamadan geçer', () => {
    expect(defaultPhysicsGenome.schemaVersion).toBe(GENOME_SCHEMA_VERSION);
    expect(defaultPhysicsGenome.kernelId).toBe(MULTIBAND_KERNEL_ID);
    expect(defaultPhysicsGenome.strength).toHaveLength(PARTICLE_TYPE_COUNT ** 2);
    expect(defaultPhysicsGenome.rangeScale).toHaveLength(PARTICLE_ROLE_COUNT ** 2);
    expect(() => validatePhysicsGenome(defaultPhysicsGenome, RADIUS)).not.toThrow();
  });

  it('kuvvet matrisi yönlüdür: en az bir A→B ile B→A farklıdır', () => {
    const { strength } = defaultPhysicsGenome;
    const asymmetric = Array.from({ length: PARTICLE_TYPE_COUNT ** 2 }, (_, pair) => pair).some(
      (pair) => {
        const a = Math.floor(pair / PARTICLE_TYPE_COUNT);
        const b = pair % PARTICLE_TYPE_COUNT;
        return strength[a * PARTICLE_TYPE_COUNT + b] !== strength[b * PARTICLE_TYPE_COUNT + a];
      },
    );
    expect(asymmetric).toBe(true);
  });

  it('klon derin kopyadır; kaynak matrisi sonradan değiştirilse genom etkilenmez', () => {
    const clone = clonePhysicsGenome(defaultPhysicsGenome);
    clone.strength.fill(0);
    (clone.profile.bandEdges as unknown as number[])[0] = 0.01;
    (clone.seeding.typeWeights as unknown as number[])[0] = 99;

    expect(defaultPhysicsGenome.strength[0]).not.toBe(0);
    expect(defaultPhysicsGenome.profile.bandEdges[0]).toBe(0.3);
    expect(defaultPhysicsGenome.seeding.typeWeights[0]).toBe(1);
  });

  it('serialize → parse gidiş dönüşü aynı digest’i üretir ve yeni nesne döner', () => {
    const serialized = serializePhysicsGenome(defaultPhysicsGenome);
    const parsed = parsePhysicsGenome(serialized, RADIUS);

    expect(digestPhysicsGenome(parsed)).toBe(digestPhysicsGenome(defaultPhysicsGenome));
    expect(parsed).not.toBe(defaultPhysicsGenome);
    expect(parsed.strength).toBeInstanceOf(Float32Array);
    expect(parsed.roleByType).toBeInstanceOf(Uint8Array);
  });

  it('digest 16 hex karakterdir ve tek bir gen değişince değişir', () => {
    const base = digestPhysicsGenome(defaultPhysicsGenome);
    const mutated = clonePhysicsGenome(defaultPhysicsGenome);
    mutated.strength[3] = 0.111;

    expect(base).toMatch(/^[0-9a-f]{16}$/);
    expect(digestPhysicsGenome(mutated)).not.toBe(base);
    expect(digestString('a')).not.toBe(digestString('b'));
  });

  it('bozuk serileştirmeyi reddeder', () => {
    expect(() => parsePhysicsGenome('{"strength": "x"}', RADIUS)).toThrow(RangeError);
    expect(() => parsePhysicsGenome('{"roleByType": [1, "a"]}', RADIUS)).toThrow(RangeError);
    const wrongSchema = JSON.parse(serializePhysicsGenome(defaultPhysicsGenome)) as Record<
      string,
      unknown
    >;
    wrongSchema.schemaVersion = 99;
    expect(() => parsePhysicsGenome(JSON.stringify(wrongSchema), RADIUS)).toThrow(RangeError);
  });

  it('şema, kernel, rol, kuvvet ve menzil ayrışmalarını reddeder', () => {
    const base = defaultPhysicsGenome;
    expect(() => validatePhysicsGenome({ ...base, kernelId: 'other' as never }, RADIUS)).toThrow(
      RangeError,
    );
    expect(() =>
      validatePhysicsGenome({ ...base, roleByType: new Uint8Array([0, 0, 0, 0, 0, 3]) }, RADIUS),
    ).toThrow(RangeError);
    const tooStrong = base.strength.slice();
    tooStrong[0] = 1.5;
    expect(() => validatePhysicsGenome({ ...base, strength: tooStrong }, RADIUS)).toThrow(
      RangeError,
    );
    const zeroRange = base.rangeScale.slice();
    zeroRange[0] = 0;
    expect(() => validatePhysicsGenome({ ...base, rangeScale: zeroRange }, RADIUS)).toThrow(
      RangeError,
    );
    expect(() => validatePhysicsGenome({ ...base, cutoffUnits: 0 }, RADIUS)).toThrow(RangeError);
  });

  it('profil sözleşmesini korur: sert çekirdek çaptan büyük, bantlar artan, en dar bandı yutmaz', () => {
    expect(() =>
      validatePhysicsGenome(withProfile({ hardCoreRadiusUnits: RADIUS * 2 }), RADIUS),
    ).toThrow(RangeError);
    expect(() => validatePhysicsGenome(withProfile({ bandEdges: [0.5, 0.3, 1] }), RADIUS)).toThrow(
      RangeError,
    );
    expect(() =>
      validatePhysicsGenome(withProfile({ bandEdges: [0.3, 0.6, 0.9] }), RADIUS),
    ).toThrow(RangeError);
    expect(() => validatePhysicsGenome(withProfile({ bandScales: [2, 1, 1] }), RADIUS)).toThrow(
      RangeError,
    );
    expect(() => validatePhysicsGenome(withProfile({ hardCoreRadiusUnits: 40 }), RADIUS)).toThrow(
      RangeError,
    );
    expect(() => validatePhysicsGenome(withProfile({ hardCoreStrength: 0 }), RADIUS)).toThrow(
      RangeError,
    );
  });

  it('dinamik, seeding ve fringe genlerini aralıklarında tutar', () => {
    const base = defaultPhysicsGenome;
    const dynamics = (patch: Partial<PhysicsGenome['dynamics']>): PhysicsGenome => ({
      ...base,
      dynamics: { ...base.dynamics, ...patch },
    });
    const seeding = (patch: Partial<PhysicsGenome['seeding']>): PhysicsGenome => ({
      ...base,
      seeding: { ...base.seeding, ...patch },
    });
    expect(() =>
      validatePhysicsGenome(dynamics({ dampingPerReferenceTick: 1.1 }), RADIUS),
    ).toThrow();
    expect(() =>
      validatePhysicsGenome(dynamics({ initialSpeedUnitsPerReferenceTick: 5 }), RADIUS),
    ).toThrow();
    expect(() => validatePhysicsGenome(dynamics({ forceScale: 0 }), RADIUS)).toThrow();
    expect(() => validatePhysicsGenome(seeding({ patchCount: 0 }), RADIUS)).toThrow();
    expect(() =>
      validatePhysicsGenome(seeding({ patchFraction: 0.8, cloudFraction: 0.5 }), RADIUS),
    ).toThrow();
    expect(() => validatePhysicsGenome(seeding({ cloudRadiusRatio: 0.5 }), RADIUS)).toThrow();
    expect(() =>
      validatePhysicsGenome(seeding({ typeWeights: [0, 0, 0, 0, 0, 0] }), RADIUS),
    ).toThrow();
    expect(() => validatePhysicsGenome(seeding({ typeWeights: [1, 1, 1] }), RADIUS)).toThrow();
    expect(() =>
      validatePhysicsGenome({ ...base, fringe: { widthUnits: 0, tidalStrength: 0.1 } }, RADIUS),
    ).toThrow();
    expect(() =>
      validatePhysicsGenome({ ...base, fringe: { widthUnits: 10, tidalStrength: 2 } }, RADIUS),
    ).toThrow();
  });
});
