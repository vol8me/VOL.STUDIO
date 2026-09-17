import { describe, expect, it } from 'vitest';
import {
  PARTICLE_ROLE_COUNT,
  PARTICLE_TYPE_COUNT,
  cloneSubstratePhysicsProfile,
  type SubstratePhysicsProfile,
} from '@/config/genome';
import { createMultiBandKernel } from '@/runtime/sim/PairForceKernel';
import { defaultSubstrateCandidate } from '@/config/candidate';
import { createTriangularKernel } from '../../../benchmarks/fixtures/triangularKernel';

function pairRange(genome: SubstratePhysicsProfile, own: number, other: number): number {
  const rolePair = genome.roleByType[own] * PARTICLE_ROLE_COUNT + genome.roleByType[other];
  return genome.cutoffUnits * genome.rangeScale[rolePair];
}

describe('multi-band yönlü PairForceKernel', () => {
  const genome = defaultSubstrateCandidate.physics;
  const kernel = createMultiBandKernel(genome);
  const core = genome.profile.hardCoreRadiusUnits;

  it('sert çekirdekte her tür çifti için ıraksak itme uygular ve sınıra yaklaştıkça sıfıra iner', () => {
    for (let own = 0; own < PARTICLE_TYPE_COUNT; own++) {
      for (let other = 0; other < PARTICLE_TYPE_COUNT; other++) {
        expect(kernel.magnitude(core * 0.25, own, other)).toBeLessThan(0);
        expect(kernel.magnitude(core * 0.25, own, other)).toBeLessThan(
          kernel.magnitude(core * 0.75, own, other),
        );
      }
    }
    const maxMultiplier = (1 / 0.05) ** 2 - 1;
    expect(kernel.magnitude(1e-6, 0, 0)).toBeCloseTo(
      -genome.profile.hardCoreStrength * maxMultiplier,
      2,
    );
  });

  it('bant sınırlarında süreklidir: sert çekirdek çıkışı, yakın/orta/uzak geçişleri ve cutoff sıfırdır', () => {
    const own = 1;
    const other = 4;
    const range = pairRange(genome, own, other);
    const [nearEdge, midEdge] = genome.profile.bandEdges;
    for (const boundary of [core, range * nearEdge, range * midEdge, range]) {
      expect(kernel.magnitude(boundary - 1e-4, own, other)).toBeCloseTo(0, 3);
      expect(kernel.magnitude(boundary + 1e-4, own, other)).toBeCloseTo(0, 3);
    }
    expect(kernel.magnitude(range + 1, own, other)).toBe(0);
    expect(kernel.magnitude(kernel.cutoffUnits + 50, own, other)).toBe(0);
  });

  it('her bandın tepesinde büyüklük yönlü kuvvet × bant çarpanıdır', () => {
    const own = 2;
    const other = 5;
    const range = pairRange(genome, own, other);
    const [nearEdge, midEdge] = genome.profile.bandEdges;
    const [nearScale, midScale, farScale] = genome.profile.bandScales;
    const strength = genome.strength[own * PARTICLE_TYPE_COUNT + other];
    const nearPeak = (core + range * nearEdge) / 2;
    const midPeak = (range * nearEdge + range * midEdge) / 2;
    const farPeak = (range * midEdge + range) / 2;
    expect(kernel.magnitude(nearPeak, own, other)).toBeCloseTo(strength * nearScale, 6);
    expect(kernel.magnitude(midPeak, own, other)).toBeCloseTo(strength * midScale, 6);
    expect(kernel.magnitude(farPeak, own, other)).toBeCloseTo(strength * farScale, 6);
  });

  it('A→B ile B→A farklı büyüklük üretir (yönlü asimetri)', () => {
    const own = 0;
    const other = 1;
    const distance =
      (pairRange(genome, own, other) * 0.5 + pairRange(genome, other, own) * 0.5) / 2;
    const forward = kernel.magnitude(distance, own, other);
    const backward = kernel.magnitude(distance, other, own);
    expect(forward).not.toBeCloseTo(backward, 6);
  });

  it('rol menzil çarpanı gözlemleyen ile ötekinin rol çiftine göre bandı daraltır', () => {
    const custom = cloneSubstratePhysicsProfile(genome);
    custom.rangeScale.fill(1);
    custom.rangeScale[0 * PARTICLE_ROLE_COUNT + 2] = 0.5;
    const narrow = createMultiBandKernel(custom);
    const wideDistance = genome.cutoffUnits * 0.8;
    expect(narrow.magnitude(wideDistance, 0, 4)).toBe(0);
    expect(narrow.magnitude(wideDistance, 4, 0)).not.toBe(0);
  });

  it('bant çarpanının işareti bandı itmeye çevirebilir', () => {
    const custom = cloneSubstratePhysicsProfile(genome);
    custom.strength.fill(1);
    (custom.profile.bandScales as unknown as number[])[0] = -0.5;
    (custom.profile.bandScales as unknown as number[])[1] = 1;
    const flipped = createMultiBandKernel(custom);
    const range = pairRange(custom, 0, 0);
    const nearPeak = (core + range * custom.profile.bandEdges[0]) / 2;
    const midPeak = (range * custom.profile.bandEdges[0] + range * custom.profile.bandEdges[1]) / 2;
    expect(flipped.magnitude(nearPeak, 0, 0)).toBeCloseTo(-0.5, 6);
    expect(flipped.magnitude(midPeak, 0, 0)).toBeCloseTo(1, 6);
  });
});

describe('triangular negatif kontrol fixture’ı', () => {
  const kernel = createTriangularKernel();

  it('aynı kernel arayüzünü taşır: itme, tek üçgen lob ve cutoff', () => {
    expect(kernel.cutoffUnits).toBe(128);
    expect(kernel.magnitude(4, 0, 0)).toBeLessThan(0);
    expect(kernel.magnitude(72, 0, 1)).toBeCloseTo(0.7 * 0.045, 6);
    expect(kernel.magnitude(128, 0, 1)).toBe(0);
    expect(kernel.magnitude(16, 0, 1)).toBeCloseTo(0, 6);
  });

  it('tek lobludur: bant içinde işaret hiç değişmez (multi-band bunu aşar)', () => {
    const signs = new Set<number>();
    for (let distance = 17; distance < 128; distance += 3) {
      signs.add(Math.sign(kernel.magnitude(distance, 0, 1)));
    }
    expect(signs).toEqual(new Set([1]));
    const multi = createMultiBandKernel(defaultSubstrateCandidate.physics);
    const multiSigns = new Set<number>();
    for (let distance = 12; distance < 96; distance += 2) {
      const value = multi.magnitude(distance, 0, 2);
      if (value !== 0) multiSigns.add(Math.sign(value));
    }
    expect(multiSigns.size).toBeGreaterThanOrEqual(1);
  });
});
