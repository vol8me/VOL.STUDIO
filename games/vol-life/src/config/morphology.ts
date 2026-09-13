export interface MorphologyAnalysisOptions {
  readonly clusterRadiusUnits: number;
  readonly minimumClusterSize: number;
  readonly movingSpeedUnitsPerReferenceTick: number;
  readonly nearlyStalledSpeedUnitsPerReferenceTick: number;
  readonly wallContactDistanceUnits: number;
  readonly roleByType: readonly number[];
  readonly wallSupportShare: number;
}

export const morphologySearchConfig = {
  version: 3,
  searchSeed: 0x51feba11,
  seedCorpus: [0x10fe1, 0x51a7, 0xc0ffee, 0x7f4a7c15, 0x13579bdf],
  analysis: {
    clusterRadiusUnits: 40,
    minimumClusterSize: 12,
    movingSpeedUnitsPerReferenceTick: 0.08,
    nearlyStalledSpeedUnitsPerReferenceTick: 0.005,
    wallContactDistanceUnits: 12,
    roleByType: Array.from(particleConfig.roleByType),
    wallSupportShare: 0.2,
  } satisfies MorphologyAnalysisOptions,
  thresholds: {
    clusteredFraction: 0.35,
    structurePresence: 0.55,
    meanRadialLayering: 0.12,
    movingFraction: 0.25,
    nearlyStalledFraction: 0.6,
    structuralDiversity: 0.02,
    orbitPersistence: 0.6,
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
    recoveryTypeComposition: 0.7,
    recoveryRadialProfile: 0.55,
    recoveryCentroidAndSize: 0.35,
    recoveryShape: 0.55,
  },
  broad: {
    candidateCount: 1_024,
    ticks: 240,
    warmupTicks: 60,
    sampleEveryTicks: 120,
    seeds: 1,
    finalists: 16,
  },
  refinement: {
    ticks: 1_800,
    warmupTicks: 600,
    sampleEveryTicks: 300,
    seeds: 3,
    finalists: 4,
  },
  finalist: {
    ticks: 54_000,
    warmupTicks: 3_600,
    perturbAtTick: 36_000,
    recoveryStartTick: 43_200,
    sampleEveryTicks: 600,
  },
} as const;
import { particleConfig } from '@/config/particles';
