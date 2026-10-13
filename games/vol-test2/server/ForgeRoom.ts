import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { deflate } from 'node:zlib';
import { CloseCode, Room, ServerError, type Client } from '@colyseus/core';
import { PROTOCOL_VERSION } from '@volstudio/network/protocol';
import { Ring, runRoomLoop, summarize, type TickSummary } from '@volstudio/network/server';
import { ITEM, NET, PLAYER, SIM, SIM_VERSION } from '@/config/forge';
import { ByteReader } from '@/net/bytes';
import {
  CHUNK,
  SIM_MISMATCH,
  SYNC_MODE,
  TO_CLIENT,
  TO_SERVER,
  WIRE_VERSION,
  readView,
  writeAck,
  writePong,
  writeWelcome,
  type Hud,
  type SyncMode,
} from '@/net/protocol';
import { isPlayerKey, readCommand, RESULT, type ForgeCommand } from '@/sim/commands';
import { ForgeSim } from '@/sim/sim';
import type { JournalWriter } from './journal';
import { encodeBeatRecord, encodeCommandRecord, type JournalStats } from './journal';
import { LockstepFeed } from './lockstepFeed';
import type { ClientCursor } from './replication';
import { Replicator, dueAt, emptySectionBytes, type SectionBytes } from './replication';
import { WorldStore, type LoadReport, type SnapshotReport } from './store';

const deflateAsync = promisify(deflate);
/** Katılımda tek seferlik sıkıştırma; iş parçacığı havuzunda koşar, adım döngüsünü bekletmez. */
const SNAPSHOT_DEFLATE_LEVEL = 4;
/** SDK'nın da yeniden bağlanmayı denediği, ağ kaynaklı kapanış kodları. */
const RECONNECTABLE_CODES: ReadonlySet<number> = new Set([
  CloseCode.NO_STATUS_RECEIVED,
  CloseCode.ABNORMAL_CLOSURE,
  CloseCode.GOING_AWAY,
  CloseCode.MAY_TRY_RECONNECT,
]);
const WORLD_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const SAMPLES = 1024;
/** Geçersiz mesaj bu sayıyı aşan oyuncu düşürülür. */
const MAX_VIOLATIONS = 64;
/** Eşzamanlı sıkıştırılan katılım anlık görüntüsü üst sınırı; aşılırsa katılım reddedilir. */
const MAX_PENDING_JOINS = 32;

export const ROOM_NAME = 'forge';

/**
 * Oda yalnız sunucu tarafından kurulur. İstemci `joinOrCreate` ile oda yaratmaya kalkarsa bu
 * belirteç olmadığı için `onCreate` reddeder; belirteç süreç dışına çıkmaz.
 */
export const BOOT_TOKEN = randomBytes(16).toString('hex');

export interface ForgeWorldConfig {
  readonly worldId: string;
  readonly dataDir: string;
  /** Eşitleme biçimi; varsayılan kilit adımlı. */
  readonly mode?: SyncMode;
  readonly seed?: number;
  readonly width?: number;
  readonly height?: number;
  /** Ölçüm dünyaları için canlı birim hedefi; kalıcı dünyada kullanılmaz. */
  readonly sustainUnits?: number;
  /** Anlık görüntü aralığı (adım). */
  readonly snapshotEvery?: number;
  /** Yeni dünya kurulurken bir kez çağrılır (ölçüm sahnesi). Diskten yüklenen dünyada çağrılmaz. */
  readonly prepare?: (sim: ForgeSim) => void;
  readonly tickHz?: number;
  readonly maxPlayers?: number;
}

export type ForgeRoomOptions = ForgeWorldConfig & { readonly boot: string };

interface Player {
  client: Client;
  readonly key: string;
  readonly slot: number;
  ready: boolean;
  dropped: boolean;
  cursor: ClientCursor | null;
  tokens: number;
  tokensAt: number;
  violations: number;
  /** Son kabul edilen el sıkışmanın zaman damgası (performance.now, ms). */
  helloAt: number;
}

interface PendingCommand {
  readonly player: Player;
  readonly seq: number;
  readonly command: ForgeCommand;
}

