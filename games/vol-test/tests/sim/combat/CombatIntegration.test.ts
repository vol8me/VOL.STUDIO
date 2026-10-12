import { describe, expect, it } from 'vitest';
import { COMBAT } from '@/config/combat';
import { SUSPENSION, TANK, WEAPON } from '@/config/tank';
import { Simulation } from '@/sim/Simulation';
import type { SimEvent } from '@/sim/events';
import { command, simulation, STEP_MS, world } from '../../support/sim';

describe('Simulation savaş yaşam döngüsü', () => {
  it('yetkili hasar ve iyileşme kapısı olayları doğru sırada üretir; ölü araç ateş etmez', () => {
    const sim = simulation();
    const enemy = sim.spawn(2400, 2048, 0);
    expect(sim.applyDamage(enemy.id, 40, sim.player.id)).toBe(40);
    expect(sim.healVehicle(enemy.id, 10, sim.player.id)).toBe(10);
    expect(sim.applyDamage(enemy.id, 1000, sim.player.id)).toBe(70);
    expect(enemy.vitality.alive).toBe(false);
    expect(sim.healVehicle(enemy.id, 10)).toBe(0);
    expect(sim.applyDamage(enemy.id, 10)).toBe(0);
    const events = sim.drainEvents([]);
    expect(events.map((event) => event.kind)).toEqual(['damaged', 'healed', 'damaged', 'died']);
    expect(events[2]).toMatchObject({ amount: 70, health: 0, cause: 'direct' });
    const at = { x: enemy.tank.x, y: enemy.tank.y };
    for (let tick = 0; tick < 20; tick++)
      sim.step(
        (vehicle) => command(vehicle.id === enemy.id ? { fire: true, moveX: 1 } : {}),
        STEP_MS,
      );
    expect(enemy.tank.x).toBe(at.x);
    expect(enemy.tank.y).toBe(at.y);
    expect(sim.drainEvents([]).filter((event) => event.kind === 'fired')).toHaveLength(0);
  });

  it('ölü araç isabet hedefi ve çarpışma gövdesi olmaz; kimlik korunarak yeniden doğar', () => {
    const sim = simulation();
    const target = sim.spawn(2400, 2048, 0);
    target.tank.suspension.kick(15, 12);
    target.tank.trackLeft = 100;
    target.tank.trackRight = 300;
    sim.applyDamage(target.id, 1000);
    sim.drainEvents([]);
    expect(target.entryT(2300, 2048, 2500, 2048)).toBeNull();
    expect(sim.respawnVehicle(target.id, 2600, 2100, Math.PI)).toBe(true);
    expect(sim.vehicle(target.id)).toBe(target);
    expect(target.tank.x).toBe(2600);
    expect(target.tank.y).toBe(2100);
    expect(target.tank.hull).toBeCloseTo(Math.PI);
    expect(target.tank.trackLeft).toBe(0);
    expect(target.tank.trackRight).toBe(0);
    expect(target.tank.suspension.pitch).toBe(0);
    expect(target.tank.suspension.roll).toBe(0);
    expect(target.vitality.health).toBe(COMBAT.maxHealth);
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
      target.tank.place(1600, 1700);
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
        pos: [target.tank.x, target.tank.y, target.tank.hull],
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
      tank: TANK,
      suspension: SUSPENSION,
      weapon: WEAPON,
      combat: COMBAT,
    });
    const teammate = sim.spawn(2048 + 120, 2048, 0, 10);
    const enemy = sim.spawn(2048 + 230, 2048, 0, 20);
    // Oyuncu takım değiştirmese de takım 10'un aracı, silah doğrultusunun üzerindedir.
    // Takımsız oyuncu her araca düşman sayılır; takım filtresi için ayrı atıcı kurulur.
    const shooter = sim.spawn(2048, 1700, 0, 10);
    teammate.tank.place(2048 + 120, 1700);
    enemy.tank.place(2048 + 230, 1700);
    for (let tick = 0; tick < 75; tick++) {
      sim.step(
        (vehicle) => command(vehicle.id === shooter.id ? { aimX: 1, fire: tick === 30 } : {}),
        STEP_MS,
      );
    }
    expect(teammate.vitality.health).toBe(COMBAT.maxHealth);
    expect(enemy.vitality.health).toBeLessThan(COMBAT.maxHealth);
    expect(sim.drainEvents([]).filter((event) => event.kind === 'hit')).toEqual([
      expect.objectContaining({ owner: shooter.id, target: enemy.id }),
    ]);
  });

  it('araç çarpışması normal hıza göre hasar verir; aynı çift bir adımda tek kez yaralanır', () => {
    const sim = new Simulation({
      world: world(),
      tank: TANK,
      suspension: SUSPENSION,
      weapon: WEAPON,
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
