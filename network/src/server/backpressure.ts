/** Colyseus istemcisinin altındaki WebSocket'ten okunan, sürüme bağımlı alanlar. */
interface SocketLike {
  readonly bufferedAmount?: number;
  readonly _socket?: { readonly bytesWritten?: number; readonly bytesRead?: number };
}

export interface TrafficClient {
  readonly sessionId: string;
  readonly ref?: unknown;
  leave?(code?: number, message?: string): void;
}

export interface ClientTraffic {
  /** Gerçek Node soket sayaçları okunabildi mi? `false` iken toplamlar ölçüm değildir. */
  readonly measured: boolean;
  /** Soketin yazma kuyruğunda bekleyen bayt; tüketici yavaşsa büyür. */
  readonly bufferedBytes: number;
  /** Node soket akışının baytları: WebSocket çerçeveleri dahil; IP/TLS tel maliyeti değildir. */
  readonly sentBytes: number;
  readonly receivedBytes: number;
}

/**
 * İstemci başına trafik. `ws`nin gerçek soket sayaçları yoksa `measured: false` döner;
 * JSON uzunluğu veya paket tahmini gerçek bayt yerine kullanılmaz.
 */
export function clientTraffic(client: TrafficClient): ClientTraffic {
  const socket = (client.ref ?? {}) as SocketLike;
  const finite = (value: number | undefined): number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
  return {
    measured: [socket._socket?.bytesWritten, socket._socket?.bytesRead].every(
      (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0,
    ),
    bufferedBytes: finite(socket.bufferedAmount),
    sentBytes: finite(socket._socket?.bytesWritten),
    receivedBytes: finite(socket._socket?.bytesRead),
  };
}

export interface SlowConsumerOptions {
  /** Kuyruktaki bayt bu sınırı aşarsa istemci "yavaş" sayılır. */
  readonly limitBytes: number;
  /** Yavaşlık bu süre kesintisiz sürerse istemci atılır; kısa dalgalanma bağışlanır. */
  readonly graceMs: number;
}

export const DEFAULT_SLOW_CONSUMER: SlowConsumerOptions = { limitBytes: 256 * 1024, graceMs: 5000 };

/**
 * Yavaş tüketici politikası: yazma kuyruğu sınırı aşan istemci, `graceMs` boyunca kesintisiz aşmayı
 * sürdürürse atılır. Aksi halde bir bağlantı kopmadan yalnız yavaş okuyarak sunucu belleğini şişirir.
 * Durum oturum başına tutulur; `forget` ayrılan istemciyi unutturur.
 */
export class SlowConsumerWatch {
  private readonly overSince = new Map<string, number>();

  constructor(readonly options: SlowConsumerOptions = DEFAULT_SLOW_CONSUMER) {}

  /** `true` ise istemci atılmalıdır. */
  exceeds(sessionId: string, bufferedBytes: number, nowMs: number): boolean {
    if (bufferedBytes <= this.options.limitBytes) {
      this.overSince.delete(sessionId);
      return false;
    }
    const since = this.overSince.get(sessionId);
    if (since === undefined) {
      this.overSince.set(sessionId, nowMs);
      return false;
    }
    return nowMs - since >= this.options.graceMs;
  }

  forget(sessionId: string): void {
    this.overSince.delete(sessionId);
  }

  get tracked(): number {
    return this.overSince.size;
  }
}

/** Kapanış kodu: 1013 "Try Again Later" yavaş istemciyi nedeniyle bildirir. */
export const SLOW_CONSUMER_CLOSE_CODE = 1013;

/**
 * Odanın istemcilerini tarar ve yavaş olanları atar; atılanların oturum kimliği döner.
 * Oda döngüsünden saniyede birkaç kez çağrılır.
 */
export function evictSlowConsumers(
  clients: Iterable<TrafficClient>,
  watch: SlowConsumerWatch,
  nowMs: number,
): string[] {
  const evicted: string[] = [];
  for (const client of clients) {
    const { bufferedBytes } = clientTraffic(client);
    if (!watch.exceeds(client.sessionId, bufferedBytes, nowMs)) continue;
    watch.forget(client.sessionId);
    evicted.push(client.sessionId);
    client.leave?.(SLOW_CONSUMER_CLOSE_CODE, 'slow-consumer');
  }
  return evicted;
}
