export interface MorphologyAnalysisOptions {
  readonly clusterRadiusUnits: number;
  readonly minimumClusterSize: number;
  readonly movingSpeedUnitsPerReferenceTick: number;
}

export const morphologySearchConfig = {
  version: 1,
  particleCount: 512,
  seedCorpus: [0x10fe1, 0x51a7, 0xc0ffee, 0x7f4a7c15, 0x13579bdf],
  analysis: {
    clusterRadiusUnits: 40,
    minimumClusterSize: 12,
    movingSpeedUnitsPerReferenceTick: 0.08,
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
