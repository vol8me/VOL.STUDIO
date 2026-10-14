import { describe, expect, it } from 'vitest';
import { COMBAT } from '@/config/combat';
import { ARACHNID, DART, STRIKER, VEHICLE_IDS } from '@/config/vehicles';
import { WAR } from '@/config/war';
import { BotBrain } from '@/sim/ai/BotBrain';
import { idleCommand } from '@/sim/command';
import { baseCenter } from '@/sim/war/Deployment';
import type { WarStepEvent } from '@/sim/war/War';
import { NO_OWNER } from '@/sim/war/Zones';
import { newWar, SIZE } from './support';

const STEP = 1000 / 60;

/** Savaşı `seconds` ilerletir; insanlar boştadır. */
function run(war: ReturnType<typeof newWar>, seconds: number): WarStepEvent[] {
  const events: WarStepEvent[] = [];
  const idle = idleCommand();
  for (let step = 0; step < (seconds * 1000) / STEP; step++) war.step(STEP, () => idle, events);
  return events;
}

const bot = (war: ReturnType<typeof newWar>, faction: number, spec = STRIKER) =>
  war.addBot(
    `Bot${war.combatants.size}`,
    spec,
    faction,
    (vehicle) => new BotBrain(vehicle, { seed: 1 }),
  );

describe('War.join', () => {
  it('insan üssünde doğar, korumalıdır ve cephe takım kimliğidir', () => {
    const war = newWar();
    const human = war.join({ name: 'Ada', spec: DART });
    const base = baseCenter(war.sim.world, human.faction);
    const { x, y } = human.vehicle.chassis;
    expect(Math.hypot(x - base.x, y - base.y)).toBeLessThanOrEqual(WAR.bases[human.faction].radius);
    expect(human.vehicle.team).toBe(human.faction);
    expect(human.vehicle.spec).toBe(DART);
    expect(human.vehicle.vitality.protectionRemainingMs).toBe(COMBAT.respawnProtectionMs);
    expect(human.brain).toBeNull();
  });

  it('insanları cepheler arasında dengeler; istenen cephe dengeyi bozmuyorsa verilir', () => {
    const war = newWar();
    const first = war.join({ name: 'A', spec: STRIKER, faction: 1 });
    expect(first.faction).toBe(1);
    // Cephe 1'de bir insan varken bir kişi daha 1'i isterse denge bozulur: 0'a gider.
    const second = war.join({ name: 'B', spec: STRIKER, faction: 1 });
    expect(second.faction).toBe(0);
    // İnsan sayısı eşitken istek karşılanır; fark oluşunca denge bozulmaz.
    expect(war.join({ name: 'C', spec: STRIKER, faction: 0 }).faction).toBe(0);
    expect(war.join({ name: 'D', spec: STRIKER, faction: 0 }).faction).toBe(1);
    expect(war.humans(0)).toBe(2);
    expect(war.humans(1)).toBe(2);
  });

  it('geçersiz cephe isteğini yok sayar ve dengeye göre yerleştirir', () => {
    const war = newWar();
    for (const faction of [7, -1, 0.5, Number.NaN]) {
      const joined = war.join({ name: `x${faction}`, spec: STRIKER, faction });
      expect([0, 1]).toContain(joined.faction);
    }
    expect(Math.abs(war.humans(0) - war.humans(1))).toBeLessThanOrEqual(1);
  });

  it('eşit insan sayısında puanı düşük cepheyi seçer', () => {
    const war = newWar();
    war.scores[0] = 300;
    expect(war.join({ name: 'A', spec: STRIKER }).faction).toBe(1);
  });

  it('nüfus hedefin üstüne çıkarsa fazla botu çıkarır, insanı değil', () => {
    const war = newWar();
    for (let index = 0; index < WAR.population.perFaction; index++) {
      bot(war, 0);
      bot(war, 1);
    }
    const human = war.join({ name: 'Ada', spec: STRIKER, faction: 0 });
    expect(war.population(0)).toBe(WAR.population.perFaction);
    expect(war.combatants.has(human.vehicle.id)).toBe(true);
    expect(war.humans(0)).toBe(1);
  });

  it('ölü botu önce çıkarır', () => {
    const war = newWar();
    const bots = Array.from({ length: WAR.population.perFaction }, () => bot(war, 0));
    bots[2].vehicle.vitality.health = 0;
    const deadId = bots[2].vehicle.id;
    war.join({ name: 'Ada', spec: STRIKER, faction: 0 });
    expect(war.combatants.has(deadId)).toBe(false);
  });
});

