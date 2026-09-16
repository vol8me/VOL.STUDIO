import { describe, expect, it } from 'vitest';
import { defaultSubstrateCandidate, type VoidProfile } from '@/config/candidate';
import { MatterReservoir } from '@/runtime/sim/MatterReservoir';
import { ParticleStore } from '@/runtime/sim/ParticleStore';
import { VoidSink } from '@/runtime/sim/VoidSink';
import type { VoidDeathEvent } from '@/runtime/sim/WorldEvents';
import type { HabitatSDF } from '@/runtime/sim/WorldDomain';
import { createHabitatDomain } from '@/runtime/sim/WorldDomain';
import { habitatConfig } from '@/config/habitat';
import { worldConfig } from '@/config/world';

const STORAGE = worldConfig.boundsUnits;

function domain(seed = 7): HabitatSDF {
  return createHabitatDomain(STORAGE, habitatConfig, seed);
}

function fringe(): VoidProfile {
  return defaultSubstrateCandidate.void;
}

/** Void profili sürümlüdür; testler varsayılandan türetir, elle şema yazmaz. */
function voidWith(patch: Partial<VoidProfile>): VoidProfile {
  return { ...defaultSubstrateCandidate.void, ...patch };
}

function normalAt(sdf: HabitatSDF, x: number, y: number): { x: number; y: number } {
  const sample = sdf.sampleDistanceAndNormal(x, y);
  return { x: sample.normalX, y: sample.normalY };
}

