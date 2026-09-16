import { describe, expect, it } from 'vitest';
import {
  ClusterTracker,
  defaultClusterConfig,
  validateClusterTrackerConfig,
  type ClusterTrackerConfig,
} from '@/../scripts/morphology/clusterTracker';
import { ParticleStore } from '@/runtime/sim/ParticleStore';

/*
 * E4 senaryolu kinematik fixture'lar. İzleyici ARAŞTIRMA aracıdır: sorduğu şey
 * "aynı yapı mı devam ediyor" — bu yüzden üyelik slot değil STABLE ID taşır ve
 * bütün iddialar kimlik sürekliliği üzerinden kurulur.
 *
 * Izgara dünya sınırı 1024 birimdir (izleyicinin kendi kurduğu hash); bütün
 * fixture'lar bu alanın içine yerleşir.
 */
const CONFIG: ClusterTrackerConfig = {
  ...defaultClusterConfig,
  epsUnits: 24,
  minPts: 3,
  minClusterSize: 4,
  minContinuityTicks: 0,
  maxGapTicks: 10,
  centroidGateUnits: 200,
  sizeRatioGate: 4,
  sampleIntervalTicks: 1,
};

/** Merkez çevresine sıkı bir blob: her üye eps içinde minPts komşu görür. */
function blob(centerX: number, centerY: number, count = 5): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let index = 0; index < count; index++) {
    const angle = (index / count) * Math.PI * 2;
    points.push({ x: centerX + Math.cos(angle) * 6, y: centerY + Math.sin(angle) * 6 });
  }
  return points;
}

function store(points: { x: number; y: number }[], capacity = 64): ParticleStore {
  const particles = new ParticleStore(capacity);
  for (const point of points) particles.activateSlot(point.x, point.y, 0, 0, 0);
  return particles;
}

/** Aktif slotların konumlarını yerinde günceller; stable ID'ler korunur. */
function moveAll(particles: ParticleStore, dx: number, dy: number): void {
  for (let slot = 0; slot < particles.capacity; slot++) {
    if (particles.active[slot] === 0) continue;
    particles.x[slot] += dx;
    particles.y[slot] += dy;
  }
}

function idsOf(particles: ParticleStore): number[] {
  const ids: number[] = [];
  for (let slot = 0; slot < particles.capacity; slot++) {
    if (particles.active[slot] === 1) ids.push(particles.stableId[slot]);
  }
  return ids;
}

describe('ClusterTracker yapılandırması', () => {
  it('örnek aralığına tam bölünmeyen süreyi reddeder', () => {
    expect(() =>
      validateClusterTrackerConfig({ ...CONFIG, sampleIntervalTicks: 10, maxGapTicks: 15 }),
    ).toThrow(RangeError);
    expect(() =>
      validateClusterTrackerConfig({ ...CONFIG, sampleIntervalTicks: 10, minContinuityTicks: 25 }),
    ).toThrow(RangeError);
  });

  it('minPts’ten küçük küme boyutunu ve bozuk eşikleri reddeder', () => {
    expect(() => validateClusterTrackerConfig({ ...CONFIG, minClusterSize: 2 })).toThrow(
      RangeError,
    );
    expect(() => validateClusterTrackerConfig({ ...CONFIG, minPts: 1 })).toThrow(RangeError);
    expect(() => validateClusterTrackerConfig({ ...CONFIG, overlapThreshold: 0 })).toThrow(
      RangeError,
    );
    expect(() => validateClusterTrackerConfig({ ...CONFIG, sizeRatioGate: 0.5 })).toThrow(
      RangeError,
    );
    expect(() => validateClusterTrackerConfig({ ...CONFIG, epsUnits: 0 })).toThrow(RangeError);
  });
});

