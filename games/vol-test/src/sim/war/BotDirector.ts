import { lerp } from '@volstudio/core/math/interpolation';
import { createStatefulRandom, WeightedPicker, type StatefulRandom } from '@volstudio/core/random';
import { VEHICLE_IDS, VEHICLES, type VehicleSpec } from '@/config/vehicles';
import { WAR } from '@/config/war';
import { BotBrain } from '../ai/BotBrain';
import type { EntityId } from '../entities/Vehicle';
import type { Combatant, War } from './War';
import { NO_OWNER, type Zone } from './Zones';

interface Assignment {
  zone: number;
  /** Bu çağrıdan önce görev yeniden değerlendirilmez (savaş saati, ms). */
  nextAtMs: number;
}

/**
 * Bot nüfusunun ve görevlerinin yöneticisi. Her cephe hedef sayıya (`population.perFaction`)
 * botlarla tamamlanır; insan girince fazla bot çıkar, insan gidince yeni bot gelir. Her bot
 * bir bölgeye görevlendirilir: tartışmalı bölge en çekici, savunulan sakin bölge en az çekicidir;
 * yakınlık çekiciliği artırır, aynı bölgedeki kalabalık azaltır. Karar seçimi tohumludur.
 */
export class BotDirector {
  private readonly random: StatefulRandom;
  private readonly roster: WeightedPicker<VehicleSpec>;
  private readonly assignments = new Map<EntityId, Assignment>();
  private readonly callsigns: string[];
  private cursor = 0;
  private reviewAtMs = 0;

  constructor(
    seed: number,
    private readonly perFaction: number = WAR.population.perFaction,
  ) {
    this.random = createStatefulRandom(seed);
    this.roster = new WeightedPicker(
      VEHICLE_IDS.map((id) => ({
        value: VEHICLES[id],
        weight: WAR.population.roster[id],
      })),
    );
    // Takma adlar tohumla karıştırılır: aynı tohum aynı sırayı, farklı tohum başka sırayı verir.
    this.callsigns = [...WAR.callsigns];
    for (let index = this.callsigns.length - 1; index > 0; index--) {
      const pick = Math.floor(this.random.next() * (index + 1));
      [this.callsigns[index], this.callsigns[pick]] = [this.callsigns[pick], this.callsigns[index]];
    }
  }

  /** Nüfusu hedefe getirir ve botlara görev verir; aralık dolmadıysa bir şey yapmaz. */
  review(war: War, force = false): void {
    if (!force && war.timeMs < this.reviewAtMs) return;
    this.reviewAtMs = war.timeMs + WAR.population.reviewMs;
    for (let faction = 0; faction < WAR.factions; faction++) {
      this.trim(war, faction);
      while (war.population(faction) < this.perFaction) this.spawnBot(war, faction);
    }
    this.assign(war);
  }

  /** Cephedeki fazla botları çıkarır: ölü botlar önce, yoksa insanlardan en uzaktaki bot gider. */
  trim(war: War, faction: number): void {
    while (war.population(faction) > this.perFaction) {
      const victim = this.removable(war, faction);
      if (!victim) return;
      this.assignments.delete(victim.vehicle.id);
      war.leave(victim.vehicle.id);
    }
  }

  private removable(war: War, faction: number): Combatant | undefined {
    let chosen: Combatant | undefined;
    let chosenScore = -Infinity;
    for (const combatant of war.combatants.values()) {
      if (combatant.faction !== faction || !combatant.brain) continue;
      const { vehicle } = combatant;
      let nearest = Infinity;
      for (const other of war.combatants.values()) {
        if (other.brain) continue;
        nearest = Math.min(
          nearest,
          Math.hypot(
            other.vehicle.chassis.x - vehicle.chassis.x,
            other.vehicle.chassis.y - vehicle.chassis.y,
          ),
        );
      }
      // Ölü bot hiçbir oyuncunun gözünden kaybolmaz; bu yüzden en yüksek puanı alır.
      const score = vehicle.vitality.alive ? nearest : Number.MAX_VALUE;
      if (score > chosenScore) {
        chosenScore = score;
        chosen = combatant;
      }
    }
    return chosen;
  }