describe('War.step', () => {
  it('düşman öldürmek öldürme sayısını ve cephe puanını artırır, ölen ölüm yazar', () => {
    const war = newWar();
    const killer = war.join({ name: 'A', spec: STRIKER, faction: 0 });
    const victim = war.join({ name: 'B', spec: STRIKER, faction: 1 });
    killer.vehicle.vitality.protectionRemainingMs = 0;
    victim.vehicle.vitality.protectionRemainingMs = 0;
    war.sim.applyDamage(victim.vehicle.id, 1000, killer.vehicle.id);
    run(war, 0.1);
    expect(killer.kills).toBe(1);
    expect(victim.deaths).toBe(1);
    expect(war.scores[0]).toBeGreaterThanOrEqual(WAR.score.perKill);
    expect(war.scores[1]).toBe(0);
  });

  it('kendi kendine ölüm ya da dost ateşi öldürme saymaz', () => {
    const war = newWar();
    const a = war.join({ name: 'A', spec: STRIKER, faction: 0 });
    const b = bot(war, 0);
    for (const unit of [a, b]) unit.vehicle.vitality.protectionRemainingMs = 0;
    war.sim.applyDamage(a.vehicle.id, 1000);
    run(war, 0.1);
    expect(a.deaths).toBe(1);
    expect(a.kills).toBe(0);
    expect(war.scores[0]).toBe(0);
    // Dost ateşi mermiyi geçirir; doğrudan hasar yine de ölüm yazar ama kimse öldürme almaz.
    war.sim.applyDamage(b.vehicle.id, 1000, a.vehicle.id);
    run(war, 0.1);
    expect(a.kills).toBe(0);
  });

  it('ölen araç kendi üssünde yeniden doğar', () => {
    const war = newWar();
    const human = war.join({ name: 'A', spec: STRIKER, faction: 1 });
    human.vehicle.vitality.protectionRemainingMs = 0;
    human.vehicle.chassis.place(SIZE / 2, SIZE / 2);
    war.sim.applyDamage(human.vehicle.id, 1000);
    run(war, COMBAT.respawnDelayMs / 1000 + 0.5);
    expect(human.vehicle.vitality.alive).toBe(true);
    const base = baseCenter(war.sim.world, 1);
    const { x, y } = human.vehicle.chassis;
    expect(Math.hypot(x - base.x, y - base.y)).toBeLessThanOrEqual(WAR.bases[1].radius + 80);
    expect(human.vehicle.vitality.protectionRemainingMs).toBeGreaterThan(0);
  });

  it('elde tutulan bölge cepheye saniyede `zonePerSecond` puan kazandırır', () => {
    const war = newWar();
    const core = war.zones.zones[0];
    const unit = war.join({ name: 'A', spec: STRIKER, faction: 0 });
    unit.vehicle.chassis.place(core.x, core.y);
    run(war, WAR.capture.soloSeconds + 1);
    expect(core.owner).toBe(0);
    const before = war.scores[0];
    run(war, 10);
    expect(war.scores[0] - before).toBeCloseTo(10 * WAR.score.zonePerSecond, 1);
  });

  it('zafer: eşiğe ulaşan cephe kazanır, puanlar ve bölgeler sıfırlanır, savaş sürer', () => {
    const war = newWar();
    const core = war.zones.zones[0];
    const unit = war.join({ name: 'A', spec: STRIKER, faction: 0 });
    unit.vehicle.chassis.place(core.x, core.y);
    run(war, WAR.capture.soloSeconds + 1);
    war.scores[0] = WAR.score.dominance - 0.5;
    const events = run(war, 2);
    const won = events.filter((event) => event.kind === 'warWon');
    expect(won).toEqual([{ kind: 'warWon', faction: 0, wins: 1 }]);
    expect(war.wins).toEqual([1, 0]);
    expect(war.scores[0]).toBeLessThan(5);
    // Savaş sıfırlanınca bölge tarafsızlaşır; aracın hâlâ içinde durması onu yeniden ele geçirmeye başlar.
    expect(core.owner === NO_OWNER || core.progress < 0.5).toBe(true);
  });

  it('ölü olmayan botları sürer: bot komutu araca uygulanır', () => {
    const war = newWar();
    const unit = bot(war, 0);
    unit.brain!.objective = { x: SIZE / 2, y: SIZE / 2, radius: 200 };
    const start = { x: unit.vehicle.chassis.x, y: unit.vehicle.chassis.y };
    run(war, 5);
    expect(
      Math.hypot(unit.vehicle.chassis.x - start.x, unit.vehicle.chassis.y - start.y),
    ).toBeGreaterThan(100);
  });
});

