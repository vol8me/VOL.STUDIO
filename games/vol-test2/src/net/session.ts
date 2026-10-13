import { Client, type Room } from '@colyseus/sdk';
import { PROTOCOL_VERSION } from '@volstudio/network/protocol';
import { ByteWriter } from './bytes';
import { LockstepClient, readTickPacket } from './lockstep';
import {
  SYNC_MODE,
  TO_CLIENT,
  ROOM_NAME,
  TO_SERVER,
  WIRE_VERSION,
  readAck,
  readPong,
  readWelcome,
  writePing,
  writeView,
  type Ack,
  type ChunkRect,
  type Welcome,
} from './protocol';
import { Replica } from './replica';
import { NET, SIM_VERSION } from '@/config/factory';
import { writeCommand, type FactoryCommand, COMMAND } from '@/sim/commands';

/** Colyseus `CloseCode.MAY_TRY_RECONNECT`. */
const MAY_TRY_RECONNECT = 4010;

/** Bu oturumda ack'i alınamayan ama sunucunun `lastSeq`i kapsadığı komutun sonucu. */
export const ACK_APPLIED_UNKNOWN = 255;

/** Ağ gecikmesi ve saat farkı için el sıkışma aralığının üstüne eklenen pay (ms). */
const RESYNC_MARGIN_MS = 250;

export type SessionStatus = 'connecting' | 'syncing' | 'live' | 'reconnecting' | 'closed';

export type SessionEvent =
  | { readonly type: 'status'; readonly status: SessionStatus }
  | { readonly type: 'welcome'; readonly welcome: Welcome }
  | { readonly type: 'ack'; readonly ack: Ack; readonly rttMs: number }
  | { readonly type: 'synced' }
  | { readonly type: 'error'; readonly error: Error };

export interface SessionOptions {
  readonly endpoint: string;
  readonly worldId: string;
  readonly key: string;
  /** Anlık görüntüyü açar; varsayılan platformun `DecompressionStream('deflate')`ıdır. */
  readonly inflate?: (bytes: Uint8Array) => Promise<Uint8Array>;
  readonly now?: () => number;
}

export interface ReceivedBytes {
  ticks: number;
  frames: number;
  snapshots: number;
  acks: number;
  other: number;
}

interface Waiting {
  readonly command: FactoryCommand;
  readonly sentAt: number;
  readonly resolve: (ack: Ack) => void;
}

export async function inflateDeflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Bir dünyaya istemci oturumu: katılım, el sıkışma, anlık görüntü ve komut akışı, komut sırası ve
 * yeniden bağlanma. Phaser'a bağlı değildir; oyun sahnesi ve test botları aynı sınıfı kullanır.
 * Kilit adımlı dünyada `lockstep`, ilgi alanı dünyasında `replica` dolar.
 */
export class FactorySession {
  status: SessionStatus = 'connecting';
  welcome: Welcome | null = null;
  lockstep = new LockstepClient();
  replica = new Replica();
  /** Son ölçülen gidiş-dönüş süresi (ms). */
  rttMs = 0;
  /** Sunucunun ilk karşılamasından beri geçen yeniden senkronizasyon sayısı. */
  resyncs = 0;
  readonly received: ReceivedBytes = { ticks: 0, frames: 0, snapshots: 0, acks: 0, other: 0 };

  private nextSeq = 1;
  private lastHelloAt = -Infinity;
  private readonly waiting = new Map<number, Waiting>();
  private readonly listeners = new Set<(event: SessionEvent) => void>();
  private generation = 0;
  private readonly inflate: (bytes: Uint8Array) => Promise<Uint8Array>;
  private readonly now: () => number;

  /** Oyuncu anahtarı: dünyadaki tankın yuvası `state.players.slotOf(key)` ile bulunur. */
  readonly key: string;

  private constructor(
    private readonly room: Room,
    options: SessionOptions,
  ) {
    this.key = options.key;
    this.inflate = options.inflate ?? inflateDeflate;
    this.now = options.now ?? (() => performance.now());
    // SDK varsayılanı 5 sn: bağlantı o süreden önce koparsa yeniden bağlanmaz, odadan düşer.
    // Mobil ağda ilk saniyelerdeki kopuşlar da yeniden bağlanmalıdır.
    room.reconnection.minUptime = 0;
    this.wire();
  }

