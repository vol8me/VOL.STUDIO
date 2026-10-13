import { describe, expect, it } from 'vitest';
import { COMBAT } from '@/config/combat';
import { SUSPENSION, TANK, WEAPON } from '@/config/tank';
import { Vehicle } from '@/sim/entities/Vehicle';
import type { SimEvent } from '@/sim/events';
import { Simulation } from '@/sim/Simulation';
import { muzzlePose } from '@/sim/muzzle';
import type { ChassisPose } from '@/sim/chassis/ChassisState';
import type { ChassisState } from '@/sim/chassis/ChassisState';
import {
  aimAligned,
  applyRecoil,
  launchFrom,
  muzzleLaunch,
  stepPredictedVehicle,
  type Launch,
} from '@/sim/vehicleStep';
import { commandAt } from '../support/commands';
import { command, STEP_MS, world } from '../support/sim';

function lone(space = world()): { sim: Simulation; vehicle: Vehicle } {
  const sim = new Simulation({
    world: space,
    tank: TANK,
    suspension: SUSPENSION,
    weapon: WEAPON,
    spawnPlayer: false,
  });
  return { sim, vehicle: sim.spawn(2048, 2048, 0) };
}

function mirror(): Vehicle {
  const vehicle = new Vehicle(1, TANK, SUSPENSION, WEAPON, COMBAT);
  vehicle.chassis.place(2048, 2048, 0);
  return vehicle;
}

/** Aracın tank durumunu verilen alanlarla kurar (taret ve süspansiyon salt okunurdur). */
function posed(vehicle: Vehicle, fields: Partial<ChassisState>): void {
  vehicle.chassis.restoreState({ ...vehicle.chassis.captureState(), ...fields });
}

