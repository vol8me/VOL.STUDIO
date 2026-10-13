import { Room, matchMaker, type Client } from '@colyseus/core';
import { normalizeRoomCode, type JoinRejection } from '@volstudio/network/protocol';
import {
  Ring,
  authenticateJoin,
  errorData,
  rejectJoin,
  runRoomLoop,
  uniqueName,
  type AuthenticatedJoin,
  type Logger,
} from '@volstudio/network/server';
import { COMBAT } from '../src/config/combat';
import { GAME } from '../src/config/game';
import { MATCH, NETWORK, type MatchConfig } from '../src/config/network';
import { SUSPENSION, TANK, WEAPON } from '../src/config/tank';
import { WORLD } from '../src/config/world';
import { EVENT_MESSAGE, type EventBatch, type NetEvent } from '../src/network/events';
import { ROOM } from '../src/network/rooms';
import {
  INPUT_RANGES,
  MatchState,
  NO_TEAM,
  PlayerState,
  TankInput,
  isMatchMode,
  toCommand,
  type MatchMode,
  type PlayerSnapshot,
} from '../src/network/schema';
import { writeTankState } from '../src/network/tankSync';
import { idleCommand, type TankCommand } from '../src/sim/command';
import type { Vehicle } from '../src/sim/entities/Vehicle';
import type { SimEvent } from '../src/sim/events';
import { Simulation } from '../src/sim/Simulation';
import { createTankState } from '../src/sim/tank/TankState';
import { World } from '../src/sim/world/World';
import { InputPacer, type PacerStats } from './InputPacer';
import { MatchRules } from './MatchRules';
import { chooseSeat, seatPoint, seatsFor } from './Seats';

/** Oda oluşturma seçenekleri; `logger` süreç içi bir bağdır, ağdan gelmez. */
export interface MatchRoomOptions {
  readonly mode?: unknown;
  readonly code?: unknown;
  readonly logger?: Logger;
  /** Sunucunun sahiplenilmiş özel oda kodları; eşzamanlı iki kuruluşu sorgudan önce eler. */
  readonly claims?: Set<string>;
}

interface Slot {
  readonly sessionId: string;
  readonly state: PlayerSnapshot;
  readonly vehicle: Vehicle;
  pacer: InputPacer<TankCommand>;
}

const IDLE = Object.freeze(idleCommand());

/**
 * Oyun odası: tek yetkili dünya. İstemci yalnız niyet (`TankInput`) yollar; poz, hasar, skor ve
 * ateş sonucu sunucudadır. Girdiler Colyseus'un yerel girdi tamponundan adım başına birer tane
 * tüketilir ve tüketilen sayı onay olarak istemciye döner; istemci öngörüsü bu onaya göre yeniden
 * oynatır.
 */
export class MatchRoom extends Room {
  override maxClients: number = NETWORK.maxPlayers;
  override maxMessagesPerSecond = NETWORK.maxMessagesPerSecond;
  override state = new MatchState();

  /** Maç kuralları; testler ve işletim kısa maç için alt sınıfta değiştirir, ağdan değiştirilemez. */
  protected readonly config: MatchConfig = MATCH;

  /** Özel oda mı: katılım kodu yoksa ya da yanlışsa kimse giremez. */
  protected get privateRoom(): boolean {
    return false;
  }

  private readonly sim = new Simulation({
    world: new World(WORLD.width, WORLD.height, WORLD.gridStep),
    tank: TANK,
    suspension: SUSPENSION,
    weapon: WEAPON,
    spawnPlayer: false,
  });
  private readonly players = new Map<string, Slot>();
  private readonly byVehicle = new Map<number, Slot>();
  private readonly commands = new Map<number, TankCommand>();
  private readonly scratch = createTankState();
  private readonly drained: SimEvent[] = [];
  private readonly stepTimes = new Ring(300);
  private rules = new MatchRules('ffa', MATCH.scoreLimit.ffa, MATCH.intermissionMs);
  private pending: NetEvent[] = [];
  private log: Logger | undefined;
  private claims: Set<string> | undefined;
  private code = '';
  private rejection: JoinRejection | null = null;
  private faults = 0;

  override readonly inputs = this.defineInput(TankInput, {
    sanitize: INPUT_RANGES,
    bufferMaxSize: NETWORK.inputBuffer,
    // Colyseus bunu kendi zamanlayıcısından türetirdi (10 ms'lik pompa → 100 Hz); öngörü 60 Hz ister.
    tickRate: NETWORK.tickRate,
  });

  override async onCreate(options: MatchRoomOptions = {}): Promise<void> {
    const mode: MatchMode = isMatchMode(options.mode) ? options.mode : 'ffa';
    this.rules = new MatchRules(mode, this.config.scoreLimit[mode], this.config.intermissionMs);
    this.log = options.logger?.child(`room:${this.roomId}`);
    this.claims = options.claims;
    if (this.privateRoom) await this.claimCode(options.code);
    this.state.mode = mode;
    this.state.phase = this.rules.phase;
    this.state.scoreLimit = this.rules.scoreLimit;
    this.state.code = this.code;
    this.setPatchRate(NETWORK.patchRateMs);
    runRoomLoop(this, NETWORK.tickRate, () => this.guardedAdvance());
    this.log?.log('info', 'room.create', {
      room: this.roomName,
      mode,
      code: this.code || undefined,
    });
  }