  static async connect(options: SessionOptions): Promise<FactorySession> {
    const client = new Client(options.endpoint);
    const room = await client.join(ROOM_NAME, {
      worldId: options.worldId,
      protocol: PROTOCOL_VERSION,
      wire: WIRE_VERSION,
      sim: SIM_VERSION,
      key: options.key,
    });
    const session = new FactorySession(room, options);
    session.hello();
    return session;
  }

  get roomId(): string {
    return this.room.roomId;
  }

  get sessionId(): string {
    return this.room.sessionId;
  }

  subscribe(listener: (event: SessionEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: SessionEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private setStatus(status: SessionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.emit({ type: 'status', status });
  }

  private wire(): void {
    const room = this.room;
    room.onMessage(TO_CLIENT.welcome, (payload: unknown) => this.onWelcome(toBytes(payload)));
    room.onMessage(TO_CLIENT.snapshot, (payload: unknown) => this.onSnapshot(toBytes(payload)));
    room.onMessage(TO_CLIENT.ticks, (payload: unknown) => {
      const bytes = toBytes(payload);
      this.received.ticks += bytes.length;
      try {
        this.lockstep.receive(readTickPacket(bytes));
      } catch (error) {
        this.fail(error);
      }
    });
    room.onMessage(TO_CLIENT.frame, (payload: unknown) => {
      const bytes = toBytes(payload);
      this.received.frames += bytes.length;
      try {
        this.replica.apply(bytes, this.now());
        if (this.status === 'syncing') {
          this.setStatus('live');
          this.emit({ type: 'synced' });
        }
      } catch (error) {
        this.fail(error);
      }
    });
    room.onMessage(TO_CLIENT.ack, (payload: unknown) => {
      const bytes = toBytes(payload);
      this.received.acks += bytes.length;
      const ack = readAck(bytes);
      const waiting = this.waiting.get(ack.seq);
      if (!waiting) return;
      this.waiting.delete(ack.seq);
      const rttMs = this.now() - waiting.sentAt;
      this.rttMs = rttMs;
      waiting.resolve(ack);
      this.emit({ type: 'ack', ack, rttMs });
    });
    room.onMessage(TO_CLIENT.pong, (payload: unknown) => {
      const bytes = toBytes(payload);
      this.received.other += bytes.length;
      this.rttMs = this.now() - readPong(bytes).clientTime;
    });
    room.onDrop(() => this.setStatus('reconnecting'));
    room.onReconnect(() => {
      this.resyncs++;
      this.hello();
    });
    room.onLeave(() => {
      this.setStatus('closed');
      for (const [seq, waiting] of this.waiting) {
        waiting.resolve({ seq, result: ACK_APPLIED_UNKNOWN, tick: 0 });
      }
      this.waiting.clear();
    });
    room.onError((_code, message) => this.fail(new Error(message ?? 'Oda hatası')));
  }

  private fail(error: unknown): void {
    this.emit({ type: 'error', error: error instanceof Error ? error : new Error(String(error)) });
  }

  /** Her (yeniden) bağlanışta: eski durum atılır, sunucudan karşılama ve anlık görüntü istenir. */
  private hello(view?: ChunkRect): void {
    this.lastHelloAt = this.now();
    this.generation++;
    this.lockstep = new LockstepClient();
    this.replica = new Replica();
    this.setStatus('syncing');
    this.room.sendBytes(TO_SERVER.hello, view ? writeView(view) : new Uint8Array(0));
  }

  private onWelcome(bytes: Uint8Array): void {
    this.received.other += bytes.length;
    const welcome = readWelcome(bytes);
    this.welcome = welcome;
    if (welcome.mode === SYNC_MODE.aoi) this.replica.reset(welcome);
    // Sunucunun kabul ettiği son sıraya kadarki komutlar iş görmüştür; sonrası yeniden gönderilir.
    const pending = [...this.waiting.entries()].sort((a, b) => a[0] - b[0]);
    for (const [seq, waiting] of pending) {
      if (seq <= welcome.lastSeq) {
        this.waiting.delete(seq);
        waiting.resolve({ seq, result: ACK_APPLIED_UNKNOWN, tick: welcome.tick });
      } else {
        this.room.sendBytes(TO_SERVER.command, encodeCommand(seq, waiting.command));
      }
    }
    this.nextSeq = Math.max(this.nextSeq, welcome.lastSeq + 1);
    this.emit({ type: 'welcome', welcome });
  }

  private onSnapshot(bytes: Uint8Array): void {
    this.received.snapshots += bytes.length;
    const generation = this.generation;
    const welcome = this.welcome;
    // SDK, alınan baytı ortak tampondan bir görünüm olarak verir: eşzamansız işlemden önce kopyalanır.
    const copy = bytes.slice();
    void this.inflate(copy)
      .then((raw) => {
        if (generation !== this.generation) return;
        this.lockstep.install(raw, { sustainUnits: welcome?.sustainUnits ?? 0 });
        this.setStatus('live');
        this.emit({ type: 'synced' });
      })
      .catch((error: unknown) => this.fail(error));
  }

  /** Komutu sıraya alır ve gönderir; ack (sunucu günlüğe yazdıktan sonra) gelince çözülür. */
  submit(command: FactoryCommand): Promise<Ack> {
    const seq = this.nextSeq++;
    return new Promise<Ack>((resolve) => {
      this.waiting.set(seq, { command, sentAt: this.now(), resolve });
      if (this.status === 'live' || this.status === 'syncing')
        this.room.sendBytes(TO_SERVER.command, encodeCommand(seq, command));
    });
  }

  place(x: number, y: number, kind: number, rot: number): Promise<Ack> {
    return this.submit({ type: COMMAND.place, x, y, kind, rot });
  }

  remove(x: number, y: number): Promise<Ack> {
    return this.submit({ type: COMMAND.remove, x, y });
  }

  rotate(x: number, y: number, rot: number): Promise<Ack> {
    return this.submit({ type: COMMAND.rotate, x, y, rot });
  }

  /** Hareket niyeti: 0 durur, 1..16 yön. Sonuç beklenmez; sunucu niyeti süre sonunda söndürür. */
  steer(dir: number): Promise<Ack> {
    return this.submit({ type: COMMAND.move, dir });
  }

  /** İlgi alanı dünyasında görünümü değiştirir. */
  setView(rect: ChunkRect): void {
    this.room.sendBytes(TO_SERVER.view, writeView(rect));
  }

  ping(): void {
    this.room.sendBytes(TO_SERVER.ping, writePing(this.now()));
  }

  /** Kilit adımlı simülasyonu en çok `maxSteps` adım ilerletir. */
  advance(maxSteps: number): number {
    return this.lockstep.advance(maxSteps);
  }

  /** Sıradaki `submit` çağrısının alacağı sıra numarası. */
  get nextCommandSeq(): number {
    return this.nextSeq;
  }

  /**
   * Durumu atıp sunucudan yeni anlık görüntü ister: sapma saptandığında. Bağlantı kapalıyken, SDK yeniden
   * bağlanırken (o yol zaten el sıkışır) ya da son el sıkışma çok yakınsa bir şey yapmaz ve false döner;
   * çağıran sonraki karede yeniden dener.
   */
  resync(): boolean {
    if (this.status === 'closed' || this.status === 'reconnecting') return false;
    // Sunucu sık el sıkışmayı ihlal sayar: aralığın üstüne güvenlik payı bırakılır.
    if (this.now() - this.lastHelloAt < NET.minHelloIntervalMs + RESYNC_MARGIN_MS) return false;
    this.resyncs++;
    this.hello();
    return true;
  }

  get pendingCommands(): number {
    return this.waiting.size;
  }

  /**
   * Ağ kaybını taklit eder (test ve QA). Tarayıcı soketi anormal kapanış (1006) üretemez; SDK ve sunucu
   * `MAY_TRY_RECONNECT` (4010) kodunu da aynı yeniden bağlanma yoluna sokar.
   */
  simulateDrop(): void {
    const socket = (
      this.room.connection.transport as unknown as { ws: { close(code?: number): void } }
    ).ws;
    socket.close(MAY_TRY_RECONNECT);
  }

  /** Oturumu kapatır. Bağlantı zaten kapalıysa ya da sunucu yanıtlamazsa `timeoutMs` sonra döner. */
  async leave(timeoutMs = 3000): Promise<void> {
    if (this.status === 'closed') return;
    await Promise.race([
      this.room.leave(),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }
}

function toBytes(payload: unknown): Uint8Array {
  if (payload instanceof Uint8Array) return payload;
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload);
  throw new TypeError('Bayt yükü bekleniyordu.');
}

function encodeCommand(seq: number, command: FactoryCommand): Uint8Array {
  const out = new ByteWriter(16);
  out.u32(seq);
  writeCommand(out, command);
  return out.finish();
}
