import { describe, expect, it } from 'vitest';
import { ClusterTracker, defaultClusterConfig } from '@/../scripts/morphology/clusterTracker';
import { ParticleStore } from '@/runtime/sim/ParticleStore';

describe('ClusterTracker', () => {
  it('boş dünyada küme bulmaz', () => {
    const tracker = new ClusterTracker(defaultClusterConfig);
    const particles = new ParticleStore(8);
    tracker.update(particles, 0);
    expect(tracker.activeClusters).toHaveLength(0);
  });

  it('yakın parçacıkları küme olarak tanır', () => {
    const tracker = new ClusterTracker({
      ...defaultClusterConfig,
      neighborRadiusUnits: 20,
      minClusterSize: 3,
    });
    const particles = new ParticleStore(8);
    particles.spawn(500, 500, 0, 0, 0);
    particles.spawn(510, 500, 0, 0, 0);
    particles.spawn(520, 500, 0, 0, 0);
    particles.spawn(800, 800, 0, 0, 0);
    tracker.update(particles, 0);
    expect(tracker.activeClusters.length).toBeGreaterThanOrEqual(1);
  });

  it('uzak parçacıkları ayrı küme sayar', () => {
    const tracker = new ClusterTracker({
      ...defaultClusterConfig,
      neighborRadiusUnits: 15,
      minClusterSize: 2,
    });
    const particles = new ParticleStore(8);
    particles.spawn(500, 500, 0, 0, 0);
    particles.spawn(505, 500, 0, 0, 0);
    particles.spawn(800, 800, 0, 0, 0);
    particles.spawn(805, 800, 0, 0, 0);
    tracker.update(particles, 0);
    expect(tracker.activeClusters).toHaveLength(2);
  });

  it('doğum olayı kaydeder', () => {
    const tracker = new ClusterTracker({
      ...defaultClusterConfig,
      neighborRadiusUnits: 20,
      minClusterSize: 3,
      minContinuityTicks: 1,
    });
    const particles = new ParticleStore(8);
    particles.spawn(500, 500, 0, 0, 0);
    particles.spawn(510, 500, 0, 0, 0);
    particles.spawn(520, 500, 0, 0, 0);
    tracker.update(particles, 0);
    expect(tracker.eventLog.some((e) => e.kind === 'birth')).toBe(true);
  });

  it('reset temizler', () => {
    const tracker = new ClusterTracker(defaultClusterConfig);
    const particles = new ParticleStore(8);
    particles.spawn(500, 500, 0, 0, 0);
    particles.spawn(510, 500, 0, 0, 0);
    particles.spawn(520, 500, 0, 0, 0);
    tracker.update(particles, 0);
    tracker.reset();
    expect(tracker.activeClusters).toHaveLength(0);
    expect(tracker.eventLog).toHaveLength(0);
  });
});
