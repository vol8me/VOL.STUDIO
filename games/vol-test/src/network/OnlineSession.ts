import { DisposableScope } from '@volstudio/core/lifecycle';
import {
  JoinError,
  Predict,
  ServerTimeline,
  createLobby,
  type Lobby,
  type Room,
} from '@volstudio/network/client';
import { NETWORK } from '@/config/network';
import { CLIMATE_MESSAGE, CLIMATE_REQUEST, isClimateSnapshot } from './climate';
import { EVENT_MESSAGE, isEventBatch, type EventBatch } from './events';
import type { ClimateSnapshot } from '@/sim/weather/types';
import { ROOM } from './rooms';
import { WORLD_SCHEMA, type WorldSnapshot, type PlayerSnapshot } from './schema';

/** `reconnecting` bağlantı koptuğunda Colyseus'un yeniden bağlanmayı denediği süredir. */
export type ConnectionStatus = 'live' | 'reconnecting' | 'closed';

export interface SessionOptions {
  readonly endpoint: string;
  readonly name: string;
  /** İstenen cephe (`WAR.factions` indeksi); sunucu dengeyi bozacaksa kendi seçer. */
  readonly faction?: number;
  /** Seçilen aracın `VEHICLE_IDS` indeksi; verilmezse ilk araçla katılır. */
  readonly model?: number;
  /** Testte sahte eşleştirici; verilmezse `endpoint` için gerçek istemci kurulur. */
  readonly lobby?: Lobby;
  /** Katılımdan sonra kendi oyuncu kaydının görünmesini bekleme üst sınırı. */
  readonly settleTimeoutMs?: number;
}

const DEFAULT_SETTLE_MS = 5000;

type Listener<T> = (value: T) => void;

/**
 * Savaş dünyasına bağlı oturum. Phaser'dan bağımsızdır: oda, öngörü sürücüsü, sunucu zaman ekseni,
 * bağlantı durumu ve olay dağıtımı burada toplanır; sahne yalnız bunu okur. Oturum bir kez
 * `dispose` edildikten sonra kullanılmaz.
 */
export class OnlineSession {
  readonly predict: Predict;
  readonly timeline = new ServerTimeline();
  private currentStatus: ConnectionStatus = 'live';
  private closedCode: number | undefined;
  private readonly statusListeners = new Set<Listener<ConnectionStatus>>();
  private readonly eventListeners = new Set<Listener<EventBatch>>();
  private readonly climateListeners = new Set<Listener<ClimateSnapshot>>();
  private latestClimate: ClimateSnapshot | undefined;
  private readonly scope = new DisposableScope();
  private disposed = false;
  private leaving: Promise<void> | undefined;

  private constructor(readonly room: Room<WorldSnapshot>) {
    this.predict = Predict.get(room, {
      name: 'vol-test',
      delay: NETWORK.interpolationDelayMs,
    });
    try {
      this.initialize();
    } catch (error) {
      this.scope.dispose();
      this.predict.dispose();
      throw error;
    }
  }

  private initialize(): void {
    const room = this.room;
    const stateChange = (state: WorldSnapshot): void => {
      this.timeline.observe(state.timeMs, room.clock.lastServerTime());
    };
    room.onStateChange(stateChange);
    this.scope.addSubscription(() => room.onStateChange.remove(stateChange));
    stateChange(room.state);

    const dropped = (): void => this.setStatus('reconnecting');
    const restored = (): void => {
      this.setStatus('live');
      room.send(CLIMATE_REQUEST);
    };
    const left = (code: number): void => {
      this.closedCode = code;
      this.setStatus('closed');
    };
    room.onDrop(dropped);
    room.onReconnect(restored);
    room.onLeave(left);
    this.scope.addSubscription(() => room.onDrop.remove(dropped));
    this.scope.addSubscription(() => room.onReconnect.remove(restored));
    this.scope.addSubscription(() => room.onLeave.remove(left));
    this.scope.addSubscription(
      room.onMessage(EVENT_MESSAGE, (batch: unknown) => {
        if (!isEventBatch(batch)) return;
        for (const listener of [...this.eventListeners]) listener(batch);
      }),
    );
    this.scope.addSubscription(
      room.onMessage(CLIMATE_MESSAGE, (value: unknown) => {
        // Geçersiz yük yok sayılır: istemci kendi belirli hava saatiyle sürer.
        if (!isClimateSnapshot(value)) return;
        this.latestClimate = value;
        for (const listener of [...this.climateListeners]) listener(value);
      }),
    );
    // Dinleyici hazır: sunucudan ilk iklim görüntüsü istenir (katılımda kendiliğinden gelene güvenilmez).
    room.send(CLIMATE_REQUEST);
  }