  private spawnBot(war: War, faction: number): void {
    const spec = this.roster.pick(this.random) ?? VEHICLES.striker;
    const { min, max } = WAR.population.skill;
    const skill = lerp(min, max, this.random.next());
    const seed = Math.floor(this.random.next() * 0xffffffff);
    const retreat = war.base(faction);
    const combatant = war.addBot(this.callsign(war), spec, faction, (vehicle) => {
      const brain = new BotBrain(vehicle, { seed, skill });
      brain.retreatPoint = retreat;
      return brain;
    });
    this.assignments.set(combatant.vehicle.id, { zone: -1, nextAtMs: 0 });
  }

  /** Kullanımda olmayan bir takma ad; havuz bitince sayıyla ayırt edilir. */
  private callsign(war: War): string {
    const used = new Set<string>();
    for (const combatant of war.combatants.values()) used.add(combatant.name.toLowerCase());
    for (let tries = 0; tries < this.callsigns.length; tries++) {
      const candidate = this.callsigns[this.cursor++ % this.callsigns.length];
      if (!used.has(candidate.toLowerCase())) return candidate;
    }
    const base = this.callsigns[this.cursor++ % this.callsigns.length];
    for (let suffix = 2; ; suffix++) {
      const candidate = `${base} ${suffix}`;
      if (!used.has(candidate.toLowerCase())) return candidate;
    }
  }

  /** Süresi dolan botlara en çekici bölgeyi görev olarak verir. */
  private assign(war: War): void {
    const crowd = new Map<string, number>();
    const crowdKey = (faction: number, zone: number): string => `${faction}:${zone}`;
    for (const combatant of war.combatants.values()) {
      const entry = this.assignments.get(combatant.vehicle.id);
      if (!combatant.brain || !entry || entry.zone < 0) continue;
      const key = crowdKey(combatant.faction, entry.zone);
      crowd.set(key, (crowd.get(key) ?? 0) + 1);
    }
    for (const combatant of war.combatants.values()) {
      const brain = combatant.brain;
      const entry = this.assignments.get(combatant.vehicle.id);
      if (!brain || !entry || war.timeMs < entry.nextAtMs) continue;
      entry.nextAtMs =
        war.timeMs +
        WAR.population.reassignMs +
        this.random.next() * WAR.population.reassignJitterMs;
      if (entry.zone >= 0) {
        const key = crowdKey(combatant.faction, entry.zone);
        crowd.set(key, (crowd.get(key) ?? 1) - 1);
      }
      const zone = this.choose(war, combatant, entry.zone, crowd);
      entry.zone = zone.index;
      const key = crowdKey(combatant.faction, zone.index);
      crowd.set(key, (crowd.get(key) ?? 0) + 1);
      brain.objective = {
        x: zone.x,
        y: zone.y,
        radius: zone.radius * 0.9,
        leash: zone.radius * WAR.objective.leashRadii,
      };
    }
  }

  private choose(
    war: War,
    combatant: Combatant,
    current: number,
    crowd: ReadonlyMap<string, number>,
  ): Zone {
    const zones = war.zones.zones;
    const { x, y } = combatant.vehicle.chassis;
    let best = zones[0];
    let bestScore = -Infinity;
    let currentScore = -Infinity;
    for (const zone of zones) {
      const score = this.appeal(zone, combatant.faction, Math.hypot(zone.x - x, zone.y - y), crowd);
      if (zone.index === current) currentScore = score;
      if (score > bestScore) {
        bestScore = score;
        best = zone;
      }
    }
    // Eski görevden vazgeçmek için yenisi belirgin biçimde daha iyi olmalı: botlar gidip gelmez.
    if (current >= 0 && currentScore * WAR.objective.hysteresis >= bestScore) return zones[current];
    return best;
  }

  private appeal(
    zone: Zone,
    faction: number,
    distance: number,
    crowd: ReadonlyMap<string, number>,
  ): number {
    const { owned, contested, hostile, crowding, halfDistance } = WAR.objective;
    let weight: number = hostile;
    if (zone.contested) weight = contested;
    else if (zone.owner === faction) weight = owned;
    else if (zone.owner === NO_OWNER) weight = hostile;
    const near = halfDistance / (halfDistance + distance);
    const others = crowd.get(`${faction}:${zone.index}`) ?? 0;
    return (weight * near) / (1 + others * crowding);
  }
}