interface PendingAck {
  readonly player: Player;
  readonly seq: number;
  readonly result: number;
  readonly tick: number;
}

export interface WorldMetrics {
  readonly worldId: string;
  readonly epoch: number;
  readonly tick: number;
  readonly players: number;
  readonly mode: SyncMode;
  readonly achievedHz: number;
  readonly tickMs: TickSummary;
  readonly stepMs: TickSummary;
  readonly sendMs: TickSummary;
  readonly intervalMs: TickSummary;
  readonly commands: {
    readonly accepted: number;
    readonly rejected: number;
    readonly duplicates: number;
    readonly rateLimited: number;
    readonly malformed: number;
    readonly unavailable: number;
  };
  readonly egress: {
    readonly lockstepPackets: number;
    readonly lockstepBytes: number;
    readonly aoiFrames: number;
    readonly aoi: SectionBytes;
    readonly backpressureSkips: number;
    readonly snapshotsSent: number;
    readonly snapshotBytesSent: number;
    readonly snapshotRawBytes: number;
    readonly snapshotDeflateMs: TickSummary;
  };
  readonly journal: JournalStats | null;
  readonly persistence: {
    readonly snapshots: number;
    readonly lastSnapshot: SnapshotReport | null;
    readonly snapshotFailures: number;
    readonly load: LoadReport | null;
  };
  readonly fault: string | null;
}

/**
 * Bir kalıcı fabrika dünyası. Colyseus oda yaşam döngüsünü, kabul ve hız sınırını, yeniden bağlanmayı
 * ve taşımayı verir; simülasyon, günlük, eşitleme ve kalıcılık bu paketin kodudur. Komutlar adım
 * başında uygulanır, günlüğe yazılır ve ack kalıcı olduktan sonra gider.
 */
export class ForgeRoom extends Room {
  /** Süreç içinde bir dünya tek odadadır; süreçler arası kural `world.lock` ile korunur. */
  private static readonly active = new Map<string, ForgeRoom>();

  override maxClients: number = PLAYER.maxPlayers;
  override maxMessagesPerSecond = NET.maxMessagesPerSecond;
  override autoDispose = false;

  private config!: ForgeWorldConfig;
  private mode: SyncMode = SYNC_MODE.lockstep;
  private store!: WorldStore;
  private sim!: ForgeSim;
  private journal!: JournalWriter;
  private feed!: LockstepFeed;
  private replicator: Replicator | null = null;
  private epoch = 0;
  private snapshotEvery: number = NET.snapshotEvery;
  private loadReport: LoadReport | null = null;
  private lastSnapshot: SnapshotReport | null = null;
  private snapshotsTaken = 0;
  private snapshotFailures = 0;
  private snapshotting = false;
  private fault: Error | null = null;
  private disposed = false;

  private readonly players = new Map<string, Player>();
  private readonly byKey = new Map<string, Player>();
  private readonly slots: boolean[] = [];
  private readonly pending: PendingCommand[] = [];
  private skip: Client[] = [];
  private pendingJoins = 0;

  private readonly tickRing = new Ring(SAMPLES);
  private readonly stepRing = new Ring(SAMPLES);
  private readonly sendRing = new Ring(SAMPLES);
  private readonly intervalRing = new Ring(SAMPLES);
  private readonly deflateRing = new Ring(SAMPLES);
  private lastTickAt = 0;
  private firstTickAt = 0;
  private ticksRun = 0;

  private accepted = 0;
  private rejected = 0;
  private duplicates = 0;
  private rateLimited = 0;
  private malformed = 0;
  private unavailable = 0;
  private lockstepPackets = 0;
  private lockstepBytes = 0;
  private aoiFrames = 0;
  private readonly aoiBytes = emptySectionBytes();
  private backpressureSkips = 0;
  private snapshotsSent = 0;
  private snapshotBytesSent = 0;
  private snapshotRawBytes = 0;

  static find(worldId: string): ForgeRoom | undefined {
    return ForgeRoom.active.get(worldId);
  }

