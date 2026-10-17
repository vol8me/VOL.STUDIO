import { describe, expect, it } from 'vitest';
import { VEHICLE_IDS, VEHICLES } from '@/config/vehicles';
import { ScenarioRunner } from '@/sim/scenarios/ScenarioRunner';
import { command, simulation, STEP_MS } from '../../support/sim';

describe('ScenarioRunner', () => {
  it('dünya kenarında her araç kendi ayak iziyle tamamen içeride doğar', () => {
    const sim = simulation(1024);
    sim.player.chassis.place(80, 80, 0);
    const runner = new ScenarioRunner(sim);
    runner.select('sandbox', 1);
    for (const vehicle of sim.vehicles) {
      const chassis = vehicle.chassis;
      const { halfLength, halfWidth } = chassis.shape;
      for (const forward of [-halfLength, halfLength])
        for (const right of [-halfWidth, halfWidth]) {
          const x = chassis.x + Math.cos(chassis.hull) * forward - Math.sin(chassis.hull) * right;
          const y = chassis.y + Math.sin(chassis.hull) * forward + Math.cos(chassis.hull) * right;
          expect(sim.world.contains(x, y), vehicle.spec.id).toBe(true);
        }
    }
  });

  it('geçersiz seçim çalışan senaryoyu silmez', () => {
    const sim = simulation();
    const runner = new ScenarioRunner(sim);
    runner.select('sandbox', 7);
    const before = [...sim.vehicles];
    expect(() => runner.select('invalid' as 'empty', 7)).toThrow(RangeError);
    expect(() => runner.select('empty', NaN)).toThrow(RangeError);
    expect(sim.vehicles).toEqual(before);
    expect(runner.scenario).toBe('sandbox');
    expect(runner.currentSeed).toBe(7);
  });

  it('geliştirici araç değişiminde eski oyuncu referansını bırakır ve yeni konuma nişan alır', () => {
    const sim = simulation();
    const runner = new ScenarioRunner(sim);
    runner.select('multitank', 7);
    const observer = sim.vehicles[1];
    for (const other of sim.vehicles.slice(2)) sim.despawn(other.id);
    observer.chassis.place(1000, 1000, 0);
    sim.player.chassis.place(1100, 1000, 0);
    expect(runner.commandFor(observer, command()).aimX).toBe(100);
    const next = sim.replacePlayer(VEHICLES.goliath);
    next.chassis.place(900, 1000, 0);
    expect(runner.commandFor(observer, command()).aimX).toBe(-100);
  });

  it('yakındaki enkaz hedef değildir; yeniden doğan araç tekrar hedef olur', () => {
    const sim = simulation();
    const runner = new ScenarioRunner(sim);
    runner.select('multitank', 7);
    const observer = sim.vehicles[1];
    for (const other of sim.vehicles.slice(2)) sim.despawn(other.id);
    observer.chassis.place(1000, 1000, 0);
    sim.player.chassis.place(1100, 1000, 0);
    sim.applyDamage(sim.player.id, sim.player.vitality.maxHealth);
    expect(runner.commandFor(observer, command()).aimX).toBe(0);
    sim.respawnVehicle(sim.player.id, 1100, 1000, 0);
    sim.timeMs += STEP_MS;
    expect(runner.commandFor(observer, command()).aimX).toBe(100);
  });

  it('boş dünyayı korur; tekrar açıp kapamak araç, mermi ve indeks büyütmez', () => {
    const sim = simulation();
    const runner = new ScenarioRunner(sim);
    expect(sim.vehicles).toHaveLength(1);
    const player = sim.player;
    for (let turn = 0; turn < 8; turn++) {
      runner.select('sandbox', 42);
      const count = sim.vehicles.length;
      expect(count).toBeGreaterThan(8);
      runner.select('sandbox', 42);
      expect(sim.vehicles).toHaveLength(count);
      sim.step((vehicle) => runner.commandFor(vehicle, command({ fire: true })), STEP_MS);
      runner.select('empty', 42);
      expect(sim.vehicles).toEqual([player]);
      expect(sim.projectiles.count).toBe(0);
    }
    runner.destroy();
    expect(sim.vehicles).toEqual([player]);
  });

  it.each(['multitank', 'sandbox'] as const)(
    '%s: ilk doğuşta hiçbir iki araç birbirine yakın değildir',
    (mode) => {
      for (const seed of [1, 2, 3, 731]) {
        const sim = simulation();
        new ScenarioRunner(sim).select(mode, seed);
        let nearest = Infinity;
        for (const a of sim.vehicles)
          for (const b of sim.vehicles)
            if (a !== b)
              nearest = Math.min(
                nearest,
                Math.hypot(a.chassis.x - b.chassis.x, a.chassis.y - b.chassis.y),
              );
        // ~7 m: gövdeler ve ilk atış menzili birbirine girmez; oyuncuya da en az 13 m uzak doğar.
        expect(nearest).toBeGreaterThan(230);
        for (const other of sim.vehicles.slice(1))
          expect(
            Math.hypot(
              other.chassis.x - sim.player.chassis.x,
              other.chassis.y - sim.player.chassis.y,
            ),
          ).toBeGreaterThan(400);
      }
    },
  );

  it('kadro bütün araçları döndürür ve her tohumda aynı sırada kurulur', () => {
    const roster = (seed: number) => {
      const sim = simulation();
      new ScenarioRunner(sim).select('sandbox', seed);
      return sim.vehicles.slice(1).map((vehicle) => vehicle.spec.id);
    };
    const first = roster(1);
    expect(new Set(first)).toEqual(new Set(VEHICLE_IDS));
    expect(roster(2)).toEqual(first);
  });

  it('aynı tohum ve adım aynı yerleşimi, komutu ve fizik sonucunu üretir', () => {
    const run = (seed: number) => {
      const sim = simulation();
      const runner = new ScenarioRunner(sim);
      runner.select('multitank', seed);
      for (let step = 0; step < 90; step++) {
        sim.step((vehicle) => runner.commandFor(vehicle, command({ moveX: 1 })), STEP_MS);
      }
      return sim.vehicles.map(({ chassis }) => [
        chassis.x,
        chassis.y,
        chassis.hull,
        chassis.turret,
      ]);
    };
    expect(run(123)).toEqual(run(123));
    expect(run(124)).not.toEqual(run(123));
  });

  it('slalom ve hedefler boşta kalır; yalnız oyuncu komutu oyuncuya gider', () => {
    const sim = simulation();
    const runner = new ScenarioRunner(sim);
    for (const level of ['slalom', 'targets'] as const) {
      runner.select(level, 10);
      const positions = sim.vehicles.slice(1).map(({ chassis }) => [chassis.x, chassis.y]);
      const input = command({ moveX: 1 });
      expect(runner.commandFor(sim.player, input)).toBe(input);
      for (const vehicle of sim.vehicles.slice(1)) {
        expect(runner.commandFor(vehicle, input)).toMatchObject({ moveX: 0, fire: false });
      }
      for (let step = 0; step < 30; step++)
        sim.step((vehicle) => runner.commandFor(vehicle, command()), STEP_MS);
      expect(sim.vehicles.slice(1).map(({ chassis }) => [chassis.x, chassis.y])).toEqual(positions);
    }
  });
});
