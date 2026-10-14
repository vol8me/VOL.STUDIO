import { describe, expect, it } from 'vitest';
import { COMBAT } from '@/config/combat';
import { GAME } from '@/config/game';
import { WADING } from '@/config/lakes';
import { ARACHNID, MANTA, STRIKER, type VehicleSpec } from '@/config/vehicles';
import { BotBrain } from '@/sim/ai/BotBrain';
import { idleCommand, type TankCommand } from '@/sim/command';
import type { Vehicle } from '@/sim/entities/Vehicle';
import type { SimEvent } from '@/sim/events';
import { Simulation } from '@/sim/Simulation';
import { stepPredictedVehicle } from '@/sim/vehicleStep';
import { Vehicle as VehicleClass } from '@/sim/entities/Vehicle';
import { createBattleWorld } from '@/sim/world/battleWorld';
import { drowningRate, wadingSpeed } from '@/sim/world/wading';
import { command, STEP_MS } from '../support/sim';

const world = createBattleWorld();
/** En büyük göl: dikey uzun batı gölü; kıyısından merkeze doğru +x yönünde yürünür. */
const lake = world.lakes.lakes.find((candidate) => candidate.id === 'westMere')!;
/** Gölün batı kıyısının hemen dışı: oradan +x yönüne sürmek suya girer. */
const START = { x: lake.x - lake.rx * 1.25, y: lake.y };

function sim(spec: VehicleSpec): { sim: Simulation; vehicle: Vehicle } {
  const simulation = new Simulation({ world, vehicle: spec, spawnPlayer: false });
  const vehicle = simulation.spawn(START.x, START.y, 0, null, undefined, spec);
  vehicle.vitality.protectionRemainingMs = 0;
  return { sim: simulation, vehicle };
}

/** Aracı `seconds` boyunca sürer; ölünce durur (yeniden doğma yoktur). Olayları ve en derin yeri verir. */
function drive(
  subject: { sim: Simulation; vehicle: Vehicle },
  seconds: number,
  input: TankCommand,
): SimEvent[] & { deepest?: number } {
  const events: SimEvent[] & { deepest?: number } = [];
  let deepest = 0;
  for (let step = 0; step < (seconds * 1000) / STEP_MS; step++) {
    subject.sim.step(() => input, STEP_MS);
    subject.sim.drainEvents(events);
    deepest = Math.max(deepest, subject.vehicle.chassis.waterDepth);
    if (!subject.vehicle.vitality.alive) break;
  }
  events.deepest = deepest;
  return events;
}

describe('hız ve boğulma eğrileri', () => {
  it('yavaşlama kıyıda yok, derinlikle tek yönde artar ve tabana iner', () => {
    expect(wadingSpeed(0)).toBe(1);
    let previous = 1;
    for (let depth = 0.05; depth <= 1.0001; depth += 0.05) {
      const speed = wadingSpeed(depth);
      expect(speed).toBeLessThan(previous);
      previous = speed;
    }
    expect(wadingSpeed(1)).toBeCloseTo(WADING.speedFloor, 9);
    expect(wadingSpeed(7)).toBeCloseTo(WADING.speedFloor, 9);
  });

  it('diz boyu suda hasar yoktur; derinleştikçe kareli büyür ve tavana varır', () => {
    expect(drowningRate(WADING.hurtDepth)).toBe(0);
    expect(drowningRate(0.6)).toBeGreaterThan(0);
    expect(drowningRate(1)).toBeCloseTo(WADING.hurtPerSecond, 9);
    expect(drowningRate(0.9)).toBeGreaterThan(drowningRate(0.6) * 2);
  });
});

