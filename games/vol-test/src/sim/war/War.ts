import { COMBAT } from '@/config/combat';
import type { VehicleSpec } from '@/config/vehicles';
import { WAR } from '@/config/war';
import { idleCommand, type TankCommand } from '../command';
import type { BotBrain } from '../ai/BotBrain';
import type { EntityId, Vehicle } from '../entities/Vehicle';
import type { SimEvent } from '../events';
import type { CommandSource, Simulation } from '../Simulation';
import { BotDirector } from './BotDirector';
import {
  baseCenter,
  chooseSpawn,
  spawnCandidates,
  type Point,
  type SpawnPoint,
} from './Deployment';
import type { WarEvent } from './events';
import { ZoneField } from './Zones';

/** Savaşa katılan bir araç: insan ya da bot. Skor tablosu ve cephe puanı buradan okunur. */
export interface Combatant {
  readonly vehicle: Vehicle;
  readonly faction: number;
  name: string;
  /** Botun beyni; insan için `null`. */
  readonly brain: BotBrain | null;
  kills: number;
  deaths: number;
  /** Botun komut arabelleği (her adım yeniden yazılır). */
  readonly command: TankCommand;
}

export interface WarOptions {
  /** Bot kadrosunu ve görev seçimini tohumlar. */
  readonly seed?: number;
  /** `false`: bot nüfusu kendiliğinden tutulmaz (testler botları elle ekler). */
  readonly populate?: boolean;
  /** Cephe başına hedef araç sayısı; verilmezse `WAR.population.perFaction`. */
  readonly perFaction?: number;
}

export interface JoinRequest {
  readonly name: string;
  readonly spec: VehicleSpec;
  /** İstenen cephe; dengeyi bozmayacaksa verilir. */
  readonly faction?: number;
}

/** Savaşın dışarıya bildirdiği olaylar: fizik olayları ve cephe olayları. */
export type WarStepEvent = SimEvent | WarEvent;

const IDLE = Object.freeze(idleCommand());

/**
 * Kalıcı savaş: iki cephe, ele geçirilen bölgeler, sürekli doğan araçlar ve bot nüfusu. Saf
 * benzetim kodudur; hem sunucu odası hem çevrimdışı alıştırma aynı savaşı sürer. İnsan araçların
 * komutunu çağıran verir, botlarınkini `BotBrain` üretir.
 *
 * Maç yoktur: ölen araç kendi üssünde yeniden doğar. Bir cephe hâkimiyet puanına ulaşınca savaş
 * kazanılır, puanlar ve bölgeler sıfırlanır, kazanma sayısı artar ve savaş aynı dünyada sürer.
 */
export class War {
  readonly zones: ZoneField;
  readonly combatants = new Map<EntityId, Combatant>();
  /** Cephe başına hâkimiyet puanı ve kazanılmış savaş sayısı. */
  readonly scores: number[] = [0, 0];
  readonly wins: number[] = [0, 0];
  private readonly director: BotDirector;
  private readonly candidates: SpawnPoint[][];
  private readonly drained: SimEvent[] = [];
  private readonly warEvents: WarEvent[] = [];
  private readonly holdings = [0, 0];
  private readonly populate: boolean;
  private clockMs = 0;
  private steps = 0;

  constructor(
    readonly sim: Simulation,
    options: WarOptions = {},
  ) {
    this.populate = options.populate ?? true;
    this.zones = new ZoneField(sim.world);
    this.candidates = Array.from({ length: WAR.factions }, (_, faction) =>
      spawnCandidates(sim.world, faction),
    );
    this.director = new BotDirector(options.seed ?? 1, options.perFaction);
  }

  /** Savaşın saati (ms): yalnız `step` ile ilerler. */
  get timeMs(): number {
    return this.clockMs;
  }

  /** Cephenin üssü. */
  base(faction: number): Point {
    return baseCenter(this.sim.world, faction);
  }

  /** Cephedeki araç sayısı (insan + bot). */
  population(faction: number): number {
    let count = 0;
    for (const combatant of this.combatants.values()) if (combatant.faction === faction) count++;
    return count;
  }

  /** Cephedeki insan sayısı. */
  humans(faction: number): number {
    let count = 0;
    for (const combatant of this.combatants.values())
      if (combatant.faction === faction && !combatant.brain) count++;
    return count;
  }

  /**
   * İnsan oyuncuyu bir cepheye alır. İstenen cephe, insan dengesini bozmayacaksa verilir; yoksa
   * insanı az olana, eşitse puanı düşük olana gidilir. Aracı üssünde doğurur, korur ve nüfusu
   * hedefte tutmak için fazla bir botu çıkarır.
   */
  join(request: JoinRequest): Combatant {
    const faction = this.pickFaction(request.faction);
    const combatant = this.enlist(request.name, request.spec, faction, null);
    this.director.trim(this, faction);
    return combatant;
  }

  /** Botu verilen cepheye ekler (yönetici ve testler kullanır). */
  addBot(
    name: string,
    spec: VehicleSpec,
    faction: number,
    makeBrain: (vehicle: Vehicle) => BotBrain,
  ): Combatant {
    return this.enlist(name, spec, faction, makeBrain);
  }

