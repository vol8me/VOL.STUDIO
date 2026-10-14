import { Room, type Client } from '@colyseus/core';
import {
  Ring,
  SlowConsumerWatch,
  authenticateJoin,
  clientTraffic,
  errorData,
  evictSlowConsumers,
  rejectJoin,
  runRoomLoop,
  uniqueName,
  type AuthenticatedJoin,
  type Logger,
} from '@volstudio/network/server';
import { GAME } from '../src/config/game';
import { NETWORK } from '../src/config/network';
import { STRIKER, modelOf, vehicleAt, type VehicleSpec } from '../src/config/vehicles';
import { WAR } from '../src/config/war';
import { writeChassisState } from '../src/network/chassisSync';
import { EVENT_MESSAGE, type EventBatch, type NetEvent } from '../src/network/events';
import {
  FactionState,
  INPUT_RANGES,
  PlayerState,
  TankInput,
  WorldState,
  ZoneState,
  toCommand,
  type PlayerSnapshot,
} from '../src/network/schema';
import { createChassisState } from '../src/sim/chassis/ChassisState';
import { idleCommand, type TankCommand } from '../src/sim/command';
import type { EntityId, Vehicle } from '../src/sim/entities/Vehicle';
import { Simulation } from '../src/sim/Simulation';
import { War, type Combatant, type WarStepEvent } from '../src/sim/war/War';
import { createBattleWorld } from '../src/sim/world/battleWorld';
import { InputPacer, type PacerStats } from './InputPacer';

/** Oda oluşturma seçenekleri; `logger` süreç içi bir bağdır, ağdan gelmez. */
export interface WorldRoomOptions {
  readonly logger?: Logger;
  /**
   * Birincil dünya: insan kalmasa da kapanmaz. Taşma dünyaları son insan ayrılınca kapanır.
   * Süreç içi bir karardır, istemci seçeneğinden okunmaz.
   */
  readonly primary?: boolean;
  /** Bot kadrosunu ve görev seçimini tohumlar. */
  readonly seed?: number;
  /** Cephe başına hedef araç sayısı (testler ve işletim); verilmezse `WAR.population.perFaction`. */
  readonly perFaction?: number;
}

interface Slot {
  readonly sessionId: string;
  readonly combatant: Combatant;
  readonly state: PlayerSnapshot;
  pacer: InputPacer<TankCommand>;
}

const IDLE = Object.freeze(idleCommand());

/** Doğrulanmış katılım: ağ ortak alanları, seçilen araç ve istenen cephe. */
interface WarJoin extends AuthenticatedJoin {
  readonly spec: VehicleSpec;
  readonly faction: number | undefined;
}

/**
 * Katılım seçeneğindeki `model` (`VEHICLE_IDS` indeksi). Yoksa Striker; tamsayı olmayan ya da
 * tanımsız indeks protokol ihlalidir ve reddedilir: sunucu bilinmeyen aracı sessizce başkasıyla
 * değiştirmez.
 */
function chooseVehicle(options: unknown): VehicleSpec {
  const model = (options as { model?: unknown } | null)?.model;
  if (model === undefined) return STRIKER;
  const spec = typeof model === 'number' ? vehicleAt(model) : undefined;
  if (!spec) throw rejectJoin('protocol');
  return spec;
}

/**
 * Katılım seçeneğindeki `faction` (cephe indeksi). Yoksa sunucu dengeye göre seçer; tamsayı olmayan
 * ya da aralık dışı değer protokol ihlalidir. İstenen cephe dengeyi bozacaksa sunucu yine kendi
 * seçimini yapar (`War.join`), ret değildir.
 */
function chooseFaction(options: unknown): number | undefined {
  const faction = (options as { faction?: unknown } | null)?.faction;
  if (faction === undefined) return undefined;
  if (typeof faction !== 'number' || !Number.isInteger(faction)) throw rejectJoin('protocol');
  if (faction < 0 || faction >= WAR.factions) throw rejectJoin('protocol');
  return faction;
}

/**
 * Kalıcı savaş dünyası: tek yetkili oda, sunucu açıldığı sürece sürer. İstemci yalnız niyet
 * (`TankInput`) yollar; poz, hasar, skor, bölge ve ateş sonucu sunucudadır. Savaşın kendisi saf
 * `War` nesnesindedir (bölgeler, doğma, bot nüfusu); oda yalnız ağ yaşamını (katılım, girdi
 * tamponu, durum yayını, olay dağıtımı) taşır. Girdiler Colyseus'un yerel girdi tamponundan adım
 * başına birer tane tüketilir ve tüketilen sayı onay olarak istemciye döner; istemci öngörüsü
 * bu onaya göre yeniden oynatır.
 */
