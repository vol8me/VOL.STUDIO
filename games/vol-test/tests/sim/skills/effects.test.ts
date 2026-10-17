import { describe, expect, it } from 'vitest';
import { SKILLS } from '@/config/skills';
import { BARRACUDA, GOLIATH, LEVIATHAN, MANTA, STRIKER, type VehicleSpec } from '@/config/vehicles';
import type { SimEvent } from '@/sim/events';
import { Simulation } from '@/sim/Simulation';
import { command, STEP_MS, world } from '../../support/sim';

function arena(spec: VehicleSpec, enemy: VehicleSpec = STRIKER) {
  const sim = new Simulation({ world: world(4096), vehicle: spec });
  sim.player.chassis.place(2048, 2048, 0);
  const foe = sim.spawn(2500, 2048, Math.PI, null, undefined, enemy);
  return { sim, me: sim.player, foe };
}

/** Yeteneği tetikler: Space basılı tutulup depo aktifleşene dek adım atılır. */
function engage(sim: Simulation, steps = 3): void {
  for (let step = 0; step < steps; step++) sim.step(command({ boost: true, brake: true }), STEP_MS);
}

/** Hover'da fren de yeteneği tetikler; bu yüzden kapalı koşulda hiç fren verilmez. */
function shots(spec: VehicleSpec, boosting: boolean, seconds = 6): number {
  const { sim, me } = arena(spec);
  const events: SimEvent[] = [];
  let fired = 0;
  const frames = Math.round((seconds * 1000) / STEP_MS);
  for (let frame = 0; frame < frames; frame++) {
    sim.step(command({ fire: true, aimX: 1, boost: boosting }), STEP_MS);
    events.length = 0;
    sim.drainEvents(events);
    fired += events.filter((event) => event.kind === 'fired' && event.source === me.id).length;
  }
  return fired;
}

describe('yetenek: kalkan (Goliath)', () => {
  it('kalkan açıkken savaş hasarı sıfırdır, can değişmez', () => {
    const { sim, me, foe } = arena(GOLIATH);
    engage(sim);
    expect(me.chassis.boosting).toBe(true);
    expect(me.effect).toBe(SKILLS.shield);
    const before = me.vitality.health;
    for (const cause of ['projectile', 'collision', 'direct'] as const)
      expect(sim.applyDamage(me.id, 60, foe.id, cause), cause).toBe(0);
    expect(me.vitality.health).toBe(before);
    expect(sim.drainEvents([]).filter((event) => event.kind === 'damaged')).toHaveLength(0);
  });

  it('kalkan kapalıyken hasar tam işler; süre bitince koruma kalkar', () => {
    const { sim, me, foe } = arena(GOLIATH);
    expect(me.effect).toBe(SKILLS.dash);
    expect(sim.applyDamage(me.id, 10, foe.id, 'projectile')).toBe(10);
    engage(sim);
    expect(sim.applyDamage(me.id, 10, foe.id, 'projectile')).toBe(0);
    const duration = GOLIATH.walker.boostCapacity / GOLIATH.walker.boostDrain;
    const frames = Math.ceil((duration * 1000) / STEP_MS) + 12;
    for (let frame = 0; frame < frames; frame++)
      sim.step(command({ boost: true, brake: true }), STEP_MS);
    expect(me.chassis.boosting).toBe(false);
    expect(sim.applyDamage(me.id, 10, foe.id, 'projectile')).toBe(10);
  });

  it('kalkan süresi depoyla belirlidir ve Space basılı kalsa da dolum bitmeden yeniden açılmaz', () => {
    const { sim, me } = arena(GOLIATH);
    const duration = (GOLIATH.walker.boostCapacity / GOLIATH.walker.boostDrain) * 1000;
    let up = 0;
    let reopened = false;
    let closed = false;
    const frames = Math.round(6000 / STEP_MS);
    for (let frame = 0; frame < frames; frame++) {
      sim.step(command({ boost: true, brake: true }), STEP_MS);
      if (me.chassis.boosting) {
        if (closed) reopened = true;
        up += STEP_MS;
      } else if (up > 0) closed = true;
    }
    expect(up).toBeGreaterThan(duration * 0.9);
    expect(up).toBeLessThan(duration * 1.15 + 3 * STEP_MS);
    expect(reopened).toBe(false);
  });

  it('mermi isabeti kalkanlı aracı yerinden daha az oynatır ve canını korur', () => {
    const run = (shield: boolean) => {
      const { sim, me, foe } = arena(GOLIATH, STRIKER);
      foe.chassis.place(2300, 2048, Math.PI);
      for (let frame = 0; frame < 90; frame++)
        sim.step(
          (vehicle) =>
            vehicle.id === foe.id
              ? command({ fire: true, aimX: -1 })
              : command({ boost: shield, brake: shield }),
          STEP_MS,
        );
      return me;
    };
    const open = run(false);
    const shielded = run(true);
    expect(shielded.vitality.health).toBe(GOLIATH.health);
    expect(open.vitality.health).toBeLessThan(GOLIATH.health);
  });

  it('boğulmayı kalkan durdurmaz: kalkanlı araç yine boğulur', () => {
    const { sim, me } = arena(GOLIATH);
    engage(sim);
    const before = me.vitality.health;
    expect(sim.applyDamage(me.id, 25, undefined, 'drown')).toBe(25);
    expect(me.vitality.health).toBe(before - 25);
  });

  it('yeniden doğan araç kalkanla başlamaz: depo sıfırlanır', () => {
    const { sim, me } = arena(GOLIATH);
    engage(sim);
    expect(me.chassis.boosting).toBe(true);
    sim.resetVehicle(me.id);
    expect(me.chassis.boosting).toBe(false);
    expect(me.effect).toBe(SKILLS.dash);
  });

  it('kalkan yürüyüşü zorlamaz: Space ile durağan araç yerinden kıpırdamaz', () => {
    const { sim, me } = arena(GOLIATH);
    engage(sim, 40);
    expect(Math.hypot(me.chassis.x - 2048, me.chassis.y - 2048)).toBeLessThan(2);
  });
});