  /**
   * Özel oda kodunu sahiplenir. Eşleştirici katılım kodunu yaratıcının gönderdiği ham değerle
   * karşılaştırır: kurala uymayan ya da büyük harfe çevrilmemiş kod, katılımcıların bulamayacağı
   * bir oda yaratırdı. Ret `onCreate`te fırlatılmaz (Colyseus bu hatayı HTTP durumuna çevirir ve
   * geçersiz durum kodu 500'e düşer); oda kilitlenir ve yaratıcının `onAuth`unda reddedilir.
   */
  private async claimCode(value: unknown): Promise<void> {
    const code = normalizeRoomCode(value);
    if (code !== null && code === value && !this.claims?.has(code)) {
      this.claims?.add(code);
      const rooms = await matchMaker.query({ name: ROOM.private });
      if (
        !rooms.some(
          (room) =>
            room.roomId !== this.roomId &&
            (room.metadata as { code?: unknown } | undefined)?.code === code,
        )
      ) {
        this.code = code;
        return;
      }
      this.claims?.delete(code);
    }
    this.rejection = 'code';
    // Eşleştirme listesine kopyalanan kod gerçek odayla karışmasın.
    await this.setMetadata({ code: '' });
    await this.lock();
  }

  override onAuth(_client: Client, options: unknown): AuthenticatedJoin {
    if (this.rejection) throw rejectJoin(this.rejection);
    const join = authenticateJoin(options);
    if (this.privateRoom && join.code !== this.code) throw rejectJoin('code');
    return join;
  }

