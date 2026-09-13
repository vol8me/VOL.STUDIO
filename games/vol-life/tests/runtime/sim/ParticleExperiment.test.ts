import { describe, expect, it } from 'vitest';
import { morphologySearchConfig } from '@/config/morphology';
import { particleConfig } from '@/config/particles';
import { worldConfig } from '@/config/world';
import { resolveParticleBounds } from '@/runtime/sim/WorldBounds';
import {
  runParticleExperiment,
  updateClusterTracks,
  type ClusterTrack,
} from '../../../scripts/morphology/ParticleExperiment.mts';
import type { ParticleCluster } from '@/runtime/sim/MorphologyMetrics';

function run(seed: number) {
  return runParticleExperiment({
    seed,
    bounds: worldConfig.boundsUnits,
    collisionBounds: resolveParticleBounds(
      worldConfig.boundsUnits,
      worldConfig.particleCollisionInsetUnits,
    ),
    fixedStepMs: worldConfig.fixedStepMs,
    particles: { ...particleConfig, count: 24 },
    analysis: { ...morphologySearchConfig.analysis, minimumClusterSize: 3 },
    wallModel: 'contact-impulse-v2',
    durationSeconds: 2,
    checkpointsSeconds: [1, 2],
    temporalSampleEverySeconds: 0.5,
  });
}

describe('ParticleExperiment', () => {
  it('istenen checkpointlerde tam zaman serisi ve temporal özet üretir', () => {
    const result = run(42);

    expect(result.checkpoints.map((sample) => sample.seconds)).toEqual([1, 2]);
    expect(result.checkpoints[0]).toHaveProperty('medianSpeed');
    expect(result.checkpoints[0]).toHaveProperty('averageNeighborCount');
    expect(result.summary).toHaveProperty('wallDwellFraction');
    expect(result.summary).toHaveProperty('structuralDiversity');
  });

  it('aynı seed ve tam config ile birebir deterministic sonuç verir', () => {
    expect(run(42)).toEqual(run(42));
    expect(run(42)).not.toEqual(run(43));
  });

  it('uzun süre kaybolup tekrar beliren kümeleri yeni track olarak başlatır ve lifespanı şişirmez', () => {
    const tracks = new Map<number, ClusterTrack>();
    let nextId = 1;
    const cluster: ParticleCluster = {
      members: [1, 2, 3, 4],
      centerX: 10,
      centerY: 10,
      meanRadius: 5,
      layering: 0.5,
      radialLayering: 0.5,
      orbitCoherence: 0,
      orbitActivity: 0,
      compactness: 0.8,
      shapeAnisotropy: 0.1,
      neighborLinks: 6,
      typeComposition: [4, 0, 0, 0],
    };

    // t=0s ilk tespit
    nextId = updateClusterTracks([cluster], tracks, nextId, 0, 1.5);
    expect(tracks.size).toBe(1);
    expect(tracks.get(1)?.firstSeconds).toBe(0);
    expect(tracks.get(1)?.lastSeconds).toBe(0);

    // t=1s ardışık güncelleme (gap 1s <= 1.5s) -> aynı track güncellenir
    nextId = updateClusterTracks([cluster], tracks, nextId, 1, 1.5);
    expect(tracks.size).toBe(1);
    expect(tracks.get(1)?.lastSeconds).toBe(1);

    // t=10s yeniden beliriş (gap 9s > 1.5s) -> eski track değil yeni track açılmalı
    nextId = updateClusterTracks([cluster], tracks, nextId, 10, 1.5);
    expect(nextId).toBe(3);
    expect(tracks.size).toBe(2);
    expect(tracks.get(1)?.lastSeconds).toBe(1);
    expect(tracks.get(2)?.firstSeconds).toBe(10);
    expect(tracks.get(2)?.lastSeconds).toBe(10);
  });
});