describe('yetenek: aşırı yük (Manta)', () => {
  it('aşırı yük açıkken aynı sürede daha çok atış çıkar', () => {
    const plain = shots(MANTA, false);
    const boosted = shots(MANTA, true);
    expect(plain).toBeGreaterThan(2);
    expect(boosted).toBeGreaterThan(plain);
  });

  it('aşırı yük hasarı ve zırhı değiştirmez', () => {
    expect(SKILLS.overdrive.taken).toBe(1);
    expect(SKILLS.overdrive.dealt).toBe(1);
    expect(SKILLS.overdrive.fireRate).toBeGreaterThan(1);
  });
});

describe('yetenek: çarpma atağı (Barracuda)', () => {
  it('çarpma açıkken rakibe giden çarpışma hasarı katlanır, kendi hasarı azalır', () => {
    const { sim, me, foe } = arena(BARRACUDA);
    const plain = sim.applyDamage(foe.id, 20, me.id, 'collision');
    sim.healVehicle(foe.id, 100);
    engage(sim);
    expect(me.effect).toBe(SKILLS.ram);
    const rammed = sim.applyDamage(foe.id, 20, me.id, 'collision');
    expect(rammed).toBeCloseTo(plain * SKILLS.ram.ram, 5);
    const own = sim.applyDamage(me.id, 20, foe.id, 'collision');
    expect(own).toBeCloseTo(20 * SKILLS.ram.ramTaken, 5);
  });

  it('çarpma atağı mermi hasarını büyütmez', () => {
    const { sim, me, foe } = arena(BARRACUDA);
    const plain = sim.applyDamage(foe.id, 20, me.id, 'projectile');
    sim.healVehicle(foe.id, 100);
    engage(sim);
    expect(sim.applyDamage(foe.id, 20, me.id, 'projectile')).toBe(plain);
  });
});

describe('yetenek: kuşatma (Leviathan)', () => {
  it('kuşatma gelen hasarı azaltır, verilen mermi hasarını artırır', () => {
    const { sim, me, foe } = arena(LEVIATHAN);
    const plainTaken = sim.applyDamage(me.id, 40, foe.id, 'projectile');
    sim.healVehicle(me.id, 100);
    const plainDealt = sim.applyDamage(foe.id, 10, me.id, 'projectile');
    sim.healVehicle(foe.id, 100);
    engage(sim);
    expect(me.effect).toBe(SKILLS.siege);
    const siegeTaken = sim.applyDamage(me.id, 40, foe.id, 'projectile');
    const siegeDealt = sim.applyDamage(foe.id, 10, me.id, 'projectile');
    expect(siegeTaken).toBeCloseTo(plainTaken * SKILLS.siege.taken, 4);
    expect(siegeDealt).toBeCloseTo(plainDealt * SKILLS.siege.dealt, 4);
    expect(SKILLS.siege.push).toBeLessThan(1);
  });

  it('kuşatma duruşu aracı yavaşlatır: en yüksek hız normalin altında kalır', () => {
    const top = (boost: boolean): number => {
      const { sim, me } = arena(LEVIATHAN);
      let best = 0;
      for (let frame = 0; frame < 120; frame++) {
        sim.step(command({ moveX: 1, aimX: 1, boost }), STEP_MS);
        best = Math.max(best, me.chassis.speed);
      }
      return best;
    };
    expect(top(true)).toBeLessThan(top(false) * 0.8);
  });
});

describe('Vehicle.effect', () => {
  it('yetenek yalnız depo aktifken geçerlidir; kapalıyken her araçta nötrdür', () => {
    for (const spec of [GOLIATH, MANTA, BARRACUDA, LEVIATHAN]) {
      const { me } = arena(spec);
      expect(me.chassis.boosting).toBe(false);
      expect(me.effect).toBe(SKILLS.dash);
    }
  });
});