export class WorldRoom extends Room {
  override maxClients: number = NETWORK.maxPlayers;
  override maxMessagesPerSecond = NETWORK.maxMessagesPerSecond;
  override state = new WorldState();

  private readonly sim = new Simulation({
    world: createBattleWorld(),
    vehicle: STRIKER,
    spawnPlayer: false,
  });
  private war!: War;
  private readonly players = new Map<string, Slot>();
  private readonly byVehicle = new Map<EntityId, Slot>();
  /** Botların oyuncu kaydı; anahtar `bot:<araç>`. */
  private readonly botStates = new Map<EntityId, PlayerSnapshot>();
  private readonly commands = new Map<EntityId, TankCommand>();
  private readonly scratch = createChassisState();
  private readonly events: WarStepEvent[] = [];
  private readonly stepTimes = new Ring(300);
  private pending: NetEvent[] = [];
  private log: Logger | undefined;
  private faults = 0;
  private readonly slow = new SlowConsumerWatch({
    limitBytes: NETWORK.slowConsumer.limitBytes,
    graceMs: NETWORK.slowConsumer.graceMs,
  });
  private evictions = 0;

  override readonly inputs = this.defineInput(TankInput, {
    sanitize: INPUT_RANGES,
    bufferMaxSize: NETWORK.inputBuffer,
    // Colyseus bunu kendi zamanlayıcısından türetirdi (10 ms'lik pompa → 100 Hz); öngörü 60 Hz ister.
    tickRate: NETWORK.tickRate,
  });

  override onCreate(options: WorldRoomOptions = {}): void {
    this.log = options.logger?.child(`room:${this.roomId}`);
    this.autoDispose = options.primary !== true;
    this.war = new War(this.sim, {
      seed: options.seed ?? 1,
      perFaction: options.perFaction,
    });
    for (let index = 0; index < this.war.zones.zones.length; index++)
      this.state.zones.push(new ZoneState());
    for (let faction = 0; faction < WAR.factions; faction++)
      this.state.factions.push(new FactionState());
    this.setPatchRate(NETWORK.patchRateMs);
    runRoomLoop(this, NETWORK.tickRate, () => this.guardedAdvance());
    this.clock.setInterval(() => this.sweepSlowClients(), NETWORK.slowConsumer.sweepMs);
    this.log?.log('info', 'room.create', {
      room: this.roomName,
      primary: options.primary === true,
      perFaction: options.perFaction ?? WAR.population.perFaction,
    });
  }

  override onAuth(_client: Client, options: unknown): WarJoin {
    const join = authenticateJoin(options);
    return { ...join, spec: chooseVehicle(options), faction: chooseFaction(options) };
  }

  override onJoin(client: Client, _options: unknown, auth: WarJoin): void {
    const name = uniqueName(
      auth.name ?? `${NETWORK.fallbackName} ${this.players.size + 1}`,
      this.names(),
    );
    const combatant = this.war.join({ name, spec: auth.spec, faction: auth.faction });
    const { vehicle } = combatant;
    const state = new PlayerState();
    state.vehicleId = vehicle.id;
    state.model = modelOf(auth.spec);
    state.name = name;
    state.team = combatant.faction;
    state.connected = true;
    const slot: Slot = { sessionId: client.sessionId, combatant, state, pacer: this.newPacer() };
    this.syncPlayer(state, combatant);
    this.players.set(client.sessionId, slot);
    this.byVehicle.set(vehicle.id, slot);
    this.state.players.set(client.sessionId, state);
    this.pending.push({ kind: 'joined', vehicleId: vehicle.id, name });
    this.log?.log('info', 'player.join', {
      session: client.sessionId,
      vehicle: vehicle.id,
      name,
      faction: combatant.faction,
      humans: this.players.size,
    });
  }

  /** Bağlantı koptu: araç kısa süre yerinde bekler (girdi boşta), süre dolarsa `onLeave` çalışır. */
  override onDrop(client: Client): void {
    const slot = this.players.get(client.sessionId);
    if (slot) slot.state.connected = false;
    this.log?.log('info', 'player.drop', { session: client.sessionId });
    // Sonucu çekirdek `onReconnect`/`onLeave` ile bildirir; oda kapanırken reddedilen söz
    // ("disposing") dinleyicisiz kalıp süreci düşürmesin diye yutulur.
    this.allowReconnection(client, NETWORK.reconnectSeconds).catch(() => undefined);
  }

