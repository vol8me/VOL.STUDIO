import { describe, expect, it } from 'vitest';
import { MorphologyMetrics, defaultMetricsConfig } from '@/../scripts/morphology/metrics';
import { ClusterTracker, defaultClusterConfig } from '@/../scripts/morphology/clusterTracker';
import { ParticleStore } from '@/runtime/sim/ParticleStore';
import type { HabitatSDF } from '@/runtime/sim/WorldDomain';
import { createHabitatDomain } from '@/runtime/sim/WorldDomain';
import { substrateConfig } from '@/config/substrate';

function createDomain(): HabitatSDF {
  return createHabitatDomain(substrateConfig.world.boundsUnits, substrateConfig.habitat, 7);
}

/** Merkez çevresinde sıkı blob; tracker'ın yoğunluk şartını rahatça geçer. */
function blob(
  particles: ParticleStore,
  centerX: number,
  centerY: number,
  count: number,
  type = 0,
): void {
  for (let index = 0; index < count; index++) {
    const angle = (index / count) * Math.PI * 2;
    const radius = 6 + (index % 3) * 2;
    particles.activateSlot(
      centerX + Math.cos(angle) * radius,
      centerY + Math.sin(angle) * radius,
      0,
      0,
      type,
    );
  }
}

const TRACKER_CONFIG = {
  ...defaultClusterConfig,
  epsUnits: 24,
  minPts: 3,
  minClusterSize: 4,
  minContinuityTicks: 0,
  maxGapTicks: 10,
  centroidGateUnits: 200,
  sampleIntervalTicks: 1,
};

describe('MorphologyMetrics — global katman', () => {
  it('boş dünyada sıfır metrik üretir', () => {
    const metrics = new MorphologyMetrics(defaultMetricsConfig);
    const sample = metrics.sample(new ParticleStore(4), createDomain(), 0, 0);

    expect(sample.activeCount).toBe(0);
    expect(sample.meanSpeed).toBe(0);
    expect(sample.stalledFraction).toBe(0);
    expect(sample.clusterCount).toBe(0);
    expect(sample.clusteredFraction).toBe(0);
    expect(sample.clusters).toEqual([]);
  });

  it('aktif parçacık sayısı ve hız metriklerini doğru ölçer', () => {
    const metrics = new MorphologyMetrics(defaultMetricsConfig);
    const particles = new ParticleStore(4);
    particles.activateSlot(500, 500, 1, 0, 0);
    particles.activateSlot(520, 500, 0, 1, 1);

    const sample = metrics.sample(particles, createDomain(), 0, 0);

    expect(sample.activeCount).toBe(2);
    expect(sample.meanSpeed).toBeCloseTo(1, 5);
    expect(sample.stalledFraction).toBe(0);
  });

  it('tür kompozisyonunu doğru hesaplar', () => {
    const metrics = new MorphologyMetrics(defaultMetricsConfig);
    const particles = new ParticleStore(4);
    particles.activateSlot(500, 500, 0, 0, 0);
    particles.activateSlot(520, 500, 0, 0, 0);
    particles.activateSlot(540, 500, 0, 0, 1);

    const sample = metrics.sample(particles, createDomain(), 0, 0);

    expect(sample.typeComposition[0]).toBeCloseTo(2 / 3, 5);
    expect(sample.typeComposition[1]).toBeCloseTo(1 / 3, 5);
  });

  it('zaman serisi birikir ve reset temizler', () => {
    const metrics = new MorphologyMetrics(defaultMetricsConfig);
    const particles = new ParticleStore(2);
    particles.activateSlot(500, 500, 1, 0, 0);
    const domain = createDomain();

    metrics.sample(particles, domain, 0, 0);
    metrics.sample(particles, domain, 30, 0);
    metrics.sample(particles, domain, 60, 0);

    expect(metrics.timeSeries).toHaveLength(3);
    expect(metrics.timeSeries[2].tick).toBe(60);

    metrics.reset();
    expect(metrics.timeSeries).toHaveLength(0);
  });
});

