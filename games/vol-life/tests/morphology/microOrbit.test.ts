import { describe, expect, it } from 'vitest';
import {
  defaultMicroOrbitConfig,
  measureMicroOrbits,
  type ClusterWindow,
} from '@/../scripts/morphology/microOrbit';

/*
 * E7: aranan şey KÖTÜ DÖNGÜ — küçük, kapalı yörüngeli, aynı mesafede duran ve
 * üye değiştirmeyen halka. İYİ DÖNÜŞ (büyük, deforme, üye değiştiren, yer
 * değiştiren) işaretlenmez.
 *
 * Ölçülen ground truth (2026-09-16): kötü döngü tur 2,00 / uyum 1,00 /
 * yarıçap değişimi 0,000 / sürüklenme 0,00 / üye değişimi 0,00 → işaretli;
 * iyi dönüş 12 üye / yarıçap değişimi 0,192 / sürüklenme 1,87 / üye değişimi
 * 0,67 → işaretsiz.
 *
 * Aşağıdaki testler elemelerin HER BİRİNİ ayrı ayrı sınar: dört koşul aynı
 * anda bozulursa hangisinin çalıştığı bilinmez.
 */
const STEPS = 24;

function ringWindow(options: {
  count?: number;
  radius?: number;
  turns?: number;
  radiusGrowth?: number;
  driftPerStep?: number;
  replaceHalf?: boolean;
}): ClusterWindow {
  const count = options.count ?? 5;
  const radius = options.radius ?? 12;
  const turns = options.turns ?? 2;
  const growth = options.radiusGrowth ?? 0;
  const drift = options.driftPerStep ?? 0;
  const ids = Array.from({ length: count }, (_, index) => index + 1);
  const membersAtEnd = options.replaceHalf
    ? [
        ...ids.slice(Math.floor(count / 2)),
        ...Array.from({ length: Math.floor(count / 2) }, (_, index) => 900 + index),
      ]
    : ids;
  return {
    clusterId: 1,
    ageTicks: 600,
    membersAtStart: ids,
    membersAtEnd,
    tracks: ids.map((id, index) => ({
      id,
      positions: Array.from({ length: STEPS }, (_, step) => {
        const phase = (step / (STEPS - 1)) * turns * Math.PI * 2 + (index / count) * Math.PI * 2;
        const currentRadius = radius + step * growth;
        return {
          x: 500 + step * drift + Math.cos(phase) * currentRadius,
          y: 500 + Math.sin(phase) * currentRadius,
        };
      }),
    })),
  };
}

describe('Micro-orbit dedektörü (E7)', () => {
  it('küçük, kapalı, sabit yarıçaplı ve üye değiştirmeyen döngüyü işaretler', () => {
    const report = measureMicroOrbits([ringWindow({})], 40);
    const sample = report.samples[0];

    expect(sample.isMicroOrbit).toBe(true);
    expect(sample.turns).toBeCloseTo(2, 2);
    expect(sample.angularCoherence).toBeCloseTo(1, 2);
    expect(sample.radiusVariation).toBeLessThan(0.05);
    expect(sample.membershipExchangeRate).toBe(0);
    expect(report.persistentMicroOrbitFraction).toBeCloseTo(5 / 40, 5);
    expect(report.microOrbitLifetime).toBe(600);
  });

  it('tamamlanmamış tur kapalı yörünge sayılmaz', () => {
    const sample = measureMicroOrbits([ringWindow({ turns: 0.4 })], 40).samples[0];

    expect(sample.turns).toBeLessThan(defaultMicroOrbitConfig.minTurns);
    expect(sample.isMicroOrbit).toBe(false);
  });

  /* Dört elemenin her biri TEK BAŞINA yeterli olmalı. */
  it('yalnız büyük olduğu için elenir', () => {
    const sample = measureMicroOrbits([ringWindow({ count: 12 })], 40).samples[0];

    expect(sample.size).toBeGreaterThan(defaultMicroOrbitConfig.maxClusterSize);
    expect(sample.radiusVariation).toBeLessThan(defaultMicroOrbitConfig.maxRadiusVariation);
    expect(sample.membershipExchangeRate).toBe(0);
    expect(sample.isMicroOrbit).toBe(false);
  });

  it('yalnız deforme olduğu için elenir', () => {
    const sample = measureMicroOrbits([ringWindow({ radiusGrowth: 2 })], 40).samples[0];

    expect(sample.size).toBeLessThanOrEqual(defaultMicroOrbitConfig.maxClusterSize);
    expect(sample.radiusVariation).toBeGreaterThan(defaultMicroOrbitConfig.maxRadiusVariation);
    expect(sample.isMicroOrbit).toBe(false);
  });

  it('yalnız yer değiştirdiği için elenir', () => {
    const sample = measureMicroOrbits([ringWindow({ driftPerStep: 6 })], 40).samples[0];

    expect(sample.centroidDrift).toBeGreaterThan(defaultMicroOrbitConfig.maxCentroidDrift);
    expect(sample.membershipExchangeRate).toBe(0);
    expect(sample.isMicroOrbit).toBe(false);
  });

  it('yalnız üye değiştirdiği için elenir', () => {
    const sample = measureMicroOrbits([ringWindow({ replaceHalf: true })], 40).samples[0];

    expect(sample.membershipExchangeRate).toBeGreaterThan(
      defaultMicroOrbitConfig.maxMembershipExchange,
    );
    expect(sample.radiusVariation).toBeLessThan(defaultMicroOrbitConfig.maxRadiusVariation);
    expect(sample.isMicroOrbit).toBe(false);
  });

  it('yön değiştiren hareket açısal uyumu düşürür', () => {
    const ids = [1, 2, 3, 4];
    const window: ClusterWindow = {
      clusterId: 3,
      ageTicks: 100,
      membersAtStart: ids,
      membersAtEnd: ids,
      tracks: ids.map((id, index) => ({
        id,
        positions: Array.from({ length: STEPS }, (_, step) => {
          // İleri geri salınım: açı işareti sürekli değişir.
          const phase =
            Math.sin((step / 3) * Math.PI) * Math.PI + (index / ids.length) * Math.PI * 2;
          return { x: 500 + Math.cos(phase) * 12, y: 500 + Math.sin(phase) * 12 };
        }),
      })),
    };

    const sample = measureMicroOrbits([window], 40).samples[0];

    expect(sample.angularCoherence).toBeLessThan(defaultMicroOrbitConfig.minAngularCoherence);
    expect(sample.isMicroOrbit).toBe(false);
  });

  it('boş pencere ve sıfır aktif madde sıfır pay verir', () => {
    const empty = measureMicroOrbits([], 0);

    expect(empty.persistentMicroOrbitFraction).toBe(0);
    expect(empty.microOrbitLifetime).toBe(0);
    expect(empty.samples).toEqual([]);
  });
});
