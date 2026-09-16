import { describe, expect, it } from 'vitest';
import { MorphologyMetrics, defaultMetricsConfig } from '@/../scripts/morphology/metrics';
import { ParticleStore } from '@/runtime/sim/ParticleStore';
import type { HabitatSDF } from '@/runtime/sim/WorldDomain';
import { createHabitatDomain } from '@/runtime/sim/WorldDomain';
import { substrateConfig } from '@/config/substrate';

function createDomain(): HabitatSDF {
  return createHabitatDomain(substrateConfig.world.boundsUnits, substrateConfig.habitat, 7);
}

describe('MorphologyMetrics', () => {
  it('boş dünyada sıfır metrik üretir', () => {
    const metrics = new MorphologyMetrics(defaultMetricsConfig);
    const particles = new ParticleStore(4);
    const domain = createDomain();
    const sample = metrics.sample(particles, domain, 0, 0);
    expect(sample.activeCount).toBe(0);
    expect(sample.meanSpeed).toBe(0);
    expect(sample.stalledFraction).toBe(0);
  });

  it('aktif parçacık sayısı ve hız metrikleri doğru ölçer', () => {
    const metrics = new MorphologyMetrics(defaultMetricsConfig);
    const particles = new ParticleStore(4);
    particles.activateSlot(500, 500, 1, 0, 0);
    particles.activateSlot(520, 500, 0, 1, 1);
    const domain = createDomain();
    const sample = metrics.sample(particles, domain, 0, 0);
    expect(sample.activeCount).toBe(2);
    expect(sample.meanSpeed).toBeCloseTo(1, 5);
    expect(sample.stalledFraction).toBe(0);
  });

  it('tür kompozisyonu doğru hesaplar', () => {
    const metrics = new MorphologyMetrics(defaultMetricsConfig);
    const particles = new ParticleStore(4);
    particles.activateSlot(500, 500, 0, 0, 0);
    particles.activateSlot(520, 500, 0, 0, 0);
    particles.activateSlot(540, 500, 0, 0, 1);
    const domain = createDomain();
    const sample = metrics.sample(particles, domain, 0, 0);
    expect(sample.typeComposition[0]).toBeCloseTo(2 / 3, 5);
    expect(sample.typeComposition[1]).toBeCloseTo(1 / 3, 5);
  });

  it('zaman serisi birikir', () => {
    const metrics = new MorphologyMetrics(defaultMetricsConfig);
    const particles = new ParticleStore(2);
    particles.activateSlot(500, 500, 1, 0, 0);
    const domain = createDomain();
    metrics.sample(particles, domain, 0, 0);
    metrics.sample(particles, domain, 30, 0);
    metrics.sample(particles, domain, 60, 0);
    expect(metrics.timeSeries).toHaveLength(3);
    expect(metrics.timeSeries[0].tick).toBe(0);
    expect(metrics.timeSeries[2].tick).toBe(60);
  });

  it('reset zaman serisini temizler', () => {
    const metrics = new MorphologyMetrics(defaultMetricsConfig);
    const particles = new ParticleStore(2);
    particles.activateSlot(500, 500, 1, 0, 0);
    const domain = createDomain();
    metrics.sample(particles, domain, 0, 0);
    metrics.reset();
    expect(metrics.timeSeries).toHaveLength(0);
  });
});
