import { describe, expect, it } from 'vitest';
import { COMBAT } from '@/config/combat';
import { Simulation } from '@/sim/Simulation';
import type { SimEvent } from '@/sim/events';
import { command, simulation, STEP_MS, world } from '../../support/sim';
import { STRIKER } from '@/config/vehicles';

describe('Simulation savaş yaşam döngüsü', () => {
  it('yetkili hasar ve iyileşme kapısı olayları doğru sırada üretir; ölü araç ateş etmez', () => {
    const sim = simulation();
    const enemy = sim.spawn(2400, 2048, 0);
    expect(sim.applyDamage(enemy.id, 40, sim.player.id)).toBe(40);
    expect(sim.healVehicle(enemy.id, 10, sim.player.id)).toBe(10);
    expect(sim.applyDamage(enemy.id, 1000, sim.player.id)).toBe(STRIKER.health - 30);
    expect(enemy.vitality.alive).toBe(false);
    expect(sim.healVehicle(enemy.id, 10)).toBe(0);
    expect(sim.applyDamage(enemy.id, 10)).toBe(0);
    const events = sim.drainEvents([]);
    expect(events.map((event) => event.kind)).toEqual(['damaged', 'healed', 'damaged', 'died']);
    expect(events[2]).toMatchObject({ amount: STRIKER.health - 30, health: 0, cause: 'direct' });
    const at = { x: enemy.chassis.x, y: enemy.chassis.y };
    for (let tick = 0; tick < 20; tick++)
      sim.step(
        (vehicle) => command(vehicle.id === enemy.id ? { fire: true, moveX: 1 } : {}),
        STEP_MS,
      );
    expect(enemy.chassis.x).toBe(at.x);
    expect(enemy.chassis.y).toBe(at.y);
    expect(sim.drainEvents([]).filter((event) => event.kind === 'fired')).toHaveLength(0);
  });

  it('resetVehicle canlı aracı da sıfırlar; bilinmeyen kimlikte false döner', () => {
    const sim = simulation();
    const vehicle = sim.spawn(2400, 2048, 0);
    sim.applyDamage(vehicle.id, 40);
    vehicle.chassis.trackLeft = 120;
    vehicle.chassis.vx = 90;
    vehicle.gun.trigger();
    sim.drainEvents([]);
    expect(sim.resetVehicle(vehicle.id, 2100, 2200, 1)).toBe(true);
    expect(vehicle.chassis.x).toBe(2100);
    expect(vehicle.chassis.y).toBe(2200);
    expect(vehicle.chassis.vx).toBe(0);
    expect(vehicle.chassis.trackLeft).toBe(0);
    expect(vehicle.gun.isReady()).toBe(true);
    expect(vehicle.vitality.health).toBe(STRIKER.health);
    expect(vehicle.vitality.protectionRemainingMs).toBe(COMBAT.respawnProtectionMs);
    expect(sim.drainEvents([])).toContainEqual({
      kind: 'respawned',
      target: vehicle.id,
      x: 2100,
      y: 2200,
    });
    expect(sim.resetVehicle(999)).toBe(false);
    expect(() => sim.resetVehicle(vehicle.id, Number.NaN)).toThrow(RangeError);
  });

  it('ölü araç isabet hedefi ve çarpışma gövdesi olmaz; kimlik korunarak yeniden doğar', () => {
    const sim = simulation();
    const target = sim.spawn(2400, 2048, 0);
    target.chassis.suspension.kick(15, 12);
    target.chassis.trackLeft = 100;
    target.chassis.trackRight = 300;
    sim.applyDamage(target.id, 1000);
    sim.drainEvents([]);
    expect(target.entryT(2300, 2048, 2500, 2048)).toBeNull();
    expect(sim.respawnVehicle(target.id, 2600, 2100, Math.PI)).toBe(true);
    expect(sim.vehicle(target.id)).toBe(target);
    expect(target.chassis.x).toBe(2600);
    expect(target.chassis.y).toBe(2100);
    expect(target.chassis.hull).toBeCloseTo(Math.PI);
    expect(target.chassis.trackLeft).toBe(0);
    expect(target.chassis.trackRight).toBe(0);
    expect(target.chassis.suspension.pitch).toBe(0);
    expect(target.chassis.suspension.roll).toBe(0);
    expect(target.vitality.health).toBe(STRIKER.health);
    expect(sim.applyDamage(target.id, 100)).toBe(0);
    expect(sim.respawnVehicle(target.id)).toBe(false);
    expect(sim.drainEvents([])).toContainEqual({
      kind: 'respawned',
      target: target.id,
      x: 2600,
      y: 2100,
    });
  });

  it('sayaç simülasyon adımlarıyla aynı olayları üretir ve varsayılan doğum konumuna döner', () => {
    const run = () => {
      const sim = simulation();
      const target = sim.spawn(1000, 2000, 0.5);
      target.chassis.place(1600, 1700);
      sim.applyDamage(target.id, 1000);
      const result: SimEvent[] = [];
      sim.drainEvents(result);
      const count = Math.ceil(COMBAT.respawnDelayMs / STEP_MS);
      for (let tick = 0; tick < count; tick++) {
        sim.step(command(), STEP_MS);
        sim.drainEvents(result);
      }
      return {
        health: target.vitality.health,
        pos: [target.chassis.x, target.chassis.y, target.chassis.hull],
        remaining: target.vitality.respawnRemainingMs,
        events: result,
      };
    };
    const result = run();
    expect(result).toEqual(run());
    expect(result.pos).toEqual([1000, 2000, 0.5]);
    expect(result.remaining).toBe(0);
    expect(result.events.filter((event) => event.kind === 'respawned')).toHaveLength(1);
  });

  it('dost ateşi ekip kimliğinde filtrelenir; düşmana gerçek mermi hasarı uygulanır', () => {
    const sim = new Simulation({
      world: world(),
      vehicle: STRIKER,
      combat: COMBAT,
    });
    const teammate = sim.spawn(2048 + 120, 2048, 0, 10);
    const enemy = sim.spawn(2048 + 230, 2048, 0, 20);
    // Oyuncu takım değiştirmese de takım 10'un aracı, silah doğrultusunun üzerindedir.
    // Takımsız oyuncu her araca düşman sayılır; takım filtresi için ayrı atıcı kurulur.
    const shooter = sim.spawn(2048, 1700, 0, 10);
    teammate.chassis.place(2048 + 120, 1700);
    enemy.chassis.place(2048 + 230, 1700);
    for (let tick = 0; tick < 75; tick++) {
      sim.step(
        (vehicle) => command(vehicle.id === shooter.id ? { aimX: 1, fire: tick === 30 } : {}),
        STEP_MS,
      );
    }
    expect(teammate.vitality.health).toBe(STRIKER.health);
    expect(enemy.vitality.health).toBeLessThan(STRIKER.health);
    expect(sim.drainEvents([]).filter((event) => event.kind === 'hit')).toEqual([
      expect.objectContaining({ owner: shooter.id, target: enemy.id }),
    ]);
  });

  it('araç çarpışması normal hıza göre hasar verir; aynı çift bir adımda tek kez yaralanır', () => {
    const sim = new Simulation({
      world: world(),
      vehicle: STRIKER,
      combat: {
        ...COMBAT,
        collision: { minSpeed: 0, damagePerSpeed: 0.5 },
      },
    });
    const enemy = sim.spawn(2048 + 120, 2048, Math.PI);
    let damaged = false;
    for (let tick = 0; tick < 120; tick++) {
      sim.step((vehicle) => command({ moveX: vehicle.id === enemy.id ? -1 : 1 }), STEP_MS);
      const events = sim.drainEvents([]);
      const wounds = events.filter(
        (event) => event.kind === 'damaged' && event.target === enemy.id,
      );
      expect(wounds.length, 'tek adım hasar sınırı').toBeLessThanOrEqual(1);
      if (wounds.length) {
        damaged = true;
        expect(wounds[0]).toMatchObject({
          cause: 'collision',
          source: sim.player.id,
          target: enemy.id,
        });
      }
    }
    expect(damaged).toBe(true);
  });
});