describe('göl ve araç', () => {
  it('kıyıdan suya giren tank yavaşlar, derinde hasar alır ve boğulur: ölüm kaynaksız `drown`dur', () => {
    const subject = sim(STRIKER);
    const events = drive(subject, 20, command({ moveX: 1 }));
    const damaged = events.filter((event) => event.kind === 'damaged');
    expect(damaged.length).toBeGreaterThan(0);
    expect(damaged.every((event) => event.kind === 'damaged' && event.cause === 'drown')).toBe(
      true,
    );
    expect(damaged.every((event) => event.kind === 'damaged' && event.source === undefined)).toBe(
      true,
    );
    const died = events.find((event) => event.kind === 'died');
    expect(died).toMatchObject({ kind: 'died', cause: 'drown', source: undefined });
    expect(subject.vehicle.vitality.alive).toBe(false);
    // Hasar parça parça gelir: olay seli yoktur (kare başına bir olay değil).
    expect(damaged.length).toBeLessThan(80);
  });

  it('su hız tavanını keser: gölün ortasındaki araç aynı komutla kuru zemindekinden yavaştır', () => {
    const input = command({ moveX: 1 });
    const speedAt = (x: number, y: number): number => {
      const simulation = new Simulation({ world, vehicle: STRIKER, spawnPlayer: false });
      const vehicle = simulation.spawn(x, y, 0, null, undefined, STRIKER);
      for (let step = 0; step < 2 * 60; step++) simulation.step(() => input, STEP_MS);
      return vehicle.chassis.speed;
    };
    const wet = speedAt(lake.x - lake.rx * 0.2, lake.y);
    const dry = speedAt(world.width / 2, world.height / 2 + 1500);
    expect(world.lakes.depthAt(lake.x - lake.rx * 0.2, lake.y)).toBeGreaterThan(0.9);
    expect(wet).toBeLessThan(dry * 0.6);
  });

  it('süzülen araç göle yüzer: yavaşlamaz, hasar almaz, derinliği not edilir', () => {
    const subject = sim(MANTA);
    const events = drive(subject, 3, command({ moveX: 1 }));
    expect(events.filter((event) => event.kind === 'damaged')).toHaveLength(0);
    expect(subject.vehicle.vitality.alive).toBe(true);
    expect(subject.vehicle.vitality.health).toBe(subject.vehicle.vitality.maxHealth);
    expect(events.deepest).toBeGreaterThan(0.5);
  });

  it('bacaklı araç da yavaşlar ve boğulur', () => {
    const subject = sim(ARACHNID);
    const events = drive(subject, 20, command({ moveX: 1 }));
    expect(events.some((event) => event.kind === 'died' && event.cause === 'drown')).toBe(true);
  });

  it('kıyıdan geri dönen araç sağ çıkar: sığ suda can kaybı yoktur', () => {
    const subject = sim(STRIKER);
    // Kıyıya hafifçe girip (diz boyu) geri dön.
    drive(subject, 1.1, command({ moveX: 1 }));
    expect(subject.vehicle.chassis.waterDepth).toBeLessThan(WADING.hurtDepth);
    drive(subject, 3, command({ moveX: -1 }));
    expect(subject.vehicle.vitality.alive).toBe(true);
    expect(subject.vehicle.vitality.health).toBe(subject.vehicle.vitality.maxHealth);
    expect(subject.vehicle.chassis.waterDepth).toBe(0);
  });

  it('yeniden doğan araç boğulma birikimini taşımaz', () => {
    const subject = sim(STRIKER);
    drive(subject, 20, command({ moveX: 1 }));
    expect(subject.vehicle.vitality.alive).toBe(false);
    subject.sim.respawnVehicle(subject.vehicle.id, START.x, START.y, 0);
    expect(subject.vehicle.vitality.alive).toBe(true);
    expect(subject.vehicle.chassis.waterDepth).toBe(0);
  });
});

describe('sunucu ve istemci öngörüsü', () => {
  it.each([STRIKER, ARACHNID, MANTA])(
    'göle yürüyen %s için öngörü sunucuyla bit bit aynı durumu üretir',
    (spec) => {
      const server = sim(spec);
      const client = new VehicleClass(1, spec, COMBAT);
      client.chassis.place(START.x, START.y, 0);
      const input = command({ moveX: 1 });
      let deepest = 0;
      for (let step = 0; step < 20 * 60; step++) {
        server.sim.step(() => input, STEP_MS);
        stepPredictedVehicle(client, input, world, STEP_MS);
        deepest = Math.max(deepest, server.vehicle.chassis.waterDepth);
        if (!server.vehicle.vitality.alive) break;
        expect(client.chassis.captureState()).toEqual(server.vehicle.chassis.captureState());
      }
      expect(deepest).toBeGreaterThan(0.5);
      expect(client.chassis.captureState()).toEqual(server.vehicle.chassis.captureState());
    },
  );
});

describe('bot ve göl', () => {
  it('göl yönüne giden yüzemeyen bot suya girmez ve boğulmaz', () => {
    const simulation = new Simulation({ world, vehicle: STRIKER, spawnPlayer: false });
    const vehicle = simulation.spawn(START.x, START.y, 0, 0, undefined, STRIKER);
    vehicle.vitality.protectionRemainingMs = 0;
    const brain = new BotBrain(vehicle, { seed: 11, skill: 1 });
    const input = idleCommand();
    let deepest = 0;
    for (let step = 0; step < (60 * 1000) / GAME.simulationStepMs; step++) {
      simulation.step(
        () => brain.think(simulation, GAME.simulationStepMs, input),
        GAME.simulationStepMs,
      );
      deepest = Math.max(deepest, vehicle.chassis.waterDepth);
    }
    expect(vehicle.vitality.alive).toBe(true);
    expect(deepest).toBeLessThan(WADING.hurtDepth);
  });
});