describe('ClusterTracker kimlik sürekliliği (E4)', () => {
  it('yoğunluk şartı tek bağlantılı zincirlemeyi kırar', () => {
    /*
     * Eşit aralıklı zincir: aralık eps'in (24) üstünde olduğu için hiçbir nokta
     * kendisinden başka komşu görmez ve minPts=3 şartı hiçbir yerde sağlanmaz.
     * (Komşuluk kendini de sayar; ilk kurgum bunu atladığı için zincir küme
     * oluyordu — fixture düzeltildi, eşik değil.)
     */
    const chain = Array.from({ length: 8 }, (_, index) => ({ x: 300 + index * 30, y: 300 }));
    const tracker = new ClusterTracker(CONFIG);

    tracker.update(store(chain), 0);

    expect(tracker.activeClusters).toHaveLength(0);
  });

  it('iki blob birbirinin içinden geçerken ID’ler korunur', () => {
    const tracker = new ClusterTracker(CONFIG);
    const left = store(blob(300, 400));
    const right = store(blob(700, 400));
    tracker.update(left, 0);
    const leftId = tracker.activeClusters[0].id;

    for (let tick = 1; tick <= 3; tick++) {
      moveAll(left, 40, 0);
      tracker.update(left, tick);
    }

    expect(tracker.activeClusters.map((cluster) => cluster.id)).toEqual([leftId]);
    expect(right.activeCount).toBe(5);
  });

  it('bölünmede en büyük parça ID’yi korur, diğeri ebeveyni işaretler', () => {
    const tracker = new ClusterTracker(CONFIG);
    const particles = store([...blob(400, 400, 6), ...blob(430, 400, 4)]);
    tracker.update(particles, 0);
    const parentId = tracker.activeClusters[0].id;

    // Küçük parçayı uzağa taşı: iki ayrı yoğunluk kalır.
    for (let slot = 6; slot < 10; slot++) particles.x[slot] += 300;
    tracker.update(particles, 1);

    const splits = tracker.eventLog.filter((event) => event.kind === 'split');
    expect(splits).toHaveLength(1);
    expect(splits[0].relatedId).toBe(parentId);
    expect(tracker.activeClusters.map((cluster) => cluster.id)).toContain(parentId);
  });

  it('birleşmede en büyük örtüşme hayatta kalır, diğeri merge olayıyla biter', () => {
    const tracker = new ClusterTracker(CONFIG);
    const particles = store([...blob(400, 400, 6), ...blob(700, 400, 5)]);
    tracker.update(particles, 0);
    expect(tracker.activeClusters).toHaveLength(2);

    for (let slot = 6; slot < 11; slot++) particles.x[slot] -= 290;
    tracker.update(particles, 1);

    expect(tracker.eventLog.some((event) => event.kind === 'merge')).toBe(true);
    expect(tracker.activeClusters).toHaveLength(1);
  });

  it('gap içinde yeniden toplanan küme ID’yi korur, gap aşılınca yeni ID alır', () => {
    const tracker = new ClusterTracker({ ...CONFIG, maxGapTicks: 2 });
    const particles = store(blob(400, 400));
    tracker.update(particles, 0);
    const original = tracker.activeClusters[0].id;

    // Dağıt: yoğunluk kaybolur ama gap içinde geri toplanır.
    const spread = particles.x.slice();
    for (let slot = 0; slot < 5; slot++) particles.x[slot] += slot * 120;
    tracker.update(particles, 1);
    particles.x.set(spread);
    tracker.update(particles, 2);

    expect(tracker.activeClusters.map((cluster) => cluster.id)).toEqual([original]);

    for (let slot = 0; slot < 5; slot++) particles.x[slot] += slot * 120;
    for (let tick = 3; tick <= 6; tick++) tracker.update(particles, tick);
    particles.x.set(spread);
    tracker.update(particles, 7);

    expect(tracker.activeClusters[0].id).not.toBe(original);
    expect(tracker.eventLog.some((event) => event.kind === 'death')).toBe(true);
  });

  /* Slot yeniden kullanımı en sinsi sahte sürekliliktir: aynı slot, başka madde. */
  it('slot yeniden kullanımı sahte süreklilik üretmez', () => {
    const tracker = new ClusterTracker({ ...CONFIG, maxGapTicks: 0 });
    const particles = store(blob(400, 400));
    tracker.update(particles, 0);
    const original = tracker.activeClusters[0].id;
    const firstIds = idsOf(particles);

    for (let slot = 0; slot < 5; slot++) particles.deactivateSlot(slot);
    for (const point of blob(400, 400)) particles.activateSlot(point.x, point.y, 0, 0, 0);
    tracker.update(particles, 1);

    expect(idsOf(particles)).not.toEqual(firstIds);
    expect(tracker.activeClusters[0].id).not.toBe(original);
  });

  it('slot sırası permütasyonu sonucu değiştirmez', () => {
    const points = blob(400, 400);
    const straight = new ClusterTracker(CONFIG);
    const shuffled = new ClusterTracker(CONFIG);

    straight.update(store(points), 0);
    shuffled.update(store([...points].reverse()), 0);

    expect(straight.activeClusters).toHaveLength(shuffled.activeClusters.length);
    expect(straight.activeClusters[0].memberIds.length).toBe(
      shuffled.activeClusters[0].memberIds.length,
    );
    expect(straight.activeClusters[0].centroidX).toBeCloseTo(
      shuffled.activeClusters[0].centroidX,
      6,
    );
  });

  it('aynı girdi aynı olay günlüğünü üretir (determinizm)', () => {
    const run = (): string => {
      const tracker = new ClusterTracker(CONFIG);
      const particles = store([...blob(400, 400, 6), ...blob(700, 400, 5)]);
      tracker.update(particles, 0);
      for (let slot = 6; slot < 11; slot++) particles.x[slot] -= 290;
      tracker.update(particles, 1);
      return JSON.stringify(tracker.eventLog);
    };

    expect(run()).toBe(run());
  });

  it('reset izleyiciyi tamamen boşaltır', () => {
    const tracker = new ClusterTracker(CONFIG);
    tracker.update(store(blob(400, 400)), 0);
    tracker.reset();

    expect(tracker.activeClusters).toHaveLength(0);
    expect(tracker.eventLog).toHaveLength(0);
  });
});
