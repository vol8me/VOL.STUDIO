import {
  PARTICLE_ROLE_COUNT,
  PARTICLE_TYPE_COUNT,
  type SubstratePhysicsProfile,
} from '@/config/genome';

/**
 * Çift kuvvet yasası. Pozitif büyüklük ötekine doğru çekim, negatif itmedir;
 * `distance` sıfırdan büyük ve `cutoffUnits`in ötesinde sonuç kesinlikle sıfırdır.
 */
export interface PairForceKernel {
  readonly cutoffUnits: number;
  magnitude(distance: number, ownType: number, otherType: number): number;
}

const PAIR_COUNT = PARTICLE_TYPE_COUNT ** 2;

/** Sert çekirdek + yakın/orta/uzak lob; A→B ile B→A ayrı hesaplanır (DESIGN.md §3). */
export function createMultiBandKernel(physics: SubstratePhysicsProfile): PairForceKernel {
  const { hardCoreRadiusUnits: core, hardCoreStrength } = physics.profile;
  const nearEnd = new Float32Array(PAIR_COUNT);
  const midEnd = new Float32Array(PAIR_COUNT);
  const farEnd = new Float32Array(PAIR_COUNT);
  const nearStrength = new Float32Array(PAIR_COUNT);
  const midStrength = new Float32Array(PAIR_COUNT);
  const farStrength = new Float32Array(PAIR_COUNT);
  const [nearEdge, midEdge] = physics.profile.bandEdges;
  const [nearScale, midScale, farScale] = physics.profile.bandScales;
  for (let own = 0; own < PARTICLE_TYPE_COUNT; own++) {
    for (let other = 0; other < PARTICLE_TYPE_COUNT; other++) {
      const pair = own * PARTICLE_TYPE_COUNT + other;
      const rolePair = physics.roleByType[own] * PARTICLE_ROLE_COUNT + physics.roleByType[other];
      const range = physics.cutoffUnits * physics.rangeScale[rolePair];
      nearEnd[pair] = range * nearEdge;
      midEnd[pair] = range * midEdge;
      farEnd[pair] = range;
      const strength = physics.strength[pair];
      nearStrength[pair] = strength * nearScale;
      midStrength[pair] = strength * midScale;
      farStrength[pair] = strength * farScale;
    }
  }
  return {
    cutoffUnits: physics.cutoffUnits,
    magnitude(distance, ownType, otherType) {
      if (distance < core) {
        const d = Math.max(distance, core * 0.05);
        return -hardCoreStrength * ((core / d) ** 2 - 1);
      }
      const pair = ownType * PARTICLE_TYPE_COUNT + otherType;
      if (distance < nearEnd[pair]) return nearStrength[pair] * bump(distance, core, nearEnd[pair]);
      if (distance < midEnd[pair]) {
        return midStrength[pair] * bump(distance, nearEnd[pair], midEnd[pair]);
      }
      if (distance < farEnd[pair])
        return farStrength[pair] * bump(distance, midEnd[pair], farEnd[pair]);
      return 0;
    },
  };
}

function bump(distance: number, start: number, end: number): number {
  return 1 - Math.abs(((distance - start) / (end - start)) * 2 - 1);
}