  override onAuth(_client: Client, options: Record<string, unknown>): boolean {
    const valid =
      options?.protocol === PROTOCOL_VERSION &&
      options.wire === WIRE_VERSION &&
      isPlayerKey(options.key);
    // Simülasyon sürümü uyuşmazlığı ayrı bildirilir; anlık görüntü sıkıştırması harcanmadan reddedilir.
    if (valid && options.sim !== SIM_VERSION)
      throw new ServerError(SIM_MISMATCH.code, SIM_MISMATCH.message);
    return valid;
  }

  override async onCreate(options: ForgeRoomOptions): Promise<void> {
    if (options?.boot !== BOOT_TOKEN) throw new Error('Dünyayı yalnız sunucu kurabilir.');
    if (!WORLD_ID_PATTERN.test(options.worldId)) throw new RangeError('Geçersiz dünya kimliği.');
    if (ForgeRoom.active.has(options.worldId))
      throw new Error(`Dünya zaten bu süreçte çalışıyor: ${options.worldId}`);
    ForgeRoom.active.set(options.worldId, this);
    try {
      await this.boot(options);
    } catch (error) {
      ForgeRoom.active.delete(options.worldId);
      await this.store?.release().catch(() => undefined);
      throw error;
    }
  }

  private async boot(options: ForgeRoomOptions): Promise<void> {
    this.config = options;
    this.mode = options.mode ?? SYNC_MODE.lockstep;
    this.maxClients = options.maxPlayers ?? PLAYER.maxPlayers;
    this.snapshotEvery = options.snapshotEvery ?? NET.snapshotEvery;
    this.epoch = WorldStore.newEpoch();
    this.store = new WorldStore(join(options.dataDir, options.worldId));
    await this.store.acquire();

    const simOptions = {
      seed: options.seed,
      width: options.width,
      height: options.height,
      sustainUnits: options.sustainUnits,
    };
    const loaded = await this.store.load(simOptions, () => {
      const sim = ForgeSim.create(simOptions);
      options.prepare?.(sim);
      return sim;
    });
    this.sim = loaded.sim;
    this.loadReport = loaded.report;
    // Açılış kontrol noktası: tekrar edilen günlük anlık görüntüye katlanır, yeni günlük başlar.
    this.lastSnapshot = await this.store.snapshot(this.sim);
    this.journal = this.store.rotateJournal(this.sim.tick, this.epoch);
    await this.store.prune();

    this.feed = new LockstepFeed(this.sim.tick);
    if (this.mode === SYNC_MODE.aoi) this.replicator = new Replicator(this.sim);
    runRoomLoop(this, options.tickHz ?? SIM.tickRate, () => this.advance());

    this.onMessageBytes(TO_SERVER.hello, (client: Client, bytes: Uint8Array) =>
      this.hello(client, bytes),
    );
    this.onMessageBytes(TO_SERVER.command, (client: Client, bytes: Uint8Array) =>
      this.command(client, bytes),
    );
    this.onMessageBytes(TO_SERVER.view, (client: Client, bytes: Uint8Array) =>
      this.view(client, bytes),
    );
    this.onMessageBytes(TO_SERVER.ping, (client: Client, bytes: Uint8Array) => {
      const player = this.players.get(client.sessionId);
      if (!player || bytes.length !== 8) return;
      const clientTime = new DataView(bytes.buffer, bytes.byteOffset, 8).getFloat64(0, true);
      client.sendBytes(TO_CLIENT.pong, writePong(clientTime, this.sim.tick));
    });
  }

  override onJoin(client: Client, options: Record<string, unknown>): void {
    const key = options.key as string;
    // Aynı anahtarla yeni bağlantı eskisini yerinden eder: oyuncu cihaz değiştirmiş ya da
    // kopan oturumu sunucu henüz fark etmemiştir.
    const previous = this.byKey.get(key);
    if (previous) {
      this.removePlayer(previous);
      try {
        previous.client.leave(CloseCode.CONSENTED);
      } catch {
        // Bağlantı zaten kapanmış olabilir.
      }
    }
    const slot = this.acquireSlot();
    const player: Player = {
      client,
      key,
      slot,
      ready: false,
      dropped: false,
      cursor: null,
      tokens: PLAYER.commandsPerSecond,
      tokensAt: performance.now(),
      violations: 0,
      helloAt: -Infinity,
    };
    this.players.set(client.sessionId, player);
    this.byKey.set(key, player);
    this.refreshSkip();
  }