/*
 * E5: metrikler kendi başına YENİDEN KÜMELEMEZ; küme katmanı tracker
 * üyeliğinden gelir. Aksi hâlde iki ayrı kümeleme tanımı sessizce ayrışır ve
 * "küme" kelimesi iki farklı şey anlatmaya başlar.
 */
describe('MorphologyMetrics — per-cluster katman (E5)', () => {
  it('küme kayıtları tracker üyeliğinden gelir ve boyuta göre sıralanır', () => {
    const particles = new ParticleStore(64);
    blob(particles, 300, 300, 9);
    blob(particles, 700, 700, 5, 1);
    const tracker = new ClusterTracker(TRACKER_CONFIG);
    const metrics = new MorphologyMetrics(defaultMetricsConfig);
    tracker.update(particles, 0);

    const sample = metrics.sample(particles, createDomain(), 0, 0, tracker.activeClusters);

    expect(sample.clusterCount).toBe(2);
    expect(sample.clusters).toHaveLength(2);
    expect(sample.clusters[0].size).toBeGreaterThanOrEqual(sample.clusters[1].size);
    expect(sample.clusterSizeMax).toBe(sample.clusters[0].size);
    expect(sample.clusteredFraction).toBeCloseTo(14 / 14, 5);
    expect(sample.clusters[0].ageTicks).toBe(0);
  });

  it('küme kaydı biçim ölçülerini ve tür kompozisyonunu taşır', () => {
    const particles = new ParticleStore(32);
    blob(particles, 400, 400, 12, 2);
    const tracker = new ClusterTracker(TRACKER_CONFIG);
    const metrics = new MorphologyMetrics(defaultMetricsConfig);
    tracker.update(particles, 0);

    const record = metrics.sample(particles, createDomain(), 0, 0, tracker.activeClusters)
      .clusters[0];

    expect(record.solidity).toBeGreaterThan(0);
    expect(record.holeRatio).toBeGreaterThanOrEqual(0);
    expect(record.normalizedGyration).toBeGreaterThan(0);
    expect(record.typeComposition[2]).toBeCloseTo(1, 5);
    expect(record.centroidX).toBeCloseTo(400, 0);
  });

  it('ilk K küme kaydedilir, sayım bütün kümeleri sayar', () => {
    const particles = new ParticleStore(128);
    for (let index = 0; index < 7; index++) blob(particles, 200 + index * 100, 400, 5);
    const tracker = new ClusterTracker(TRACKER_CONFIG);
    const metrics = new MorphologyMetrics({ ...defaultMetricsConfig, topClusterCount: 3 });
    tracker.update(particles, 0);

    const sample = metrics.sample(particles, createDomain(), 0, 0, tracker.activeClusters);

    expect(sample.clusterCount).toBe(7);
    expect(sample.clusters).toHaveLength(3);
  });

  /* Entegrasyon: churn tracker ÜYELİĞİNDEN çıkar, konumlardan değil. */
  it('churn üyelik değişince artar, kadro sabitken sıfır kalır', () => {
    const particles = new ParticleStore(32);
    blob(particles, 400, 400, 8);
    const tracker = new ClusterTracker(TRACKER_CONFIG);
    const metrics = new MorphologyMetrics(defaultMetricsConfig);

    tracker.update(particles, 0);
    metrics.sample(particles, createDomain(), 0, 0, tracker.activeClusters);
    tracker.update(particles, 1);
    const steady = metrics.sample(particles, createDomain(), 1, 0, tracker.activeClusters);

    expect(steady.clusters[0].churn).toBe(0);

    // İki üyeyi öldür, yerlerine YENİ stable ID'li iki madde doğsun.
    particles.deactivateSlot(0);
    particles.deactivateSlot(1);
    particles.activateSlot(404, 404, 0, 0, 0);
    particles.activateSlot(396, 396, 0, 0, 0);
    tracker.update(particles, 2);
    const churned = metrics.sample(particles, createDomain(), 2, 0, tracker.activeClusters);

    expect(churned.clusters[0].churn).toBeGreaterThan(0);
  });
});
