import {
  PARTICLE_TYPE_COUNT,
  PARTICLE_ROLE_COUNT,
  clonePhysicsGenome,
  defaultPhysicsGenome,
  validatePhysicsGenome,
  type PhysicsGenome,
} from '@/config/genome';
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
  readonly fringeWidthJitter: number;
  readonly tidalStrengthJitter: number;
  readonly seed: number;
}

export const defaultSamplerOptions: GenomeSamplerOptions = {
  strengthJitter: 0.25,
  rangeJitter: 0.2,
  cutoffJitterUnits: 16,
  bandEdgeJitter: 0.08,
  bandScaleJitter: 0.2,
  dampingJitter: 0.04,
  maxSpeedJitter: 0.4,
  forceScaleJitter: 0.015,
  fringeWidthJitter: 4,
  tidalStrengthJitter: 0.015,
  seed: 0,
};

export class GenomeSampler {
  private readonly random: () => number;

  constructor(private readonly options: GenomeSamplerOptions = defaultSamplerOptions) {
    this.random = mulberry32(options.seed);
  }

  sample(base: PhysicsGenome = defaultPhysicsGenome): PhysicsGenome {
    const radius = particleConfig.radiusUnits;
    for (let attempt = 0; attempt < 32; attempt++) {
      const candidate = this.perturb(base);
      try {
        validatePhysicsGenome(candidate, radius);
        return candidate;
      } catch {
        continue;
      }
    }
    return clonePhysicsGenome(base);
  }

  sampleCorpus(base: PhysicsGenome, count: number): PhysicsGenome[] {
    const corpus: PhysicsGenome[] = [];
    for (let index = 0; index < count; index++) {
      corpus.push(this.sample(base));
    }
    return corpus;
  }

  private perturb(base: PhysicsGenome): PhysicsGenome {
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
      initialSpeedUnitsPerReferenceTick: 0,
      forceScale: clamp(base.dynamics.forceScale + (r() * 2 - 1) * o.forceScaleJitter, 0.005, 0.2),
    };
    dynamics.initialSpeedUnitsPerReferenceTick = dynamics.maxSpeedUnitsPerReferenceTick * 0.1;
    const fringe = {
      widthUnits: clamp(base.fringe.widthUnits + (r() * 2 - 1) * o.fringeWidthJitter, 8, 48),
      tidalStrength: clamp(
        base.fringe.tidalStrength + (r() * 2 - 1) * o.tidalStrengthJitter,
        0,
        0.1,
      ),
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
      seeding: { ...base.seeding, typeWeights: [...base.seeding.typeWeights] },
      fringe,
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

export { PARTICLE_TYPE_COUNT, PARTICLE_ROLE_COUNT };
