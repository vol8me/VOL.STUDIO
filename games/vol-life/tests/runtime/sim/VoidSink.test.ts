import { describe, expect, it } from 'vitest';
import { defaultPhysicsGenome, type FringeGenes } from '@/config/genome';
import { MatterReservoir } from '@/runtime/sim/MatterReservoir';
import { ParticleStore } from '@/runtime/sim/ParticleStore';
import { VoidSink, type VoidCrossing } from '@/runtime/sim/VoidSink';
import type { HabitatSDF } from '@/runtime/sim/WorldDomain';
import { createHabitatDomain } from '@/runtime/sim/WorldDomain';
import { habitatConfig } from '@/config/habitat';
import { worldConfig } from '@/config/world';

const STORAGE = worldConfig.boundsUnits;

function domain(seed = 7): HabitatSDF {
  return createHabitatDomain(STORAGE, habitatConfig, seed);
}

function fringe(): FringeGenes {
  return defaultPhysicsGenome.fringe;
}

describe('VoidSink', () => {
  it('geçersiz fringe genişliği kurulumda reddeder', () => {
    expect(() => new VoidSink(domain(), { widthUnits: 0, tidalStrength: 1 })).toThrow(RangeError);
    expect(() => new VoidSink(domain(), { widthUnits: -1, tidalStrength: 1 })).toThrow(RangeError);
    expect(() => new VoidSink(domain(), { widthUnits: Number.NaN, tidalStrength: 1 })).toThrow(
      RangeError,
    );
  });

  it('geçersiz tidal stres kurulumda reddeder', () => {
    expect(() => new VoidSink(domain(), { widthUnits: 24, tidalStrength: -1 })).toThrow(RangeError);
    expect(() => new VoidSink(domain(), { widthUnits: 24, tidalStrength: Number.NaN })).toThrow(
      RangeError,
    );
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
    const normal = sdf.normal(cx, cy);
    const inside = { x: cx - normal.x * 2, y: cy - normal.y * 2 };
    particles.activateSlot(inside.x, inside.y, 0, 0, 0);

    const affected = sink.applyFringeStress(particles);

    expect(affected).toBe(1);
    expect(particles.edgeDistance[0]).toBeGreaterThanOrEqual(0);
    expect(particles.edgeDistance[0]).toBeLessThan(fringe().widthUnits);
  });

  it('tidalStrength sıfırsa fringe içinde bile kuvvet eklemez', () => {
    const sdf = domain();
    const noStress = { widthUnits: 24, tidalStrength: 0 };
    const sink = new VoidSink(sdf, noStress);
    const particles = new ParticleStore(1);
    const contour = sdf.contour(64);
    const cx = contour[0];
    const cy = contour[1];
    const normal = sdf.normal(cx, cy);
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
    const normal = sdf.normal(cx, cy);
    const outside = { x: cx + normal.x * 10, y: cy + normal.y * 10 };
    particles.activateSlot(outside.x, outside.y, 0, 0, 3);
    particles.activateSlot(STORAGE.x + STORAGE.width / 2, STORAGE.y + STORAGE.height / 2, 0, 0, 0);
    const crossings: VoidCrossing[] = [];

    const crossed = sink.collectCrossings(particles, reservoir, crossings);

    expect(crossed).toBe(1);
    expect(particles.active[0]).toBe(0);
    expect(particles.active[1]).toBe(1);
    expect(particles.activeCount).toBe(1);
    expect(crossings).toHaveLength(1);
    expect(crossings[0].type).toBe(3);
    expect(reservoir.external).toBe(1);
    expect(reservoir.voidLossTotal).toBe(1);
  });

  it('habitat içinde kalan parçacığı düşürmez', () => {
    const sdf = domain();
    const sink = new VoidSink(sdf, fringe());
    const particles = new ParticleStore(1);
    const center = { x: STORAGE.x + STORAGE.width / 2, y: STORAGE.y + STORAGE.height / 2 };
    particles.activateSlot(center.x, center.y, 0, 0, 0);
    const reservoir = new MatterReservoir();
    const crossings: VoidCrossing[] = [];

    const crossed = sink.collectCrossings(particles, reservoir, crossings);

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
    const crossings: VoidCrossing[] = [];

    const crossed = sink.collectCrossings(particles, reservoir, crossings);

    expect(crossed).toBe(0);
    expect(crossings).toHaveLength(0);
  });
});