  override onReconnect(client: Client): void {
    const slot = this.players.get(client.sessionId);
    if (slot) {
      slot.state.connected = true;
      // Sunucu yeniden bağlanana yeni girdi tamponu verir ve istemci sayacı sıfırlar: eski
      // tüketim durumu ilk adımlarda yanlış girdiyi tutardı.
      slot.pacer = this.newPacer();
    }
    this.log?.log('info', 'player.reconnect', { session: client.sessionId });
  }

  override onLeave(client: Client, code?: number): void {
    this.slow.forget(client.sessionId);
    const slot = this.players.get(client.sessionId);
    if (!slot) return;
    this.players.delete(client.sessionId);
    this.byVehicle.delete(slot.combatant.vehicle.id);
    this.commands.delete(slot.combatant.vehicle.id);
    this.state.players.delete(client.sessionId);
    this.war.leave(slot.combatant.vehicle.id);
    this.pending.push({
      kind: 'left',
      vehicleId: slot.combatant.vehicle.id,
      name: slot.state.name,
    });
    this.log?.log('info', 'player.leave', {
      session: client.sessionId,
      name: slot.state.name,
      code,
      humans: this.players.size,
    });
  }

  override onDispose(): void {
    this.log?.log('info', 'room.dispose', { room: this.roomName, tick: this.state.tick });
  }

  /**
   * Beklenmeyen hata odanın döngüsünü öldürmesin: günlüğe yazılır, döngü sürer. Kalıcı bir hata
   * saniyede 60 satır üretmesin diye ilki ve sonra her 600. hata yazılır.
   */
  private guardedAdvance(): void {
    try {
      this.advance();
    } catch (error) {
      if (this.faults++ % 600 === 0)
        this.log?.log('error', 'room.step.failed', { ...errorData(error), faults: this.faults });
    }
  }

  /** Bir sabit adım: girdileri tüket, savaşı ilerlet, durumu yaz, olayları yay. */
  private advance(): void {
    const startedAt = performance.now();
    const stepMs = GAME.simulationStepMs;
    this.commands.clear();
    for (const [sessionId, slot] of this.players)
      this.commands.set(slot.combatant.vehicle.id, this.nextCommand(sessionId, slot));

    this.events.length = 0;
    this.war.step(stepMs, (vehicle) => this.commands.get(vehicle.id) ?? IDLE, this.events);
    for (const event of this.events) this.pending.push(event);

    this.state.tick++;
    this.state.timeMs += stepMs;
    this.syncRoster();
    this.syncFront();
    if (this.pending.length > 0) {
      const batch: EventBatch = { t: this.state.timeMs, events: this.pending };
      this.broadcast(EVENT_MESSAGE, batch);
      this.pending = [];
    }
    this.stepTimes.push(performance.now() - startedAt);
  }

  /** Bu adımda aracın süreceği komut; tüketim ve boşta adım kuralı `InputPacer`dadır. */
  private nextCommand(sessionId: string, slot: Slot): TankCommand {
    return slot.pacer.pull(
      this.inputs.get(sessionId),
      toCommand,
      (last) => ({ ...last, fire: false }),
      IDLE,
      this.state.tick,
    );
  }

  private newPacer(): InputPacer<TankCommand> {
    return new InputPacer(NETWORK.inputLead, NETWORK.inputHoldSteps);
  }

  /** İnsan ve bot kayıtlarını savaşın güncel durumuna eşler; kalkan botların kaydı silinir. */
  private syncRoster(): void {
    for (const slot of this.players.values()) this.syncPlayer(slot.state, slot.combatant);
    const live = new Set<EntityId>();
    for (const combatant of this.war.combatants.values()) {
      if (!combatant.brain) continue;
      const id = combatant.vehicle.id;
      live.add(id);
      let state = this.botStates.get(id);
      if (!state) {
        state = new PlayerState();
        state.vehicleId = id;
        state.model = modelOf(combatant.vehicle.spec);
        state.name = combatant.name;
        state.team = combatant.faction;
        state.bot = true;
        state.connected = true;
        this.botStates.set(id, state);
        this.state.players.set(`bot:${id}`, state);
      }
      this.syncPlayer(state, combatant);
    }
    for (const id of [...this.botStates.keys()]) {
      if (live.has(id)) continue;
      this.botStates.delete(id);
      this.state.players.delete(`bot:${id}`);
    }
  }