  override onDrop(client: Client, code?: number): void {
    const player = this.players.get(client.sessionId);
    if (!player || player.client !== client) return;
    // Kasıtlı kopuşlar (atılma, yerinden edilme, sunucu kapanışı) yeniden bağlanma hakkı doğurmaz;
    // Colyseus bu durumda hemen `onLeave` çağırır.
    if (code === undefined || !RECONNECTABLE_CODES.has(code)) return;
    player.dropped = true;
    player.ready = false;
    this.refreshSkip();
    void this.allowReconnection(client, NET.reconnectSeconds).catch(() => undefined);
  }

  override onReconnect(client: Client): void {
    const player = this.players.get(client.sessionId);
    if (!player) return;
    player.client = client;
    player.dropped = false;
    // Kopukluk sırasında paket kaçmıştır: yeniden el sıkışma ve yeni anlık görüntü gerekir.
    player.ready = false;
    player.cursor = null;
    this.refreshSkip();
  }

  override onLeave(client: Client): void {
    const player = this.players.get(client.sessionId);
    if (!player || player.client !== client) {
      // Yerinden edilen eski oturum zaten silindi.
      this.players.delete(client.sessionId);
      return;
    }
    this.removePlayer(player);
  }

  override async onDispose(): Promise<void> {
    if (this.disposed || !this.store) return;
    this.disposed = true;
    ForgeRoom.active.delete(this.config.worldId);
    try {
      if (!this.fault) await this.store.snapshot(this.sim);
      await this.store.prune();
    } finally {
      await this.store.release();
    }
  }

  /** Sunucunun dünyayı kontrollü kapatması: son anlık görüntü, günlük kapanışı, kilit bırakma. */
  async shutdown(): Promise<void> {
    if (this.disposed) return;
    this.clock.clear();
    await this.disconnect();
  }

  private acquireSlot(): number {
    for (let slot = 0; slot < this.maxClients + 1; slot++) {
      if (!this.slots[slot]) {
        this.slots[slot] = true;
        return slot;
      }
    }
    throw new Error('Oyuncu yuvası kalmadı.');
  }

  private removePlayer(player: Player): void {
    this.players.delete(player.client.sessionId);
    if (this.byKey.get(player.key) === player) this.byKey.delete(player.key);
    this.slots[player.slot] = false;
    this.refreshSkip();
  }

  /** Kilit adımlı yayını alacak olmayan istemciler: el sıkışmamış olanlar ve ilgi alanı biçimindekiler. */
  private refreshSkip(): void {
    const skip: Client[] = [];
    for (const player of this.players.values()) {
      if (player.dropped) continue;
      if (this.mode !== SYNC_MODE.lockstep || !player.ready) skip.push(player.client);
    }
    this.skip = skip;
  }

  private violate(player: Player): void {
    if (++player.violations >= MAX_VIOLATIONS) player.client.leave(CloseCode.WITH_ERROR);
  }

