export interface MorphologyAnalysisOptions {
  readonly clusterRadiusUnits: number;
  readonly minimumClusterSize: number;
  readonly movingSpeedUnitsPerReferenceTick: number;
  readonly roleByType: readonly number[];
  readonly wallSupportShare: number;
}

export const morphologySearchConfig = {
  version: 2,
  particleCount: 512,
  seedCorpus: [0x10fe1, 0x51a7, 0xc0ffee, 0x7f4a7c15, 0x13579bdf],
  analysis: {
    clusterRadiusUnits: 40,
    minimumClusterSize: 12,
    movingSpeedUnitsPerReferenceTick: 0.08,
    roleByType: Array.from(particleConfig.roleByType),
    wallSupportShare: 0.2,
  } satisfies MorphologyAnalysisOptions,
  thresholds: {
    clusteredFraction: 0.35,
    structurePresence: 0.55,
    meanLayering: 0.12,
    movingFraction: 0.25,
    recovery: 0.65,
    staticFraction: 0.65,
    fragmentation: 0.35,
    collapse: 0.75,
    orbitDominance: 0.4,
    orbitActivity: 0.65,
    isolatedFraction: 0.25,
    stalledIsolatedFraction: 0.12,
    wallSupportedStructureFraction: 0.35,
    meanCompactness: 0.18,
    membershipStability: 0.35,
    recoveryMembership: 0.3,
    recoveryCompactness: 0.65,
    recoveryLayering: 0.5,
  },
  broad: { ticks: 900, warmupTicks: 420, sampleEveryTicks: 60, seeds: 3, finalists: 4 },
  finalist: {
    ticks: 2_400,
    warmupTicks: 900,
    perturbAtTick: 1_200,
    recoveryStartTick: 1_800,
    sampleEveryTicks: 60,
  },
} as const;
import { particleConfig } from '@/config/particles';
