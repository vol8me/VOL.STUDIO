import { describe, expect, it } from 'vitest';
import { SimulationClock } from '@volstudio/core';
import { TANK } from '@/config/tank';
import { hudFrame, tankFrame } from '@/scenes/world/frames';
import { command, DT, tank, world } from '../../support/sim';

describe('frames', () => {
  it('poz, taret ve süspansiyon önceki ve güncel adım arasında ara değerlenir', () => {
    const subject = tank();
    const space = world();
    for (let step = 0; step < 20; step++) {
      subject.capturePose();
      subject.step(command({ moveX: 1, aimY: 1 }), space, DT);
    }
    const start = tankFrame(subject, 0);
    const end = tankFrame(subject, 1);
    const half = tankFrame(subject, 0.5);
    expect(start.x).toBe(subject.previous.x);
    expect(end.x).toBe(subject.x);
    expect(half.x).toBeCloseTo((start.x + end.x) / 2);
    expect(half.pitch).toBeCloseTo((start.pitch + end.pitch) / 2);
    expect(end.turret).toBeCloseTo(subject.turret);
  });

  it('HUD karesi sürüş durumunu ve görünen alanı taşır', () => {
    const subject = tank();
    const frame = hudFrame(subject, tankFrame(subject, 1), TANK.boostCapacity, {
      x: 1,
      y: 2,
      width: 3,
      height: 4,
    });
    expect(frame).toMatchObject({
      boost: TANK.boostCapacity,
      reversing: false,
      view: { width: 3 },
    });
  });
});

it('±pi sınırında kısa açı yolunu izler ve teleport geçmişi yeni poza bağlar', () => {
  const subject = tank();
  subject.place(1000, 1000, -Math.PI + 0.2);
  subject.previous.hull = Math.PI - 0.1;
  subject.previous.turret = Math.PI - 0.2;
  subject.hull = -Math.PI + 0.1;
  const middle = tankFrame(subject, 0.5);
  expect(Math.abs(middle.hull)).toBeCloseTo(Math.PI);
  expect(Math.abs(middle.turret)).toBeCloseTo(Math.PI);
  subject.place(42, 73, 0.7);
  expect(tankFrame(subject, 0)).toMatchObject({ x: 42, y: 73 });
  expect(tankFrame(subject, 0).hull).toBeCloseTo(0.7);
  expect(tankFrame(subject, 0.8)).toMatchObject({ x: 42, y: 73 });
  expect(tankFrame(subject, 0.8).hull).toBeCloseTo(0.7);
});

it('saat reset ve duraklatma toplam zamanı ile poz geçmişini ayrı yönetir', () => {
  const clock = new SimulationClock({ fixedStepMs: 16, maxStepsPerFrame: 2, partialStep: 'defer' });
  const subject = tank();
  clock.advance(20, () => {
    subject.capturePose();
    subject.x += 100;
  });
  const before = tankFrame(subject, clock.getInterpolationAlpha());
  clock.advance(
    5000,
    () => {
      throw new Error('paused tick');
    },
    { paused: true },
  );
  expect(tankFrame(subject, clock.getInterpolationAlpha())).toEqual(before);
  expect(clock.getSimulationTimeMs()).toBe(16);
  clock.reset();
  subject.place(12, 34, -0.4);
  expect(clock.getSimulationTimeMs()).toBe(0);
  expect(tankFrame(subject, clock.getInterpolationAlpha())).toMatchObject({
    x: 12,
    y: 34,
  });
  expect(tankFrame(subject, clock.getInterpolationAlpha()).hull).toBeCloseTo(-0.4);
});