  private hello(client: Client, bytes: Uint8Array): void {
    const player = this.players.get(client.sessionId);
    if (!player || player.dropped) return;
    const now = performance.now();
    if (player.ready) {
      // Hazır oyuncunun ikinci el sıkışması yeniden eşitleme isteğidir (istemci sapma saptadı). Yalnız
      // kilit adımlı kipte anlamlıdır ve hız sınırlıdır: sık istek ihlal sayılır, anlık görüntü gönderilmez.
      if (this.mode !== SYNC_MODE.lockstep) return;
      if (now - player.helloAt < NET.minHelloIntervalMs) {
        this.violate(player);
        return;
      }
    }
    if (this.fault) {
      client.leave(CloseCode.WITH_ERROR);
      return;
    }
    const sim = this.sim;
    if (this.mode === SYNC_MODE.lockstep && this.pendingJoins >= MAX_PENDING_JOINS) {
      client.leave(CloseCode.MAY_TRY_RECONNECT);
      return;
    }
    player.ready = true;
    player.helloAt = now;
    client.sendBytes(
      TO_CLIENT.welcome,
      writeWelcome({
        wire: WIRE_VERSION,
        epoch: this.epoch,
        tick: sim.tick,
        width: sim.state.width,
        height: sim.state.height,
        chunk: CHUNK,
        tickRate: this.config.tickHz ?? SIM.tickRate,
        maxAoi: NET.maxAoiChunks,
        lastSeq: sim.ledger.lastSeq(player.key),
        mode: this.mode,
        sustainUnits: this.config.sustainUnits ?? 0,
        slot: player.slot,
      }),
    );
    if (this.mode === SYNC_MODE.aoi) {
      const cursor = this.replicator!.createCursor(NET.maxAoiChunks, player.slot);
      const rect = readView(bytes);
      if (rect) cursor.setRect(rect);
      player.cursor = cursor;
    } else {
      // Anlık görüntü eşzamanlı alınır (durum tutarlı olsun); sıkıştırma iş parçacığı havuzundadır.
      const raw = sim.snapshot();
      this.snapshotRawBytes += raw.length;
      this.pendingJoins++;
      const started = performance.now();
      void deflateAsync(raw, { level: SNAPSHOT_DEFLATE_LEVEL })
        .then((compressed) => {
          this.deflateRing.push(performance.now() - started);
          if (player.client !== client || player.dropped || !player.ready) return;
          this.snapshotsSent++;
          this.snapshotBytesSent += compressed.length;
          client.sendBytes(TO_CLIENT.snapshot, compressed);
        })
        .catch(() => client.leave(CloseCode.WITH_ERROR))
        .finally(() => {
          this.pendingJoins--;
        });
    }
    this.refreshSkip();
  }

  private view(client: Client, bytes: Uint8Array): void {
    const player = this.players.get(client.sessionId);
    if (!player?.cursor) return;
    const rect = readView(bytes);
    if (!rect) {
      this.violate(player);
      return;
    }
    player.cursor.setRect(rect);
  }

  /** Mesaj `[seq u32][komut]`. Burada yalnız çözülür ve hız sınırlanır; uygulama adım başındadır. */
  private command(client: Client, bytes: Uint8Array): void {
    const player = this.players.get(client.sessionId);
    if (!player || player.dropped || !player.ready) return;
    const now = performance.now();
    const refill = ((now - player.tokensAt) / 1000) * PLAYER.commandsPerSecond;
    player.tokens = Math.min(PLAYER.commandsPerSecond, player.tokens + refill);
    player.tokensAt = now;

    let seq = 0;
    let command: ForgeCommand | null = null;
    try {
      const input = new ByteReader(bytes);
      seq = input.u32();
      command = readCommand(input);
      if (input.remaining !== 0) command = null;
    } catch {
      command = null;
    }
    if (command === null) {
      this.malformed++;
      this.violate(player);
      return;
    }
    if (this.fault) {
      this.unavailable++;
      this.sendAck({ player, seq, result: RESULT.unavailable, tick: this.sim.tick });
      return;
    }
    if (player.tokens < 1) {
      this.rateLimited++;
      this.sendAck({ player, seq, result: RESULT.rateLimited, tick: this.sim.tick });
      return;
    }
    player.tokens -= 1;
    this.pending.push({ player, seq, command });
  }

  private sendAck(ack: PendingAck): void {
    const { player } = ack;
    if (player.dropped || !player.ready) return;
    player.client.sendBytes(
      TO_CLIENT.ack,
      writeAck({ seq: ack.seq, result: ack.result, tick: ack.tick }),
    );
  }

  private hud(): Hud {
    const s = this.sim.state;
    return {
      tick: s.tick,
      coreHp: s.coreHp,
      wave: s.wave,
      nextWaveIn: Math.max(0, s.nextWaveTick - s.tick),
      defeats: s.defeats,
      ore: s.inventory[ITEM.ore],
      plate: s.inventory[ITEM.plate],
      deliveredOre: s.delivered[ITEM.ore],
      deliveredPlate: s.delivered[ITEM.plate],
      units: s.aliveUnits,
      players: this.players.size,
      tickMs100: Math.min(0xffff, Math.round(this.stepRing.mean * 100)),
    };
  }

