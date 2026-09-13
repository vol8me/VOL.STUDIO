import { describe, expect, it } from 'vitest';
import { particleConfig } from '@/config/particles';
import {
  analyzeMorphologyFrame,
  compareClusterMembership,
  detectParticleClusters,
} from '@/runtime/sim/MorphologyMetrics';
import { ParticleStore } from '@/runtime/sim/ParticleStore';

const bounds = { x: 0, y: 0, width: 512, height: 512 };
const options = {
  clusterRadiusUnits: 32,
  minimumClusterSize: 3,
  movingSpeedUnitsPerReferenceTick: 0.1,
  roleByType: [0, 0, 1, 1, 2, 2],
  wallSupportShare: 0.2,
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

    expect(
      detectParticleClusters(particles, bounds, 128, 32, options.roleByType).map(
        (x) => x.members.length,
      ),
    ).toEqual([3]);
  });

  it('iki yapıyı ayırır ve dağınık parçacıkları tekil bırakır', () => {
    const particles = store([
      [50, 50],
      [60, 50],
      [300, 300],
      [310, 300],
      [490, 20],
    ]);

    const sizes = detectParticleClusters(particles, bounds, 128, 24, options.roleByType)
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

  it('uzun bağlı zinciri sıkı iki boyutlu yapıdan ayırır', () => {
    const chain = store(Array.from({ length: 9 }, (_, index) => [80 + index * 20, 200] as const));
    const compact = store(
      Array.from(
        { length: 9 },
        (_, index) => [200 + (index % 3) * 10, 200 + Math.floor(index / 3) * 10] as const,
      ),
    );

    const chainMetrics = analyzeMorphologyFrame(chain, bounds, particleConfig, options);
    const compactMetrics = analyzeMorphologyFrame(compact, bounds, particleConfig, options);

    expect(compactMetrics.meanCompactness).toBeGreaterThan(chainMetrics.meanCompactness + 0.3);
    expect(chainMetrics.meanShapeAnisotropy).toBeGreaterThan(0.95);
  });

  it('tekil parçacıkların hareketli ve durmuş paylarını ayrı ölçer', () => {
    const particles = store([
      [100, 100],
      [110, 100],
      [120, 100],
      [300, 300],
      [400, 400],
    ]);
    particles.vx[4] = 1;

    const metrics = analyzeMorphologyFrame(particles, bounds, particleConfig, options);

    expect(metrics.isolatedFraction).toBeCloseTo(0.4);
    expect(metrics.stalledIsolatedFraction).toBeCloseTo(0.2);
  });

  it('duvara yaslanan yapıyı iç yapıyla karıştırmaz', () => {
    const wall = store([
      [5, 100],
      [10, 110],
      [15, 100],
    ]);
    const interior = store([
      [200, 200],
      [210, 210],
      [220, 200],
    ]);

    expect(
      analyzeMorphologyFrame(wall, bounds, particleConfig, options).wallSupportedStructureFraction,
    ).toBe(1);
    expect(
      analyzeMorphologyFrame(interior, bounds, particleConfig, options)
        .wallSupportedStructureFraction,
    ).toBe(0);
  });

  it('karşıt dönen alt grupların imzalarını birbirini götürmeden raporlar', () => {
    const particles = store([
      [276, 256],
      [256, 236],
      [236, 256],
      [256, 276],
    ]);
    particles.vx.set([0, 1, 0, 1]);
    particles.vy.set([1, 0, 1, 0]);

    const metrics = analyzeMorphologyFrame(particles, bounds, particleConfig, options);

    expect(metrics.orbitActivity).toBeGreaterThan(0.9);
    expect(metrics.orbitDominance).toBeLessThan(0.1);
  });

  it('aynı büyüklükte fakat bütünüyle farklı üyeliği toparlanma saymaz', () => {
    expect(compareClusterMembership([{ members: [0, 1, 2] }], [{ members: [3, 4, 5] }])).toBe(0);
    expect(compareClusterMembership([{ members: [0, 1, 2] }], [{ members: [0, 1, 2] }])).toBe(1);
  });
});
