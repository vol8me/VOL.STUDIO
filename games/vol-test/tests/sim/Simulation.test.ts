import { describe, expect, it } from 'vitest';
import { WEAPON } from '@/config/tank';
import type { SimEvent } from '@/sim/events';
import { command, simulation, STEP_MS } from '../support/sim';

describe('Simulation', () => {
  it('tankı dünyanın ortasına yerleştirir', () => {
    const sim = simulation();
    expect(sim.tank.x).toBe(2048);
    expect(sim.tank.y).toBe(2048);
  });

  it('ateş aralıkla sınırlıdır, namludan çıkar ve tankı ters yöne iter', () => {
    const sim = simulation();
    const firing = command({ fire: true });
    sim.step(firing, STEP_MS);
    expect(sim.projectiles.count).toBe(1);
    expect(sim.tank.vy).toBeGreaterThan(0);
    const events = sim.drainEvents([]);
    const fired = events.find((event) => event.kind === 'fired');
    expect(fired).toMatchObject({ angle: sim.tank.turret });
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
    expect(Math.abs(sim.tank.suspension.roll)).toBeGreaterThan(Math.abs(sim.tank.suspension.pitch));
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
      const tank = sim.tank;
      return [tank.x, tank.y, tank.hull, tank.suspension.pitch, sim.projectiles.count];
    };
    expect(run()).toEqual(run());
  });
});