describe('VoidSink', () => {
  it('geçersiz fringe genişliği kurulumda reddeder', () => {
    expect(() => new VoidSink(domain(), voidWith({ widthUnits: 0, tidalStrength: 1 }))).toThrow(
      RangeError,
    );
    expect(() => new VoidSink(domain(), voidWith({ widthUnits: -1, tidalStrength: 1 }))).toThrow(
      RangeError,
    );
    expect(
      () => new VoidSink(domain(), voidWith({ widthUnits: Number.NaN, tidalStrength: 1 })),
    ).toThrow(RangeError);
  });

  it('geçersiz tidal stres kurulumda reddeder', () => {
    expect(() => new VoidSink(domain(), voidWith({ widthUnits: 24, tidalStrength: -1 }))).toThrow(
      RangeError,
    );
    expect(
      () => new VoidSink(domain(), voidWith({ widthUnits: 24, tidalStrength: Number.NaN })),
    ).toThrow(RangeError);
  });

  it('güvenli alandaki parçacığa kuvvet eklemez', () => {
    const sdf = domain();
    const sink = new VoidSink(sdf, fringe());
    const particles = new ParticleStore(1);
    const center = { x: STORAGE.x + STORAGE.width / 2, y: STORAGE.y + STORAGE.height / 2 };
    particles.activateSlot(center.x, center.y, 0, 0, 0);

    const affected = sink.applyFringeStress(particles);

    expect(affected).toBe(0);
    expect(particles.forceX[0]).toBe(0);
    expect(particles.forceY[0]).toBe(0);
    expect(particles.edgeDistance[0]).toBeGreaterThan(0);
  });

  it('fringe içindeki parçacığa dışa doğru stres uygular', () => {
    const sdf = domain();
    const sink = new VoidSink(sdf, fringe());
    const particles = new ParticleStore(1);
    const contour = sdf.contour(64);
    const cx = contour[0];
    const cy = contour[1];
    const normal = normalAt(sdf, cx, cy);
    const inside = { x: cx - normal.x * 2, y: cy - normal.y * 2 };
    particles.activateSlot(inside.x, inside.y, 0, 0, 0);

    const affected = sink.applyFringeStress(particles);

    expect(affected).toBe(1);
    expect(particles.edgeDistance[0]).toBeGreaterThanOrEqual(0);
    expect(particles.edgeDistance[0]).toBeLessThan(fringe().widthUnits);
  });

  it('tidalStrength sıfırsa fringe içinde bile kuvvet eklemez', () => {
    const sdf = domain();
    const noStress = voidWith({ widthUnits: 24, tidalStrength: 0 });
    const sink = new VoidSink(sdf, noStress);
    const particles = new ParticleStore(1);
    const contour = sdf.contour(64);
    const cx = contour[0];
    const cy = contour[1];
    const normal = normalAt(sdf, cx, cy);
    const inside = { x: cx - normal.x * 2, y: cy - normal.y * 2 };
    particles.activateSlot(inside.x, inside.y, 0, 0, 0);

    const affected = sink.applyFringeStress(particles);

    expect(affected).toBe(0);
    expect(particles.forceX[0]).toBe(0);
    expect(particles.forceY[0]).toBe(0);
  });

  it("Void'a geçen parçacığı düşürür, olay yazar ve rezervuara kaydeder", () => {
    const sdf = domain();
    const sink = new VoidSink(sdf, fringe());
    const particles = new ParticleStore(2);
    const reservoir = new MatterReservoir();
    const contour = sdf.contour(64);
    const cx = contour[0];
    const cy = contour[1];
    const normal = normalAt(sdf, cx, cy);
    const outside = { x: cx + normal.x * 10, y: cy + normal.y * 10 };
    particles.activateSlot(outside.x, outside.y, 0, 0, 3);
    particles.activateSlot(STORAGE.x + STORAGE.width / 2, STORAGE.y + STORAGE.height / 2, 0, 0, 0);
    const crossings: VoidDeathEvent[] = [];

    const crossed = sink.collectCrossings(particles, reservoir, 7, crossings);

    expect(crossed).toBe(1);
    expect(particles.active[0]).toBe(0);
    expect(particles.active[1]).toBe(1);
    expect(particles.activeCount).toBe(1);
    expect(crossings).toHaveLength(1);
    expect(crossings[0].type).toBe(3);
    expect(reservoir.external).toBe(1);
    expect(reservoir.voidLossTotal).toBe(1);
  });

  it('olay tick, kimlik, konum, hız ve normal taşır ve DONDURULMUŞTUR', () => {
    const sdf = domain();
    const sink = new VoidSink(sdf, fringe());
    const particles = new ParticleStore(1);
    const reservoir = new MatterReservoir();
    const contour = sdf.contour(64);
    const normal = normalAt(sdf, contour[0], contour[1]);
    const outside = { x: contour[0] + normal.x * 10, y: contour[1] + normal.y * 10 };
    particles.activateSlot(outside.x, outside.y, -0.75, 1.25, 2);
    const stableId = particles.stableId[0];
    const crossings: VoidDeathEvent[] = [];

    sink.collectCrossings(particles, reservoir, 12, crossings);
    const [event] = crossings;

    expect(event.kind).toBe('void-death');
    expect(event.tick).toBe(12);
    expect(event.stableId).toBe(stableId);
    // Olay store'un float32 değerini TAM taşır; tolerans değil eşitlik aranır.
    expect(event.x).toBe(Math.fround(outside.x));
    expect(event.y).toBe(Math.fround(outside.y));
    expect(event.vx).toBe(Math.fround(-0.75));
    expect(event.vy).toBe(Math.fround(1.25));
    expect(Math.hypot(event.normalX, event.normalY)).toBeCloseTo(1, 6);
    expect(Object.isFrozen(event)).toBe(true);
    // Slot kanonik boşa indi; olay hâlâ ölümü anlatıyor.
    expect(particles.x[0]).toBe(0);
    expect(particles.stableId[0]).toBe(0);
  });

  it('geçersiz tick reddedilir', () => {
    const sink = new VoidSink(domain(), fringe());
    const particles = new ParticleStore(1);
    const reservoir = new MatterReservoir();

    expect(() => sink.collectCrossings(particles, reservoir, -1, [])).toThrow(RangeError);
    expect(() => sink.collectCrossings(particles, reservoir, 1.5, [])).toThrow(RangeError);
  });

  it('habitat içinde kalan parçacığı düşürmez', () => {
    const sdf = domain();
    const sink = new VoidSink(sdf, fringe());
    const particles = new ParticleStore(1);
    const center = { x: STORAGE.x + STORAGE.width / 2, y: STORAGE.y + STORAGE.height / 2 };
    particles.activateSlot(center.x, center.y, 0, 0, 0);
    const reservoir = new MatterReservoir();
    const crossings: VoidDeathEvent[] = [];

    const crossed = sink.collectCrossings(particles, reservoir, 7, crossings);

    expect(crossed).toBe(0);
    expect(particles.active[0]).toBe(1);
    expect(crossings).toHaveLength(0);
    expect(reservoir.external).toBe(0);
  });

  it('aktif olmayan slotları atlar', () => {
    const sdf = domain();
    const sink = new VoidSink(sdf, fringe());
    const particles = new ParticleStore(1);
    const reservoir = new MatterReservoir();
    const crossings: VoidDeathEvent[] = [];

    const crossed = sink.collectCrossings(particles, reservoir, 7, crossings);

    expect(crossed).toBe(0);
    expect(crossings).toHaveLength(0);
  });
});
