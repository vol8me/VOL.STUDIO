import { describe, expect, it } from 'vitest';
import { WEAPON } from '@/config/tank';
import type { SimEvent } from '@/sim/events';
import { command, simulation, STEP_MS } from '../support/sim';

describe('Simulation', () => {
  it('tankı dünyanın ortasına yerleştirir', () => {
    const sim = simulation();
    expect(sim.player.tank.x).toBe(2048);
    expect(sim.player.tank.y).toBe(2048);
  });

  it('ateş aralıkla sınırlıdır, namludan çıkar ve tankı ters yöne iter', () => {
    const sim = simulation();
    const firing = command({ fire: true });
    sim.step(firing, STEP_MS);
    expect(sim.projectiles.count).toBe(1);
    expect(sim.player.tank.vy).toBeGreaterThan(0);
    const events = sim.drainEvents([]);
    const fired = events.find((event) => event.kind === 'fired');
    expect(fired).toMatchObject({ angle: sim.player.tank.turret });
    for (let step = 0; step < Math.ceil(WEAPON.intervalMs / STEP_MS) - 1; step++) {
      sim.step(firing, STEP_MS);
    }
    expect(sim.projectiles.count).toBe(1);
    sim.step(firing, STEP_MS);
    expect(sim.projectiles.count).toBe(2);
  });

  it('yana ateş gövdeyi yalpalatır', () => {
    const sim = simulation();
    for (let step = 0; step < 60; step++) sim.step(command({ aimX: 1 }), STEP_MS);
    sim.step(command({ aimX: 1, fire: true }), STEP_MS);
    for (let step = 0; step < 3; step++) sim.step(command({ aimX: 1 }), STEP_MS);
    expect(Math.abs(sim.player.tank.suspension.roll)).toBeGreaterThan(
      Math.abs(sim.player.tank.suspension.pitch),
    );
  });

  it('duvar çarpması olay üretir', () => {
    const sim = simulation(1024);
    const events: SimEvent[] = [];
    for (let step = 0; step < 240; step++) {
      sim.step(command({ moveX: 1, boost: true }), STEP_MS);
      sim.drainEvents(events);
    }
    const hit = events.find((event) => event.kind === 'wallHit');
    expect(hit).toMatchObject({ normalX: -1, normalY: 0 });
  });

  it('boşaltılmayan olay kuyruğu sınırlıdır', () => {
    const sim = simulation();
    for (let step = 0; step < 20000; step++) sim.step(command({ fire: true }), STEP_MS);
    expect(sim.drainEvents([]).length).toBeLessThanOrEqual(512);
  });

  it('araçlar kimlikle yönetilir; oyuncu kaldırılamaz', () => {
    const sim = simulation();
    const other = sim.spawn(1000, 1000, 0);
    expect(sim.vehicles.map((vehicle) => vehicle.id)).toEqual([sim.player.id, other.id]);
    expect(sim.vehicle(other.id)).toBe(other);
    expect(() => sim.despawn(sim.player.id)).toThrow();
    sim.despawn(other.id);
    sim.despawn(999);
    expect(sim.vehicles).toHaveLength(1);
    expect(sim.spawn(0, 0).id).toBeGreaterThan(other.id);
  });

  it('komut kaynağı her araca kendi komutunu verir', () => {
    const sim = simulation();
    const other = sim.spawn(1000, 2048, 0);
    for (let step = 0; step < 60; step++) {
      sim.step((vehicle) => command({ moveX: vehicle.id === other.id ? 1 : 0 }), STEP_MS);
    }
    expect(other.tank.x).toBeGreaterThan(1010);
    expect(sim.player.tank.speed).toBeLessThan(1);
  });

  it('mermi başka araca isabet eder ve onu iter; sahibine isabet etmez', () => {
    const sim = simulation();
    const target = sim.spawn(2048 + 200, 2048, 0);
    const events: SimEvent[] = [];
    for (let step = 0; step < 60; step++) {
      sim.step(
        (vehicle) => command(vehicle.id === sim.player.id ? { aimX: 1, fire: step === 30 } : {}),
        STEP_MS,
      );
      sim.drainEvents(events);
    }
    const hit = events.find((event) => event.kind === 'hit');
    expect(hit).toMatchObject({ owner: sim.player.id, target: target.id });
    expect(target.tank.x).toBeGreaterThan(2048 + 200);
  });

  it('araçlar çarpışır, olay üretir ve iç içe geçmez', () => {
    const sim = simulation();
    const other = sim.spawn(2048 + 120, 2048, Math.PI);
    const events: SimEvent[] = [];
    for (let step = 0; step < 120; step++) {
      sim.step((vehicle) => command({ moveX: vehicle.id === other.id ? -1 : 1 }), STEP_MS);
      sim.drainEvents(events);
      const gap = Math.hypot(other.tank.x - sim.player.tank.x, other.tank.y - sim.player.tank.y);
      expect(gap, `adım ${step}`).toBeGreaterThan(2 * 21 - 1);
    }
    const collision = events.find((event) => event.kind === 'collision');
    expect(collision).toBeDefined();
  });

  it('aynı komut dizisi aynı sonucu verir', () => {
    const run = () => {
      const sim = simulation();
      for (let step = 0; step < 240; step++) {
        const angle = step * 0.03;
        sim.step(
          command({
            moveX: Math.cos(angle),
            moveY: Math.sin(angle),
            aimX: 1,
            fire: step % 3 === 0,
            boost: step > 60,
          }),
          STEP_MS,
        );
      }
      const tank = sim.player.tank;
      return [tank.x, tank.y, tank.hull, tank.suspension.pitch, sim.projectiles.count];
    };
    expect(run()).toEqual(run());
  });
});