  /** Bir sunucu adımı: komutlar, simülasyon, günlük, yayın, periyodik kalıcılık. */
  private advance(): void {
    const started = performance.now();
    if (this.firstTickAt === 0) this.firstTickAt = started;
    else this.intervalRing.push(started - this.lastTickAt);
    this.lastTickAt = started;
    const sim = this.sim;

    const acks: PendingAck[] = [];
    let dirty = false;
    if (this.pending.length > 0) {
      const batch = this.pending.splice(0, this.pending.length);
      for (const { player, seq, command } of batch) {
        if (this.fault) {
          this.unavailable++;
          this.sendAck({ player, seq, result: RESULT.unavailable, tick: sim.tick });
          continue;
        }
        const outcome = sim.apply(player.key, seq, command);
        if (!outcome.fresh) {
          this.duplicates++;
        } else {
          // Günlük yazılamıyorsa dünya salt okunura geçer; bu komut ack'te `unavailable` görür.
          if (!this.record(encodeCommandRecord(sim.tick, player.key, seq, command))) {
            this.unavailable++;
            acks.push({ player, seq, result: RESULT.unavailable, tick: sim.tick });
            continue;
          }
          dirty = true;
          if (outcome.result === RESULT.ok) {
            this.accepted++;
            this.feed.record(sim.tick, player.slot, command);
          } else {
            this.rejected++;
          }
        }
        acks.push({ player, seq, result: outcome.result, tick: sim.tick });
      }
    }

    const stepStart = performance.now();
    sim.step();
    this.stepRing.push(performance.now() - stepStart);

    if (sim.tick % NET.heartbeatEvery === 0 && !this.fault) {
      dirty = this.record(encodeBeatRecord(sim.tick, sim.stateHash())) || dirty;
    }
    if (dirty || acks.length > 0) this.commit(acks);

    const sendStart = performance.now();
    this.publish();
    this.sendRing.push(performance.now() - sendStart);

    if (sim.tick % this.snapshotEvery === 0) this.checkpoint();
    this.ticksRun++;
    this.tickRing.push(performance.now() - started);
  }

  private record(payload: Uint8Array): boolean {
    try {
      this.journal.append(payload);
      return true;
    } catch (error) {
      this.fail(error);
      return false;
    }
  }

  /** Ack'ler günlük kalıcı olunca gider; yazma hatası dünyayı salt okunur yapar. */
  private commit(acks: PendingAck[]): void {
    const journal = this.journal;
    journal.commit().then(
      () => {
        for (const ack of acks) this.sendAck(ack);
      },
      (error: unknown) => {
        this.fail(error);
        for (const ack of acks) this.sendAck({ ...ack, result: RESULT.unavailable });
      },
    );
  }

  private fail(error: unknown): void {
    if (this.fault) return;
    this.fault = error instanceof Error ? error : new Error(String(error));
    console.error(
      `[VOL.TEST2] ${this.config.worldId}: günlük yazılamıyor, yeni komut kabul edilmiyor.`,
      this.fault,
    );
  }

  private publish(): void {
    const sim = this.sim;
    if (this.mode === SYNC_MODE.lockstep) {
      const flushed = this.feed.flush(sim, this.players.size);
      if (!flushed) return;
      this.lockstepPackets++;
      this.lockstepBytes +=
        flushed.bytes.length * Math.max(0, this.clients.length - this.skip.length);
      if (this.clients.length > this.skip.length)
        this.broadcastBytes(TO_CLIENT.ticks, flushed.bytes, { except: this.skip });
      this.dropSlowConsumers();
      return;
    }
    const replicator = this.replicator!;
    replicator.collectShots(sim.shots);
    for (const player of this.players.values()) {
      const cursor = player.cursor;
      if (!cursor || !player.ready || player.dropped) continue;
      const socket = (player.client as unknown as { ref?: { bufferedAmount?: number } }).ref;
      if ((socket?.bufferedAmount ?? 0) > NET.backpressureBytes) {
        cursor.skippedForBackpressure++;
        this.backpressureSkips++;
        continue;
      }
      const frame = replicator.frameFor(
        cursor,
        dueAt(sim.tick, cursor.phase, () => this.hud()),
      );
      if (frame === null) continue;
      this.aoiFrames++;
      player.client.sendBytes(TO_CLIENT.frame, frame);
    }
  }