  override onJoin(client: Client, _options: unknown, auth: AuthenticatedJoin): void {
    const team = this.rules.mode === 'teams' ? this.smallerTeam() : NO_TEAM;
    const center = this.sim.world.center;
    const seat = chooseSeat(
      seatsFor(team === NO_TEAM ? null : team, NETWORK.maxPlayers, MATCH.teams),
      NETWORK.maxPlayers,
      center,
      this.threats(),
    );
    const point = seatPoint(seat, NETWORK.maxPlayers, center);
    const vehicle = this.sim.spawn(point.x, point.y, point.hull, team === NO_TEAM ? null : team);
    vehicle.vitality.protectionRemainingMs = COMBAT.respawnProtectionMs;
    const name = uniqueName(auth.name ?? `${NETWORK.fallbackName} ${vehicle.id}`, this.names());
    const state = new PlayerState();
    state.vehicleId = vehicle.id;
    state.name = name;
    state.team = team;
    state.connected = true;
    const slot: Slot = {
      sessionId: client.sessionId,
      state,
      vehicle,
      pacer: this.newPacer(),
    };
    this.syncVehicle(slot);
    this.players.set(client.sessionId, slot);
    this.byVehicle.set(vehicle.id, slot);
    this.state.players.set(client.sessionId, state);
    this.pending.push({ kind: 'joined', vehicleId: vehicle.id, name });
    this.log?.log('info', 'player.join', {
      session: client.sessionId,
      vehicle: vehicle.id,
      name,
      team,
      players: this.players.size,
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
    const slot = this.players.get(client.sessionId);
    if (!slot) return;
    this.players.delete(client.sessionId);
    this.byVehicle.delete(slot.vehicle.id);
    this.commands.delete(slot.vehicle.id);
    this.state.players.delete(client.sessionId);
    this.sim.despawn(slot.vehicle.id);
    this.pending.push({ kind: 'left', vehicleId: slot.vehicle.id, name: slot.state.name });
    this.log?.log('info', 'player.leave', {
      session: client.sessionId,
      name: slot.state.name,
      code,
      players: this.players.size,
    });
  }

  override onDispose(): void {
    if (this.code) this.claims?.delete(this.code);
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

  /** Bir sabit adım: girdileri tüket, dünyayı ilerlet, olayları işle, durumu yaz. */
  private advance(): void {
    const startedAt = performance.now();
    const stepMs = GAME.simulationStepMs;
    this.commands.clear();
    for (const [sessionId, slot] of this.players) {
      this.commands.set(slot.vehicle.id, this.nextCommand(sessionId, slot));
    }
    this.chooseRespawnPoints(stepMs);
    this.sim.step((vehicle) => this.commands.get(vehicle.id) ?? IDLE, stepMs);

    this.drained.length = 0;
    for (const event of this.sim.drainEvents(this.drained)) {
      this.pending.push(event);
      if (event.kind === 'died') this.scoreDeath(event.target, event.source);
    }
    const ended = this.rules.advance(stepMs);
    if (ended?.kind === 'matchStart') this.startMatch();

    this.state.tick++;
    this.state.timeMs += stepMs;
    this.state.phase = this.rules.phase;
    this.state.intermissionMs = this.rules.intermissionMs;
    this.state.winner = this.rules.winner;
    for (const slot of this.players.values()) this.syncVehicle(slot);
    if (this.pending.length > 0) {
      const batch: EventBatch = { t: this.state.timeMs, events: this.pending };
      this.broadcast(EVENT_MESSAGE, batch);
      this.pending = [];
    }
    this.stepTimes.push(performance.now() - startedAt);
  }

  private scoreDeath(targetId: number, sourceId: number | undefined): void {
    const victim = this.byVehicle.get(targetId);
    if (!victim) return;
    const killer = sourceId === undefined ? undefined : this.byVehicle.get(sourceId);
    const result = this.rules.recordDeath(victim.state, killer?.state, this.allStates());
    if (result?.kind === 'matchEnd') {
      this.pending.push(result);
      this.log?.log('info', 'match.end', { winner: result.winner, players: this.players.size });
    }
  }

  /** Yeni maç: skorlar sıfırlanır ve herkes birbirinden uzak yuvalara yeniden doğar. */
  private startMatch(): void {
    this.pending.push({ kind: 'matchStart' });
    const placed: { x: number; y: number }[] = [];
    for (const slot of this.players.values()) {
      slot.state.kills = 0;
      slot.state.deaths = 0;
      const team = slot.state.team === NO_TEAM ? null : slot.state.team;
      const seat = chooseSeat(
        seatsFor(team, NETWORK.maxPlayers, MATCH.teams),
        NETWORK.maxPlayers,
        this.sim.world.center,
        placed,
      );
      const point = seatPoint(seat, NETWORK.maxPlayers, this.sim.world.center);
      this.sim.resetVehicle(slot.vehicle.id, point.x, point.y, point.hull);
      placed.push(point);
    }
    this.log?.log('info', 'match.start', { players: this.players.size });
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

  /**
   * Ölü araç doğmadan önceki son adımda en boş yuvayı seçer: doğma anındaki düşman konumları
   * ölüm anındakinden farklıdır, bu yüzden seçim doğma adımından hemen önce yapılır.
   */
  private chooseRespawnPoints(stepMs: number): void {
    for (const { vehicle, state } of this.players.values()) {
      if (vehicle.vitality.alive || vehicle.vitality.respawnRemainingMs > stepMs * 1.5) continue;
      const team = state.team === NO_TEAM ? null : state.team;
      const seat = chooseSeat(
        seatsFor(team, NETWORK.maxPlayers, MATCH.teams),
        NETWORK.maxPlayers,
        this.sim.world.center,
        this.threats(vehicle.id),
      );
      Object.assign(vehicle.spawnPoint, seatPoint(seat, NETWORK.maxPlayers, this.sim.world.center));
    }
  }

  private newPacer(): InputPacer<TankCommand> {
    return new InputPacer(NETWORK.inputLead, NETWORK.inputHoldSteps);
  }

  private threats(except?: number): { x: number; y: number }[] {
    const list: { x: number; y: number }[] = [];
    for (const { vehicle } of this.players.values()) {
      if (vehicle.id !== except && vehicle.vitality.alive) list.push(vehicle.tank);
    }
    return list;
  }

  private syncVehicle(slot: Slot): void {
    const { state, vehicle } = slot;
    writeTankState(state, vehicle.tank.captureState(this.scratch));
    state.health = vehicle.vitality.health;
    state.alive = vehicle.vitality.alive;
    state.respawnMs = vehicle.vitality.respawnRemainingMs;
    state.protectionMs = vehicle.vitality.protectionRemainingMs;
    state.gunMs = vehicle.gun.getRemaining();
  }

  private smallerTeam(): number {
    const counts = new Array<number>(MATCH.teams).fill(0);
    for (const { state } of this.players.values()) counts[state.team]++;
    return counts.indexOf(Math.min(...counts));
  }

  private names(): string[] {
    return Array.from(this.players.values(), (slot) => slot.state.name);
  }

  private allStates(): Iterable<PlayerSnapshot> {
    return Array.from(this.players.values(), (slot) => slot.state);
  }

  /** Sunucu içi gözlem ve test erişimi; ağ üzerinden görünmez. */
  vehicleOf(sessionId: string): Vehicle | undefined {
    return this.players.get(sessionId)?.vehicle;
  }

  /** Yetkili simülasyon; test ve işletim gözlemi içindir, ağ üzerinden görünmez. */
  get simulation(): Simulation {
    return this.sim;
  }

  /** Oyuncu başına girdi sayaçları (ölçüm ve test). */
  inputStats(sessionId: string): PacerStats | undefined {
    return this.players.get(sessionId)?.pacer.stats;
  }

  get playerCount(): number {
    return this.players.size;
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

/** Kodla katılınan özel oda: kod olmadan ya da yanlış kodla kimse giremez. */
export class PrivateRoom extends MatchRoom {
  override maxClients = MATCH.privateMaxPlayers;

  protected override get privateRoom(): boolean {
    return true;
  }
}
