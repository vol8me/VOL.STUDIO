import { describe, expect, it } from 'vitest';
import { SimulationClock } from '@volstudio/core';
import { TANK } from '@/config/tank';
import { hudFrame, hudVehicles, tankFrame } from '@/scenes/world/frames';
import { Vehicle } from '@/sim/entities/Vehicle';
import { SUSPENSION, WEAPON } from '@/config/tank';
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

describe('hudVehicles', () => {
  function pair(): Vehicle[] {
    const vehicles = [1, 2].map((id) => new Vehicle(id, TANK, SUSPENSION, WEAPON));
    vehicles[0].tank.place(1000, 1000, 0);
    vehicles[1].tank.place(2000, 1500, 1);
    for (const vehicle of vehicles) {
      vehicle.tank.capturePose();
      vehicle.tank.x += 40;
      vehicle.tank.y -= 20;
    }
    return vehicles;
  }

  it('pozu çizilen kareyle aynı ara değerle verir ve oyuncuyu işaretler', () => {
    const vehicles = pair();
    const half = [...hudVehicles(vehicles, 1, 0.5)].map((entry) => ({ ...entry }));
    expect(half).toEqual([
      { id: 1, x: 1020, y: 990, hull: 0, player: true },
      { id: 2, x: 2020, y: 1490, hull: 1, player: false },
    ]);
    expect([...hudVehicles(vehicles, 1, 0)].map((entry) => entry.x)).toEqual([1000, 2000]);
    expect([...hudVehicles(vehicles, 1, 1)].map((entry) => entry.x)).toEqual([1040, 2040]);
  });

  it('ölü araçları atlar ve nesneleri çağrılar arasında yeniden kullanır', () => {
    const vehicles = pair();
    const first = [...hudVehicles(vehicles, 1, 1)];
    const again = [...hudVehicles(vehicles, 1, 1)];
    expect(again[0]).toBe(first[0]);
    vehicles[0].vitality.damage(1e9);
    const alive = [...hudVehicles(vehicles, 1, 1)];
    expect(alive).toHaveLength(1);
    expect(alive[0].id).toBe(2);
  });
});
