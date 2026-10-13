import { describe, expect, it } from 'vitest';
import { COMBAT } from '@/config/combat';
import { STRIKER, type VehicleSpec } from '@/config/vehicles';
import { Vehicle } from '@/sim/entities/Vehicle';
import type { SimEvent } from '@/sim/events';
import { Simulation } from '@/sim/Simulation';
import { muzzlePose, pivotPose } from '@/sim/muzzle';
import type { ChassisPose } from '@/sim/chassis/ChassisState';
import type { ChassisState } from '@/sim/chassis/ChassisState';
import {
  aimAligned,
  launchFrom,
  stepPredictedVehicle,
  triggerVolley,
  type Launch,
  type LaunchBuffer,
} from '@/sim/vehicleStep';
import { commandAt } from '../support/commands';
import { command, STEP_MS, world } from '../support/sim';

const WEAPON = STRIKER.armament.weapon;
const REACH = STRIKER.armament.mounts[0].reach;

/** Üç namlulu deneme aracı: ortada nişan taretinin yuvası, iki yanda içe bakan yuva. */
const TRIPLE: VehicleSpec = {
  ...STRIKER,
  armament: {
    weapon: WEAPON,
    mounts: [
      { x: 0, y: 0, reach: 30 },
      { x: 4, y: -12, reach: 26 },
      { x: 4, y: 12, reach: 26 },
    ],
    salvo: [[0], [1, 2]],
    toeInRange: 300,
  },
};

const buffer = (): LaunchBuffer => ({ x: 0, y: 0, vx: 0, vy: 0, angle: 0 });
const pose = (): ChassisPose => ({ x: 0, y: 0, hull: 0, turret: 0, pitch: 0, roll: 0 });

function lone(space = world()): { sim: Simulation; vehicle: Vehicle } {
  const sim = new Simulation({ world: space, vehicle: STRIKER, spawnPlayer: false });
  return { sim, vehicle: sim.spawn(2048, 2048, 0) };
}

function mirror(spec: VehicleSpec = STRIKER): Vehicle {
  const vehicle = new Vehicle(1, spec, COMBAT);
  vehicle.chassis.place(2048, 2048, 0);
  return vehicle;
}

/** Aracın şasi durumunu verilen alanlarla kurar (taret ve süspansiyon salt okunurdur). */
function posed(vehicle: Vehicle, fields: Partial<ChassisState>): void {
  vehicle.chassis.restoreState({ ...vehicle.chassis.captureState(), ...fields });
}

/** Aracın şimdiki pozundan ve hızından, `mount` yuvasının atışı. */
function launchOf(vehicle: Vehicle, mount = 0): Launch {
  const chassis = vehicle.chassis;
  return launchFrom(
    chassis.readPose(pose()),
    chassis.vx,
    chassis.vy,
    vehicle.armament,
    mount,
    buffer(),
  );
}