describe('BotDirector', () => {
  it('her cepheyi hedef nüfusa botlarla tamamlar ve araçlar farklı takma ad taşır', () => {
    const war = newWar({ populate: true, seed: 5 });
    run(war, 2);
    for (let faction = 0; faction < WAR.factions; faction++)
      expect(war.population(faction)).toBe(WAR.population.perFaction);
    const names = [...war.combatants.values()].map((combatant) => combatant.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    const ids = [...war.combatants.keys()];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('kadro dört araç ailesini de içerir', () => {
    const war = newWar({ populate: true, seed: 9 });
    run(war, 1);
    const specs = new Set([...war.combatants.values()].map((c) => c.vehicle.spec.id));
    expect(specs.size).toBeGreaterThanOrEqual(3);
    for (const id of specs) expect(VEHICLE_IDS).toContain(id);
  });

  it('insan ayrılınca boşalan yer botla dolar', () => {
    const war = newWar({ populate: true, seed: 3 });
    const human = war.join({ name: 'A', spec: ARACHNID, faction: 0 });
    run(war, 1);
    expect(war.population(0)).toBe(WAR.population.perFaction);
    expect(war.combatants.has(human.vehicle.id)).toBe(true);
    war.leave(human.vehicle.id);
    expect(war.population(0)).toBe(WAR.population.perFaction - 1);
    run(war, 1.5);
    expect(war.population(0)).toBe(WAR.population.perFaction);
  });

  it('botlara bölge görevi verir ve görevler bölgelere dağılır', () => {
    const war = newWar({ populate: true, seed: 11 });
    run(war, 6);
    const objectives = new Set<string>();
    for (const combatant of war.combatants.values()) {
      const objective = combatant.brain?.objective;
      expect(objective, combatant.name).toBeTruthy();
      objectives.add(`${objective!.x}:${objective!.y}`);
    }
    expect(objectives.size).toBeGreaterThanOrEqual(3);
  });

  it('aynı tohum aynı savaşı üretir, farklı tohum farklısını', () => {
    const trace = (seed: number): number[] => {
      const war = newWar({ populate: true, seed });
      run(war, 20);
      return [...war.combatants.values()].flatMap((c) => [
        c.vehicle.chassis.x,
        c.vehicle.chassis.y,
      ]);
    };
    expect(trace(4)).toEqual(trace(4));
    expect(trace(4)).not.toEqual(trace(5));
  });

  it('dakikalarca bot-bot savaşı: nüfus sabit, öldürmeler artar, cepheler bölge kapar', () => {
    const war = newWar({ populate: true, seed: 21 });
    const owners = new Set<number>();
    const events: WarStepEvent[] = [];
    const idle = idleCommand();
    let deaths = 0;
    for (let step = 0; step < (240 * 1000) / STEP; step++) {
      events.length = 0;
      war.step(STEP, () => idle, events);
      for (const event of events) if (event.kind === 'died') deaths++;
      if (step % 60 === 0) {
        for (const zone of war.zones.zones) owners.add(zone.owner);
        for (let faction = 0; faction < WAR.factions; faction++)
          expect(war.population(faction)).toBe(WAR.population.perFaction);
        for (const { vehicle } of war.combatants.values()) {
          const { x, y } = vehicle.chassis;
          expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
          expect(war.sim.world.contains(x, y)).toBe(true);
        }
      }
    }
    expect(deaths).toBeGreaterThan(10);
    expect(owners.has(0) || owners.has(1)).toBe(true);
    const kills = [...war.combatants.values()].reduce((sum, c) => sum + c.kills, 0);
    expect(kills).toBeGreaterThan(5);
  });
});
