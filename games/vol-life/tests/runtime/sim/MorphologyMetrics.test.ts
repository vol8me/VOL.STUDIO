import { describe, expect, it } from 'vitest';
import { particleConfig } from '@/config/particles';
import { analyzeMorphologyFrame, detectParticleClusters } from '@/runtime/sim/MorphologyMetrics';
import { ParticleStore } from '@/runtime/sim/ParticleStore';

const bounds = { x: 0, y: 0, width: 512, height: 512 };
const options = {
  clusterRadiusUnits: 32,
  minimumClusterSize: 3,
  movingSpeedUnitsPerReferenceTick: 0.1,
};

function store(points: readonly [number, number][]): ParticleStore {
  const particles = new ParticleStore(points.length);
  points.forEach(([x, y], index) => {
    particles.x[index] = x;
    particles.y[index] = y;
    particles.previousX[index] = x;
    particles.previousY[index] = y;
    particles.type[index] = index % 6;
  });
  return particles;
}

describe('morfoloji küme tespiti', () => {
  it('tek bağlı yapıyı bir küme olarak bulur', () => {
    const particles = store([
      [100, 100],
      [120, 100],
      [140, 100],
    ]);

    expect(detectParticleClusters(particles, bounds, 128, 32).map((x) => x.members.length)).toEqual(
      [3],
    );
  });

  it('iki yapıyı ayırır ve dağınık parçacıkları tekil bırakır', () => {
    const particles = store([
      [50, 50],
      [60, 50],
      [300, 300],
      [310, 300],
      [490, 20],
    ]);

    const sizes = detectParticleClusters(particles, bounds, 128, 24)
      .map((cluster) => cluster.members.length)
      .sort((left, right) => right - left);
    expect(sizes).toEqual([2, 2, 1]);
  });

  it('iç ve dış tür halkasını katmanlaşma olarak ölçer', () => {
    const particles = store([
      [250, 256],
      [262, 256],
      [226, 256],
      [286, 256],
      [206, 256],
      [306, 256],
    ]);
    particles.type.set([0, 0, 2, 2, 5, 5]);

    const metrics = analyzeMorphologyFrame(particles, bounds, particleConfig, {
      ...options,
      clusterRadiusUnits: 64,
    });

    expect(metrics.clusteredFraction).toBe(1);
    expect(metrics.meanLayering).toBeGreaterThan(0.5);
  });

  it('eş yönlü yörüngeyi ve statik kristali ayrı failure metriclerinde gösterir', () => {
    const orbit = store([
      [236, 256],
      [256, 236],
      [276, 256],
      [256, 276],
    ]);
    orbit.vx.set([0, 1, 0, -1]);
    orbit.vy.set([-1, 0, 1, 0]);
    const frozen = store([
      [236, 256],
      [256, 236],
      [276, 256],
      [256, 276],
    ]);

    const orbitMetrics = analyzeMorphologyFrame(orbit, bounds, particleConfig, options);
    const frozenMetrics = analyzeMorphologyFrame(frozen, bounds, particleConfig, options);

    expect(orbitMetrics.orbitDominance).toBeGreaterThan(0.9);
    expect(frozenMetrics.staticFraction).toBe(1);
    expect(orbitMetrics.staticFraction).toBe(0);
  });
});
