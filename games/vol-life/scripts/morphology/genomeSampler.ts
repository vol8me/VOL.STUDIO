import {
  PARTICLE_ROLE_COUNT,
  PARTICLE_TYPE_COUNT,
  cloneSubstratePhysicsProfile,
  defaultPhysicsProfile,
  validateSubstratePhysicsProfile,
  type SubstratePhysicsProfile,
} from '@/config/genome';
import {
  cloneSubstrateCandidate,
  defaultSubstrateCandidate,
  defaultVoidProfile,
  validateSubstrateCandidate,
  type SubstrateCandidate,
} from '@/config/candidate';
import { particleConfig } from '@/config/particles';

export interface GenomeSamplerOptions {
  readonly strengthJitter: number;
  readonly rangeJitter: number;
  readonly cutoffJitterUnits: number;
  readonly bandEdgeJitter: number;
  readonly bandScaleJitter: number;
  readonly dampingJitter: number;
  readonly maxSpeedJitter: number;
  readonly forceScaleJitter: number;
  readonly seed: number;
}

/**
 * Void sarsma ayarı YOKTUR ve bu bilinçlidir: Void profili Adım 2'de
 * sabitlenir, Adım 3 morfoloji araması onu optimize etmez (E2). Sampler
 * imza düzeyinde yalnız fizik ve seeding üretir.
 */
export const defaultSamplerOptions: GenomeSamplerOptions = {
  strengthJitter: 0.25,
  rangeJitter: 0.2,
  cutoffJitterUnits: 16,
  bandEdgeJitter: 0.08,
  bandScaleJitter: 0.2,
  dampingJitter: 0.04,
  maxSpeedJitter: 0.4,
  forceScaleJitter: 0.015,
  seed: 0,
};

export class GenomeSampler {
  private readonly random: () => number;

  constructor(private readonly options: GenomeSamplerOptions = defaultSamplerOptions) {
    this.random = mulberry32(options.seed);
  }

  /**
   * Sarsılan yalnız fizik ve doğuş hızıdır. Void profili TABANDAN DA ALINMAZ:
   * doğrudan Adım 2'nin sabit profilidir (E2). Tabandan kopyalansaydı,
   * kurcalanmış bir taban Adım 3 aramasına başka bir kıyı fiziği sızdırabilirdi;
   * böylece örneklenen her aday aynı Void digest'ini taşır.
   */
  sample(base: SubstrateCandidate = defaultSubstrateCandidate): SubstrateCandidate {
    const radius = particleConfig.radiusUnits;
    for (let attempt = 0; attempt < 32; attempt++) {
      const physics = this.perturb(base.physics);
      const candidate: SubstrateCandidate = {
        schemaVersion: base.schemaVersion,
        physics,
        seeding: {
          ...base.seeding,
          typeWeights: [...base.seeding.typeWeights],
          initialSpeedUnitsPerReferenceTick: physics.dynamics.maxSpeedUnitsPerReferenceTick * 0.1,
        },
        void: defaultVoidProfile,
        scenario: base.scenario,
      };
      try {
        validateSubstrateCandidate(candidate, radius);
        return candidate;
      } catch {
        continue;
      }
    }
    return cloneSubstrateCandidate(base);
  }

  sampleCorpus(base: SubstrateCandidate, count: number): SubstrateCandidate[] {
    const corpus: SubstrateCandidate[] = [];
    for (let index = 0; index < count; index++) {
      corpus.push(this.sample(base));
    }
    return corpus;
  }

  private perturb(base: SubstratePhysicsProfile): SubstratePhysicsProfile {
    const o = this.options;
    const r = this.random;
    const strength = Float32Array.from(base.strength, (value) =>
      clamp(value + (r() * 2 - 1) * o.strengthJitter, -1, 1),
    );
    const rangeScale = Float32Array.from(base.rangeScale, (value) =>
      clamp(value + (r() * 2 - 1) * o.rangeJitter, 0.05, 1),
    );
    const cutoffUnits = clamp(
      base.cutoffUnits + (r() * 2 - 1) * o.cutoffJitterUnits,
      32,
      particleConfig.cellSizeUnits,
    );
    const bandEdges = perturbBandEdges(base.profile.bandEdges, r, o.bandEdgeJitter);
    const bandScales = perturbBandScales(base.profile.bandScales, r, o.bandScaleJitter);
    const dynamics = {
      dampingPerReferenceTick: clamp(
        base.dynamics.dampingPerReferenceTick + (r() * 2 - 1) * o.dampingJitter,
        0.5,
        0.999,
      ),
      maxSpeedUnitsPerReferenceTick: clamp(
        base.dynamics.maxSpeedUnitsPerReferenceTick + (r() * 2 - 1) * o.maxSpeedJitter,
        0.5,
        6,
      ),
      forceScale: clamp(base.dynamics.forceScale + (r() * 2 - 1) * o.forceScaleJitter, 0.005, 0.2),
    };
    return {
      schemaVersion: base.schemaVersion,
      kernelId: base.kernelId,
      roleByType: base.roleByType.slice(),
      strength,
      rangeScale,
      cutoffUnits,
      profile: {
        hardCoreRadiusUnits: base.profile.hardCoreRadiusUnits,
        hardCoreStrength: base.profile.hardCoreStrength,
        bandEdges,
        bandScales,
      },
      dynamics,
    };
  }
}

function perturbBandEdges(
  edges: readonly [number, number, number],
  random: () => number,
  jitter: number,
): [number, number, number] {
  const near = clamp(edges[0] + (random() * 2 - 1) * jitter, 0.1, 0.5);
  const mid = clamp(edges[1] + (random() * 2 - 1) * jitter, near + 0.05, 0.9);
  const far = 1;
  return [near, mid, far];
}

function perturbBandScales(
  scales: readonly [number, number, number],
  random: () => number,
  jitter: number,
): [number, number, number] {
  return [
    clamp(scales[0] + (random() * 2 - 1) * jitter, -1, 1),
    clamp(scales[1] + (random() * 2 - 1) * jitter, -1, 1),
    clamp(scales[2] + (random() * 2 - 1) * jitter, -1, 1),
  ];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export {
  PARTICLE_TYPE_COUNT,
  PARTICLE_ROLE_COUNT,
  cloneSubstratePhysicsProfile,
  defaultPhysicsProfile,
  validateSubstratePhysicsProfile,
};
