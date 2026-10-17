import { describe, expect, it } from 'vitest';
import { LocomotionReader } from '@/view/spider/LocomotionReader';
import type { TankFrame } from '@/view/VehicleView';

const STEP = 1000 / 60;
const tuning = {
  worldToArt: 1,
  impactFalloffMs: 300,
  teleportUnits: 160,
};
const frame = (overrides: Partial<TankFrame> = {}): TankFrame => ({
  x: 0,
  y: 0,
  hull: 0,
  turret: 0,
  pitch: 0,
  roll: 0,
  treadLeft: 0,
  treadRight: 0,
  speed: 0,
  vx: 0,
  vy: 0,
  angularVelocity: 0,
  boosting: false,
  ...overrides,
});

describe('LocomotionReader', () => {
  it('ilk kare ve ışınlanma taze sayılır; normal ilerleme sayılmaz', () => {
    const reader = new LocomotionReader(tuning);
    expect(reader.read(frame(), STEP)).toBe(true);
    expect(reader.read(frame({ x: 2 }), STEP)).toBe(false);
    expect(reader.read(frame({ x: 400 }), STEP)).toBe(true);
    expect(reader.read(frame({ x: 402 }), STEP)).toBe(false);
  });

  it('ivme hızın değiştiği iki an arasındaki süreye bölünür ve bir sonrakine kadar tutulur', () => {
    const reader = new LocomotionReader(tuning);
    reader.read(frame(), STEP);
    // Dört çizim karesi boyunca hız aynı: ivme sıfır.
    for (let i = 0; i < 4; i++) reader.read(frame({ vx: 0 }), STEP);
    expect(reader.signals.accelX).toBe(0);
    // Hız beşinci karede 60 olur: ivme 60 bölü beş kare ve sonraki karelerde korunur.
    reader.read(frame({ vx: 60 }), STEP);
    const held = reader.signals.accelX;
    expect(held).toBeGreaterThan(0);
    expect(held).toBeCloseTo(60 / ((5 * STEP) / 1000), 3);
    reader.read(frame({ vx: 60 }), STEP);
    expect(reader.signals.accelX).toBe(held);
  });

  it('ışınlanma sahte bir ivme sıçraması üretmez', () => {
    const reader = new LocomotionReader(tuning);
    reader.read(frame({ vx: 100 }), STEP);
    reader.read(frame({ vx: 100, x: 1000 }), STEP);
    expect(reader.signals.accelX).toBe(0);
  });

  it('bakış yönü kareden, seyahat yönü hızdan gelir; durunca bakışa düşer', () => {
    const reader = new LocomotionReader(tuning);
    reader.read(frame({ hull: 1, vx: 0, vy: 50 }), STEP);
    expect(reader.signals.facingHeadingRad).toBe(1);
    expect(reader.signals.travelHeadingRad).toBeCloseTo(Math.PI / 2, 6);
    reader.read(frame({ hull: 1 }), STEP);
    expect(reader.signals.travelHeadingRad).toBe(1);
  });

  it('çarpma yankısı süre içinde söner', () => {
    const reader = new LocomotionReader(tuning);
    reader.read(frame(), STEP);
    reader.impact(1);
    reader.read(frame(), STEP);
    expect(reader.signals.impact01).toBeGreaterThan(0.9);
    for (let i = 0; i < 30; i++) reader.read(frame(), STEP);
    expect(reader.signals.impact01).toBe(0);
  });
});