  /**
   * Yavaş istemci paketleri biriktirir: tampon eşiğin dört katını aşarsa bağlantı kesilir; istemci
   * yeniden bağlanıp anlık görüntüyle yetişir. Sunucu belleği bir istemci yüzünden şişmez.
   */
  private dropSlowConsumers(): void {
    for (const player of this.players.values()) {
      if (!player.ready || player.dropped) continue;
      const socket = (player.client as unknown as { ref?: { bufferedAmount?: number } }).ref;
      if ((socket?.bufferedAmount ?? 0) > NET.backpressureBytes * 4) {
        this.backpressureSkips++;
        player.client.leave(CloseCode.MAY_TRY_RECONNECT);
      }
    }
  }

  /**
   * Anlık görüntü ve günlük değişimi aynı adım sınırında olur: serileştirme ve `rotateJournal` eşzamanlı,
   * diske yazma arka planda. Yazma bitmeden çökülürse eski anlık görüntü + iki günlük birlikte tekrar edilir.
   */
  private checkpoint(): void {
    if (this.snapshotting || this.fault) return;
    this.snapshotting = true;
    this.journal = this.store.rotateJournal(this.sim.tick, this.epoch);
    this.store
      .snapshot(this.sim)
      .then(async (report) => {
        this.lastSnapshot = report;
        this.snapshotsTaken++;
        await this.store.prune();
      })
      .catch(() => {
        this.snapshotFailures++;
      })
      .finally(() => {
        this.snapshotting = false;
      });
  }

  /** Ölçüm ve izleme için anlık özet. */
  metrics(): WorldMetrics {
    const seconds = this.firstTickAt === 0 ? 0 : (performance.now() - this.firstTickAt) / 1000;
    const aoi = { ...this.aoiBytes };
    for (const player of this.players.values()) {
      if (!player.cursor) continue;
      for (const key of Object.keys(aoi) as (keyof SectionBytes)[])
        aoi[key] += player.cursor.bytes[key];
    }
    return {
      worldId: this.config.worldId,
      epoch: this.epoch,
      tick: this.sim.tick,
      players: this.players.size,
      mode: this.mode,
      achievedHz: seconds > 0 ? this.ticksRun / seconds : 0,
      tickMs: summarize(this.tickRing),
      stepMs: summarize(this.stepRing),
      sendMs: summarize(this.sendRing),
      intervalMs: summarize(this.intervalRing),
      commands: {
        accepted: this.accepted,
        rejected: this.rejected,
        duplicates: this.duplicates,
        rateLimited: this.rateLimited,
        malformed: this.malformed,
        unavailable: this.unavailable,
      },
      egress: {
        lockstepPackets: this.lockstepPackets,
        lockstepBytes: this.lockstepBytes,
        aoiFrames: this.aoiFrames,
        aoi,
        backpressureSkips: this.backpressureSkips,
        snapshotsSent: this.snapshotsSent,
        snapshotBytesSent: this.snapshotBytesSent,
        snapshotRawBytes: this.snapshotRawBytes,
        snapshotDeflateMs: summarize(this.deflateRing),
      },
      journal: this.journal ? { ...this.store.journalStats } : null,
      persistence: {
        snapshots: this.snapshotsTaken,
        lastSnapshot: this.lastSnapshot,
        snapshotFailures: this.snapshotFailures,
        load: this.loadReport,
      },
      fault: this.fault ? this.fault.message : null,
    };
  }

  /** Test ve ölçüm: canlı simülasyon. Üretim kodu bunu kullanmaz. */
  get simulation(): ForgeSim {
    return this.sim;
  }
}