describe('stepPredictedVehicle', () => {
  it('tek araçlı sunucu adımıyla bit bit aynı tank durumunu ve silah beklemesini üretir', () => {
    const space = world();
    const { sim, vehicle: server } = lone(space);
    const client = mirror();
    let shots = 0;
    for (let step = 0; step < 1500; step++) {
      const input = commandAt(step);
      sim.step(() => input, STEP_MS);
      if (stepPredictedVehicle(client, input, space, STEP_MS)) shots++;
      if (step % 100 === 99) {
        expect(client.chassis.captureState(), `adım ${step}`).toEqual(
          server.chassis.captureState(),
        );
        expect(client.gun.getRemaining(), `silah ${step}`).toBe(server.gun.getRemaining());
      }
    }
    expect(shots).toBeGreaterThan(5);
    expect(client.chassis.captureState()).toEqual(server.chassis.captureState());
  });

  it('atış değerleri geri tepmeden önce alınır ve sunucunun yayınladığı atışla aynıdır', () => {
    const space = world();
    const { sim, vehicle: server } = lone(space);
    const client = mirror();
    const events: SimEvent[] = [];
    let seen = 0;
    for (let step = 0; step < 90; step++) {
      const input = command({ moveX: 1, aimX: 1, fire: step === 60 });
      sim.step(() => input, STEP_MS);
      const launches: Launch[] = [];
      stepPredictedVehicle(client, input, space, STEP_MS, (launch) => launches.push(launch));
      expect(launches).toHaveLength(step === 60 ? 1 : 0);
      if (step !== 60) continue;
      sim.drainEvents(events);
      const fired = events.find((event) => event.kind === 'fired');
      expect(fired).toMatchObject({
        x: launches[0].x,
        y: launches[0].y,
        angle: launches[0].angle,
      });
      expect(launches[0].angle).toBe(server.chassis.turret);
      // Geri tepme uygulanmış tankın hızı değişmiştir: atış hızı onu değil öncekini taşır.
      const afterRecoil =
        Math.cos(launches[0].angle) *
        (WEAPON.projectileSpeed +
          client.chassis.vx * Math.cos(launches[0].angle) +
          client.chassis.vy * Math.sin(launches[0].angle));
      expect(launches[0].vx).not.toBe(afterRecoil);
      seen++;
    }
    expect(seen).toBe(1);
  });

  it('muzzleLaunch yalnız tankın eksen hızını devralır: mermi daima namlunun gösterdiği doğrultuda çıkar', () => {
    const vehicle = mirror();
    posed(vehicle, { turret: 0.9, vx: 30, vy: -190 });
    const launch = muzzleLaunch(vehicle);
    const axial = 30 * Math.cos(0.9) + -190 * Math.sin(0.9);
    expect(launch.angle).toBe(vehicle.chassis.turret);
    expect(Math.hypot(launch.vx, launch.vy)).toBeCloseTo(WEAPON.projectileSpeed + axial, 9);
    expect(Math.atan2(launch.vy, launch.vx)).toBeCloseTo(0.9, 12);
  });

  it('namlu ucu süspansiyon kaymasını taşır ve ekrandaki namlu ucuyla aynı noktadır', () => {
    const vehicle = mirror();
    posed(vehicle, { hull: 0.6, turret: -1.1, pitch: 2.4, roll: -3.2 });
    const launch = muzzleLaunch(vehicle);
    const pose = vehicle.chassis.readPose({ x: 0, y: 0, hull: 0, turret: 0, pitch: 0, roll: 0 });
    const tip = muzzlePose(pose, WEAPON.muzzleOffset, { x: 0, y: 0, angle: 0 });
    expect(launch.x).toBe(tip.x);
    expect(launch.y).toBe(tip.y);
    // Süspansiyonsuz uç ile fark tam olarak gövde eksenindeki kayma kadardır.
    const plainX = vehicle.chassis.x + Math.cos(-1.1) * WEAPON.muzzleOffset;
    const plainY = vehicle.chassis.y + Math.sin(-1.1) * WEAPON.muzzleOffset;
    expect(Math.hypot(launch.x - plainX, launch.y - plainY)).toBeCloseTo(Math.hypot(2.4, -3.2), 9);
  });

  it('launchFrom ara değerli pozdan türetilince çizgi o karedeki namluyla aynı doğrultudadır', () => {
    const vehicle = mirror();
    const shown: ChassisPose = {
      x: 2050.4,
      y: 2047.1,
      hull: 0.31,
      turret: 0.52,
      pitch: 1.1,
      roll: 2.2,
    };
    const launch = launchFrom(shown, 140, -60, WEAPON, { x: 0, y: 0, vx: 0, vy: 0, angle: 0 });
    expect(launch.angle).toBe(shown.turret);
    expect(Math.atan2(launch.vy, launch.vx)).toBeCloseTo(shown.turret, 12);
    const tip = muzzlePose(shown, WEAPON.muzzleOffset, { x: 0, y: 0, angle: 0 });
    expect([launch.x, launch.y]).toEqual([tip.x, tip.y]);
    expect(vehicle.chassis.x).toBe(2048);
  });

  it('ölü araç ilerlemez ve ateş etmez; poz yine yakalanır', () => {
    const space = world();
    const vehicle = mirror();
    vehicle.vitality.damage(COMBAT.maxHealth);
    expect(vehicle.vitality.alive).toBe(false);
    const before = vehicle.chassis.captureState();
    expect(stepPredictedVehicle(vehicle, command({ moveX: 1, fire: true }), space, STEP_MS)).toBe(
      false,
    );
    expect(vehicle.chassis.captureState()).toEqual(before);
    expect(vehicle.chassis.previous.x).toBe(before.x);
  });

  it('bekleme dolmadan ikinci atış reddedilir', () => {
    const space = world();
    const vehicle = mirror();
    const fire = command({ fire: true });
    expect(stepPredictedVehicle(vehicle, fire, space, STEP_MS)).toBe(true);
    expect(stepPredictedVehicle(vehicle, fire, space, STEP_MS)).toBe(false);
  });
});

describe('aimAligned', () => {
  it('nişan yoksa hizalıdır; yönde değilse eşiğe göre karar verir', () => {
    const vehicle = mirror();
    expect(aimAligned(vehicle, command())).toBe(true);
    expect(aimAligned(vehicle, command({ aimX: 1, aimY: 0 }))).toBe(true);
    expect(aimAligned(vehicle, command({ aimX: -1, aimY: 0 }))).toBe(false);
    const edge = WEAPON.aimTolerance * 0.5;
    expect(aimAligned(vehicle, command({ aimX: Math.cos(edge), aimY: Math.sin(edge) }))).toBe(true);
  });
});

describe('applyRecoil', () => {
  it('tanka atış yönünün tersine itki ve süspansiyon vuruşu verir', () => {
    const vehicle = mirror();
    applyRecoil(vehicle);
    expect(vehicle.chassis.vx).toBeLessThan(0);
    expect(vehicle.chassis.suspension.pitchVelocity).not.toBe(0);
  });
});
