import { describe, expect, it } from 'vitest';
import { COMBAT } from '@/config/combat';
import { SUSPENSION, TANK, WEAPON } from '@/config/tank';
import { Vehicle } from '@/sim/entities/Vehicle';
import { Simulation } from '@/sim/Simulation';
import { aimAligned, applyRecoil, stepPredictedVehicle } from '@/sim/vehicleStep';
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
  vehicle.tank.place(2048, 2048, 0);
  return vehicle;
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
        expect(client.tank.captureState(), `adım ${step}`).toEqual(server.tank.captureState());
        expect(client.gun.getRemaining(), `silah ${step}`).toBe(server.gun.getRemaining());
      }
    }
    expect(shots).toBeGreaterThan(5);
    expect(client.tank.captureState()).toEqual(server.tank.captureState());
  });

  it('ölü araç ilerlemez ve ateş etmez; poz yine yakalanır', () => {
    const space = world();
    const vehicle = mirror();
    vehicle.vitality.damage(COMBAT.maxHealth);
    expect(vehicle.vitality.alive).toBe(false);
    const before = vehicle.tank.captureState();
    expect(stepPredictedVehicle(vehicle, command({ moveX: 1, fire: true }), space, STEP_MS)).toBe(
      false,
    );
    expect(vehicle.tank.captureState()).toEqual(before);
    expect(vehicle.tank.previous.x).toBe(before.x);
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
    expect(vehicle.tank.vx).toBeLessThan(0);
    expect(vehicle.tank.suspension.pitchVelocity).not.toBe(0);
  });
});