  private syncPlayer(state: PlayerSnapshot, combatant: Combatant): void {
    const { vehicle } = combatant;
    writeChassisState(state, vehicle.chassis.captureState(this.scratch));
    state.health = vehicle.vitality.health;
    state.alive = vehicle.vitality.alive;
    state.respawnMs = vehicle.vitality.respawnRemainingMs;
    state.protectionMs = vehicle.vitality.protectionRemainingMs;
    state.gunMs = vehicle.gun.getRemaining();
    state.salvo = vehicle.salvo;
    state.kills = combatant.kills;
    state.deaths = combatant.deaths;
  }

  /** Bölgeleri ve cephe sayaçlarını yayın durumuna yazar. */
  private syncFront(): void {
    const zones = this.war.zones.zones;
    for (let index = 0; index < zones.length; index++) {
      const zone = zones[index];
      const state = this.state.zones[index];
      state.progress = zone.progress;
      state.owner = zone.owner;
      state.contested = zone.contested;
      state.presentFirst = zone.presence[0];
      state.presentSecond = zone.presence[1];
    }
    const held = this.war.zones.holdings();
    for (let faction = 0; faction < WAR.factions; faction++) {
      const state = this.state.factions[faction];
      state.score = this.war.scores[faction];
      state.wins = this.war.wins[faction];
      state.zones = held[faction];
      state.vehicles = this.war.population(faction);
      state.humans = this.war.humans(faction);
    }
  }

  private names(): string[] {
    return Array.from(this.war.combatants.values(), (combatant) => combatant.name);
  }

  /** Sunucu içi gözlem ve test erişimi; ağ üzerinden görünmez. */
  vehicleOf(sessionId: string): Vehicle | undefined {
    return this.players.get(sessionId)?.combatant.vehicle;
  }

  /** Yetkili savaş; test ve işletim gözlemi içindir, ağ üzerinden görünmez. */
  get battle(): War {
    return this.war;
  }

  /** Yetkili simülasyon; test ve işletim gözlemi içindir, ağ üzerinden görünmez. */
  get simulation(): Simulation {
    return this.sim;
  }

  /** Oyuncu başına girdi sayaçları (ölçüm ve test). */
  inputStats(sessionId: string): PacerStats | undefined {
    return this.players.get(sessionId)?.pacer.stats;
  }

  /** Bağlı insan sayısı (botlar hariç). */
  get playerCount(): number {
    return this.players.size;
  }

  /** Yazma kuyruğu sınırı aşıp tolerans süresini dolduran istemcileri atar. */
  private sweepSlowClients(): void {
    for (const session of evictSlowConsumers(this.clients, this.slow, performance.now())) {
      this.evictions++;
      this.log?.log('warn', 'player.slow', {
        session,
        limitBytes: NETWORK.slowConsumer.limitBytes,
      });
    }
  }

  /** İstemcilerin toplam trafiği ve atılan yavaş tüketici sayısı; `/metrics` bunu okur. */
  trafficSummary(): {
    clients: number;
    bufferedBytes: number;
    bufferedMaxBytes: number;
    sentBytes: number;
    receivedBytes: number;
    evictions: number;
  } {
    let bufferedBytes = 0;
    let bufferedMaxBytes = 0;
    let sentBytes = 0;
    let receivedBytes = 0;
    for (const client of this.clients) {
      const traffic = clientTraffic(client);
      bufferedBytes += traffic.bufferedBytes;
      bufferedMaxBytes = Math.max(bufferedMaxBytes, traffic.bufferedBytes);
      sentBytes += traffic.sentBytes;
      receivedBytes += traffic.receivedBytes;
    }
    return {
      clients: this.clients.length,
      bufferedBytes,
      bufferedMaxBytes,
      sentBytes,
      receivedBytes,
      evictions: this.evictions,
    };
  }

  /** Adım süresi özeti (ms); `/metrics` bunu okur. */
  stepSummary(): { count: number; mean: number; p95: number; max: number } {
    return {
      count: this.stepTimes.count,
      mean: this.stepTimes.mean,
      p95: this.stepTimes.percentile(0.95),
      max: this.stepTimes.percentile(1),
    };
  }
}