  /**
   * Eşleştirir, odaya katılır ve kendi oyuncu kaydı görünene dek bekler. Başarısızlık her zaman
   * `JoinError`dır (kod biçimi, sürüm, dolu oda, ulaşılamayan sunucu, zaman aşımı).
   */
  static async open(options: SessionOptions): Promise<OnlineSession> {
    const timeout = options.settleTimeoutMs ?? DEFAULT_SETTLE_MS;
    if (!Number.isFinite(timeout) || timeout <= 0) throw new JoinError('failed');
    const lobby = options.lobby ?? createLobby(options.endpoint);
    const room = await OnlineSession.connect(lobby, options);
    try {
      room.reconnection.minUptime = NETWORK.reconnectMinUptimeMs;
      await OnlineSession.settle(room, timeout);
      return new OnlineSession(room);
    } catch (error) {
      void room.leave().catch(() => undefined);
      throw error instanceof JoinError ? error : new JoinError('failed', { cause: error });
    }
  }

  private static connect(lobby: Lobby, options: SessionOptions): Promise<Room<WorldSnapshot>> {
    const { name, model = 0, faction } = options;
    const join = faction === undefined ? { name, model } : { name, model, faction };
    return lobby.joinOrCreate(ROOM.world, join, WORLD_SCHEMA);
  }

  /** İlk durum gelip kayıt görünene dek bekler; oda önce kapanır ya da süre dolarsa `failed`. */
  private static settle(room: Room<WorldSnapshot>, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const present = (): boolean => room.state?.players?.get(room.sessionId) !== undefined;
      const finish = (error?: JoinError): void => {
        clearTimeout(timer);
        room.onStateChange.remove(check);
        room.onLeave.remove(closed);
        if (error) reject(error);
        else resolve();
      };
      const check = (): void => {
        if (present()) finish();
      };
      const closed = (): void => finish(new JoinError('failed'));
      const timer = setTimeout(() => finish(new JoinError('failed')), timeoutMs);
      room.onStateChange(check);
      room.onLeave(closed);
      check();
    });
  }

  get status(): ConnectionStatus {
    return this.currentStatus;
  }

  /** Bağlantının kapanış kodu; kapanmadıysa `undefined`. */
  get closeCode(): number | undefined {
    return this.closedCode;
  }

  /** Kendi oyuncu kaydı; sunucu kaydı kopmada da tutar (`connected` yalnız bayrağı değiştirir). */
  get self(): PlayerSnapshot | undefined {
    return this.room.state.players.get(this.room.sessionId);
  }

  /** Yumuşatılmış gidiş-dönüş gecikmesi (ms). */
  get pingMs(): number {
    return Math.round(this.room.clock.smoothedRtt());
  }

  /** Yama varış aralığı sapması (ms); bağlantı kalitesi göstergesi. */
  get jitterMs(): number {
    return Math.round(this.room.clock.jitter());
  }

  /**
   * Uzak oyuncuların çizildiği sunucu anı: SDK ara değeri `serverNow − gecikme − rtt/2`yi gösterir,
   * olaylar da aynı ana gelince bırakılırsa atış, patlama ve ölüm tankın göründüğü yerle örtüşür.
   */
  get displayTimeMs(): number {
    const clock = this.room.clock;
    return clock.serverNow() - NETWORK.interpolationDelayMs - clock.smoothedRtt() / 2;
  }

  /** En son yamanın yaşı (ms): yamalar arasında sunucu sayaçları bu kadar ilerlemiş sayılır. */
  get snapshotAgeMs(): number {
    const clock = this.room.clock;
    const stamp = clock.lastServerTime();
    return stamp > 0 ? Math.max(0, clock.serverNow() - stamp) : 0;
  }

  /** Bağlantı durumu değişince çağrılır; döndürülen işlev aboneliği kaldırır. */
  onStatus(listener: Listener<ConnectionStatus>): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /** Sunucunun her sabit adımdaki olay paketini alır; döndürülen işlev aboneliği kaldırır. */
  onEvents(listener: Listener<EventBatch>): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /** Sunucunun son iklim anlık görüntüsü; henüz gelmediyse `undefined`. */
  get climate(): ClimateSnapshot | undefined {
    return this.latestClimate;
  }

  /** Yeni iklim anlık görüntüsü gelince çağrılır (katılımda ve düzenli aralıkla). */
  onClimate(listener: Listener<ClimateSnapshot>): () => void {
    this.climateListeners.add(listener);
    return () => this.climateListeners.delete(listener);
  }

  /** Odadan bilerek ayrılır (sunucu oyuncuyu hemen düşürür, yeniden bağlanma beklenmez). */
  async leave(): Promise<void> {
    if (this.currentStatus === 'closed') return;
    this.leaving ??= this.room.leave(true).then(
      () => undefined,
      () => undefined,
    );
    await this.leaving;
  }

  /** Dinleyicileri ve öngörü sürücüsünü kaldırır, bağlantıyı kapatır. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scope.dispose();
    this.statusListeners.clear();
    this.eventListeners.clear();
    this.climateListeners.clear();
    this.predict.dispose();
    if (this.currentStatus !== 'closed') void this.leave();
    this.currentStatus = 'closed';
  }

  private setStatus(status: ConnectionStatus): void {
    if (status === this.currentStatus) return;
    this.currentStatus = status;
    for (const listener of [...this.statusListeners]) listener(status);
  }
}