  /** Aracı savaştan çıkarır ve benzetimden söker. */
  leave(vehicleId: EntityId): Combatant | undefined {
    const combatant = this.combatants.get(vehicleId);
    if (!combatant) return undefined;
    this.combatants.delete(vehicleId);
    this.sim.despawn(vehicleId);
    return combatant;
  }

  /**
   * Bir sabit adım: botları ve insanları sürer, dünyayı ilerletir, ölümleri skorlar, bölgeleri
   * ve puanı ilerletir, nüfusu tutar. Üretilen olaylar `out`a eklenir.
   */
  step(stepMs: number, humanCommand: CommandSource, out: WarStepEvent[]): void {
    this.clockMs += stepMs;
    this.steps++;
    this.prepareRespawns(stepMs);
    this.sim.step((vehicle) => this.commandFor(vehicle, stepMs, humanCommand), stepMs);

    this.drained.length = 0;
    for (const event of this.sim.drainEvents(this.drained)) {
      out.push(event);
      if (event.kind === 'died') this.scoreDeath(event.target, event.source);
    }

    this.warEvents.length = 0;
    this.zones.step(stepMs, this.sim.vehicles, this.warEvents);
    this.zones.holdings(this.holdings);
    for (let faction = 0; faction < WAR.factions; faction++)
      this.scores[faction] += this.holdings[faction] * WAR.score.zonePerSecond * (stepMs / 1000);
    this.checkDominance();
    for (const event of this.warEvents) out.push(event);

    if (this.populate) this.director.review(this);
  }

  /** Eşiğe ulaşan cephe savaşı kazanır; puanlar ve bölgeler sıfırlanır, savaş sürer. */
  private checkDominance(): void {
    for (let faction = 0; faction < WAR.factions; faction++) {
      if (this.scores[faction] < WAR.score.dominance) continue;
      this.wins[faction]++;
      this.warEvents.push({ kind: 'warWon', faction, wins: this.wins[faction] });
      this.scores.fill(0);
      this.zones.reset();
      return;
    }
  }

  private commandFor(vehicle: Vehicle, stepMs: number, humanCommand: CommandSource): TankCommand {
    const combatant = this.combatants.get(vehicle.id);
    if (!combatant) return IDLE;
    return combatant.brain
      ? combatant.brain.think(this.sim, stepMs, combatant.command)
      : humanCommand(vehicle);
  }

  private enlist(
    name: string,
    spec: VehicleSpec,
    faction: number,
    makeBrain: ((vehicle: Vehicle) => BotBrain) | null,
  ): Combatant {
    const point = this.spawnPoint(faction, 0);
    const vehicle = this.sim.spawn(point.x, point.y, point.hull, faction, undefined, spec);
    vehicle.vitality.protectionRemainingMs = COMBAT.respawnProtectionMs;
    const combatant: Combatant = {
      vehicle,
      faction,
      name,
      brain: makeBrain ? makeBrain(vehicle) : null,
      kills: 0,
      deaths: 0,
      command: idleCommand(),
    };
    this.combatants.set(vehicle.id, combatant);
    return combatant;
  }

  private pickFaction(preferred: number | undefined): number {
    const humans = [this.humans(0), this.humans(1)];
    if (
      preferred !== undefined &&
      Number.isInteger(preferred) &&
      preferred >= 0 &&
      preferred < WAR.factions &&
      humans[preferred] <= humans[1 - preferred]
    )
      return preferred;
    if (humans[0] !== humans[1]) return humans[0] < humans[1] ? 0 : 1;
    if (this.scores[0] !== this.scores[1]) return this.scores[0] < this.scores[1] ? 0 : 1;
    return this.population(0) <= this.population(1) ? 0 : 1;
  }

  /** Cephenin üssünde, canlı araçlardan en uzak doğma noktası. */
  private spawnPoint(faction: number, exceptId: EntityId): SpawnPoint {
    const threats: Point[] = [];
    for (const vehicle of this.sim.vehicles)
      if (vehicle.id !== exceptId && vehicle.vitality.alive) threats.push(vehicle.chassis);
    return chooseSpawn(this.candidates[faction], threats, this.steps + exceptId);
  }

  /**
   * Doğmak üzere olan ölü aracın doğma noktasını, doğmadan hemen önceki adımda en boş noktaya
   * kaydırır: doğma anındaki düşman konumları ölüm anındakinden farklıdır.
   */
  private prepareRespawns(stepMs: number): void {
    for (const { vehicle, faction } of this.combatants.values()) {
      if (vehicle.vitality.alive || vehicle.vitality.respawnRemainingMs > stepMs * 1.5) continue;
      Object.assign(vehicle.spawnPoint, this.spawnPoint(faction, vehicle.id));
    }
  }

  private scoreDeath(targetId: EntityId, sourceId: EntityId | undefined): void {
    const victim = this.combatants.get(targetId);
    if (!victim) return;
    victim.deaths++;
    if (sourceId === undefined || sourceId === targetId) return;
    const killer = this.combatants.get(sourceId);
    if (!killer || killer.faction === victim.faction) return;
    killer.kills++;
    this.scores[killer.faction] += WAR.score.perKill;
  }
}