describe('stepPredictedVehicle', () => {
  it('tek araçlı sunucu adımıyla bit bit aynı şasi durumunu ve silah beklemesini üretir', () => {
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
      stepPredictedVehicle(client, input, space, STEP_MS, (launch) => launches.push({ ...launch }));
      expect(launches).toHaveLength(step === 60 ? 1 : 0);
      if (step !== 60) continue;
      sim.drainEvents(events);
      const fired = events.find((event) => event.kind === 'fired');
      expect(fired).toMatchObject({
        mount: 0,
        x: launches[0].x,
        y: launches[0].y,
        angle: launches[0].angle,
      });
      expect(launches[0].angle).toBe(server.chassis.turret);
      // Geri tepme uygulanmış aracın hızı değişmiştir: atış hızı onu değil öncekini taşır.
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

  it('launchFrom yalnız aracın eksen hızını devralır: mermi daima namlunun gösterdiği doğrultuda çıkar', () => {
    const vehicle = mirror();
    posed(vehicle, { turret: 0.9, vx: 30, vy: -190 });
    const launch = launchOf(vehicle);
    const axial = 30 * Math.cos(0.9) + -190 * Math.sin(0.9);
    expect(launch.angle).toBe(vehicle.chassis.turret);
    expect(Math.hypot(launch.vx, launch.vy)).toBeCloseTo(WEAPON.projectileSpeed + axial, 9);
    expect(Math.atan2(launch.vy, launch.vx)).toBeCloseTo(0.9, 12);
  });

  it('namlu ucu süspansiyon kaymasını taşır ve ekrandaki namlu ucuyla aynı noktadır', () => {
    const vehicle = mirror();
    posed(vehicle, { hull: 0.6, turret: -1.1, pitch: 2.4, roll: -3.2 });
    const launch = launchOf(vehicle);
    const tip = muzzlePose(vehicle.chassis.readPose(pose()), STRIKER.armament, 0, {
      x: 0,
      y: 0,
      angle: 0,
    });
    expect(launch.x).toBe(tip.x);
    expect(launch.y).toBe(tip.y);
    // Süspansiyonsuz uç ile fark tam olarak gövde eksenindeki kayma kadardır.
    const plainX = vehicle.chassis.x + Math.cos(-1.1) * REACH;
    const plainY = vehicle.chassis.y + Math.sin(-1.1) * REACH;
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
    const launch = launchFrom(shown, 140, -60, STRIKER.armament, 0, buffer());
    expect(launch.angle).toBe(shown.turret);
    expect(Math.atan2(launch.vy, launch.vx)).toBeCloseTo(shown.turret, 12);
    const tip = muzzlePose(shown, STRIKER.armament, 0, { x: 0, y: 0, angle: 0 });
    expect([launch.x, launch.y]).toEqual([tip.x, tip.y]);
    expect(vehicle.chassis.x).toBe(2048);
  });

  it('ölü araç ilerlemez ve ateş etmez; poz yine yakalanır', () => {
    const space = world();
    const vehicle = mirror();
    vehicle.vitality.damage(vehicle.vitality.maxHealth);
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

describe('triggerVolley', () => {
  it('tek namlulu araca atış yönünün tersine itki ve süspansiyon vuruşu verir', () => {
    const vehicle = mirror();
    triggerVolley(vehicle);
    expect(vehicle.chassis.vx).toBeLessThan(0);
    expect(vehicle.chassis.suspension.pitchVelocity).not.toBe(0);
    expect(vehicle.salvo).toBe(0);
  });

  it('yuva grupları sırayla döner: her tetik çekişi sıradaki grubu ateşler', () => {
    const vehicle = mirror(TRIPLE);
    const fired: number[][] = [];
    for (let trigger = 0; trigger < 4; trigger++) {
      const group: number[] = [];
      triggerVolley(vehicle, (_launch, mount) => group.push(mount));
      fired.push(group);
    }
    expect(fired).toEqual([[0], [1, 2], [0], [1, 2]]);
    expect(vehicle.salvo).toBe(0);
  });

  it('bütün atışlar geri tepmeden önce hesaplanır; iki yanın geri tepmesi birleşir', () => {
    const vehicle = mirror(TRIPLE);
    vehicle.salvo = 1;
    const launches: Launch[] = [];
    triggerVolley(vehicle, (launch) => launches.push({ ...launch }));
    const reference = mirror(TRIPLE);
    expect(launches).toHaveLength(2);
    expect(launches[0]).toEqual(launchOf(reference, 1));
    expect(launches[1]).toEqual(launchOf(reference, 2));
    // İki yan namlu içe baktığı için yan itkiler birbirini götürür, öne ters itki kalır.
    expect(vehicle.chassis.vx).toBeLessThan(0);
    expect(Math.abs(vehicle.chassis.vy)).toBeLessThan(Math.abs(vehicle.chassis.vx) * 0.05);
  });

  it('yan yuvalar nişan noktasına bakar: ışınlar `toeInRange` ileride kesişir', () => {
    const state: ChassisPose = { x: 500, y: 600, hull: 0.4, turret: 0.9, pitch: 1.5, roll: -2 };
    const armament = TRIPLE.armament;
    const left = pivotPose(state, armament, { x: 0, y: 0, angle: 0 });
    const side = muzzlePose(state, armament, 1, { x: 0, y: 0, angle: 0 }, 0);
    const other = muzzlePose(state, armament, 2, { x: 0, y: 0, angle: 0 }, 0);
    const focus = {
      x: left.x + Math.cos(state.turret) * armament.toeInRange,
      y: left.y + Math.sin(state.turret) * armament.toeInRange,
    };
    for (const mount of [side, other]) {
      const toFocus = Math.atan2(focus.y - mount.y, focus.x - mount.x);
      expect(Math.cos(mount.angle)).toBeCloseTo(Math.cos(toFocus), 12);
      expect(Math.sin(mount.angle)).toBeCloseTo(Math.sin(toFocus), 12);
    }
    // Uzakta yönler taret yönüne yaklaşır, yakında ayrışır.
    expect(side.angle).not.toBeCloseTo(state.turret, 3);
    expect(Math.abs(side.angle - state.turret)).toBeLessThan(0.1);
  });
});
