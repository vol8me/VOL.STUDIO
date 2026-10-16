import type { IncomingMessage, Server as HttpServer, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { isIP } from 'node:net';
import { TokenBucket } from './limits';
import { envFlag, envInteger, type Env } from './env';
import type { Logger } from './log';

export interface GuardSettings {
  /** Aynı adresten aynı anda açık WebSocket üst sınırı. */
  readonly maxSocketsPerAddress: number;
  /** Sunucunun toplam açık WebSocket üst sınırı; oda sayısı bu sınırla dolaylı bağlanır. */
  readonly maxSockets: number;
  /** Adres başına saniyede kabul edilen HTTP isteği ve yükseltme sayısı. */
  readonly requestsPerSecond: number;
  /** Adres başına ani birikim: eşleştirme + yükseltme bir katılımda iki jeton harcar. */
  readonly requestBurst: number;
  /** Tarayıcı kökeni izin listesi; boşsa köken denetlenmez. `Origin` göndermeyen istemci geçer. */
  readonly origins: readonly string[];
  /** Önde güvenilir bir ters vekil varsa adres `X-Forwarded-For`un sağ ucundan okunur. */
  readonly trustProxy: boolean;
}

export const DEFAULT_GUARD: GuardSettings = {
  // Bir ağ (aile, LAN, kafe) arkasındaki tek adresten bir dünyanın tamamı (24 insan) girebilmelidir;
  // ani birikim ona yetecek kadardır (bir katılım iki jeton).
  maxSocketsPerAddress: 32,
  maxSockets: 512,
  requestsPerSecond: 20,
  requestBurst: 60,
  origins: [],
  trustProxy: false,
};

/**
 * Koruma ayarları ortamdan okunur: `VOL_NET_MAX_SOCKETS`, `VOL_NET_MAX_SOCKETS_PER_ADDRESS`,
 * `VOL_NET_REQUEST_RATE`, `VOL_NET_REQUEST_BURST`, `VOL_NET_ORIGINS` (virgüllü liste) ve
 * `VOL_NET_TRUST_PROXY`. Geçersiz değer başlatmayı durdurur.
 */
export function guardSettings(env: Env): GuardSettings {
  const origins = (env.VOL_NET_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');
  for (const origin of origins) {
    if (normalizeOrigin(origin) === null)
      throw new RangeError(`VOL_NET_ORIGINS geçersiz köken: ${origin}`);
  }
  return {
    maxSocketsPerAddress: envInteger(
      env,
      'VOL_NET_MAX_SOCKETS_PER_ADDRESS',
      DEFAULT_GUARD.maxSocketsPerAddress,
      1,
      100_000,
    ),
    maxSockets: envInteger(env, 'VOL_NET_MAX_SOCKETS', DEFAULT_GUARD.maxSockets, 1, 1_000_000),
    requestsPerSecond: envInteger(
      env,
      'VOL_NET_REQUEST_RATE',
      DEFAULT_GUARD.requestsPerSecond,
      1,
      100_000,
    ),
    requestBurst: envInteger(env, 'VOL_NET_REQUEST_BURST', DEFAULT_GUARD.requestBurst, 1, 100_000),
    origins: origins.map((origin) => normalizeOrigin(origin)!),
    trustProxy: envFlag(env, 'VOL_NET_TRUST_PROXY'),
  };
}

export type RejectReason = 'origin' | 'rate' | 'address-sockets' | 'sockets';

export type Verdict =
  | { readonly ok: true; release(): void }
  | {
      readonly ok: false;
      readonly reason: RejectReason;
      readonly status: 403 | 429 | 503;
      readonly retryAfterSeconds: number;
    };

export interface GuardStats {
  readonly sockets: number;
  readonly addresses: number;
  readonly rejected: Readonly<Record<RejectReason, number>>;
}

const PASS: Verdict = { ok: true, release: () => undefined };
/** Bu kadar farklı adres izlenirse yeni adres reddedilir; bellek saldırgan eliyle büyümez. */
const MAX_TRACKED_ADDRESSES = 50_000;
const SWEEP_EVERY = 256;

function normalizeOrigin(value: string): string | null {
  if (!/^[a-z][a-z0-9+.-]*:\/\/[^/\s]+$/i.test(value)) return null;
  try {
    const url = new URL(value);
    if (!url.hostname || url.username || url.password || url.search || url.hash) return null;
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Adres anahtarı: IPv4 olduğu gibi, IPv4-eşlemeli IPv6 IPv4'e iner, IPv6 /64 önekine indirgenir
 * (bir ağ tek adres sayılır; saldırgan aynı /64 içinde adres döndürerek sınırı aşamaz).
 */
export function addressKey(raw: string | undefined): string {
  if (!raw) return 'unknown';
  const address = raw.toLowerCase().replace(/%.*$/, '');
  const kind = isIP(address);
  if (kind === 0) return 'unknown';
  if (kind === 4) return address;
  const canonical = new URL(`http://[${address}]`).hostname.slice(1, -1);
  const [head, tail = ''] = canonical.split('::');
  const headGroups = head === '' ? [] : head.split(':');
  const tailGroups = canonical.includes('::') && tail !== '' ? tail.split(':') : [];
  const groups = canonical.includes('::')
    ? [
        ...headGroups,
        ...Array<string>(Math.max(0, 8 - headGroups.length - tailGroups.length)).fill('0'),
        ...tailGroups,
      ]
    : headGroups;
  if (
    groups.slice(0, 5).every((group) => Number.parseInt(group, 16) === 0) &&
    groups[5] === 'ffff'
  ) {
    const high = Number.parseInt(groups[6], 16);
    const low = Number.parseInt(groups[7], 16);
    return `${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`;
  }
  return `${groups
    .slice(0, 4)
    .map((group) => group.padStart(4, '0'))
    .join(':')}::/64`;
}

/**
 * Bağlantı kapısı: adres başına hız ve eşzamanlı soket sınırı, toplam soket sınırı ve köken
 * izin listesi. Saf mantıktır; saat dışarıdan verilir. `installGuard` onu Node `http` sunucusuna bağlar.
 */
export class ConnectionGuard {
  private readonly buckets = new Map<string, { bucket: TokenBucket; seenAt: number }>();
  private readonly open = new Map<string, number>();
  private sockets = 0;
  private admissions = 0;
  private readonly rejected: Record<RejectReason, number> = {
    origin: 0,
    rate: 0,
    'address-sockets': 0,
    sockets: 0,
  };

  constructor(
    readonly settings: GuardSettings = DEFAULT_GUARD,
    private readonly now: () => number = () => performance.now(),
  ) {
    for (const value of [
      settings.maxSockets,
      settings.maxSocketsPerAddress,
      settings.requestsPerSecond,
      settings.requestBurst,
    ])
      if (!Number.isSafeInteger(value) || value < 1)
        throw new RangeError('Bağlantı sınırları pozitif tam sayı olmalı.');
    if (settings.origins.some((origin) => normalizeOrigin(origin) === null))
      throw new RangeError('Köken izin listesi geçersiz.');
    this.settings = {
      ...settings,
      origins: settings.origins.map((origin) => normalizeOrigin(origin)!),
    };
  }

  /** Eşleştirme gibi sıradan HTTP istekleri: köken ve hız denetlenir, soket sayılmaz. */
  admitRequest(address: string | undefined, origin: string | undefined): Verdict {
    return this.admit(address, origin, false);
  }

  /** WebSocket yükseltmesi: ek olarak eşzamanlı soket sınırları. `release` soket kapanınca çağrılır. */
  admitUpgrade(address: string | undefined, origin: string | undefined): Verdict {
    return this.admit(address, origin, true);
  }

  stats(): GuardStats {
    return { sockets: this.sockets, addresses: this.open.size, rejected: { ...this.rejected } };
  }

  private admit(
    address: string | undefined,
    origin: string | undefined,
    upgrade: boolean,
  ): Verdict {
    const { origins } = this.settings;
    if (
      origin !== undefined &&
      origins.length > 0 &&
      !origins.includes(normalizeOrigin(origin) ?? '')
    )
      return this.reject('origin', 403, 0);
    const key = addressKey(address);
    const at = this.now();
    const entry = this.bucketFor(key, at);
    if (entry === null) return this.reject('rate', 503, 5);
    if (!entry.bucket.take(at))
      return this.reject('rate', 429, Math.ceil(1 / this.settings.requestsPerSecond));
    entry.seenAt = at;
    if (!upgrade) return PASS;
    if (this.sockets >= this.settings.maxSockets) return this.reject('sockets', 503, 5);
    const held = this.open.get(key) ?? 0;
    if (held >= this.settings.maxSocketsPerAddress) return this.reject('address-sockets', 429, 5);
    this.open.set(key, held + 1);
    this.sockets++;
    let released = false;
    return {
      ok: true,
      release: () => {
        if (released) return;
        released = true;
        this.sockets--;
        const left = (this.open.get(key) ?? 1) - 1;
        if (left <= 0) this.open.delete(key);
        else this.open.set(key, left);
      },
    };
  }

  private bucketFor(key: string, at: number): { bucket: TokenBucket; seenAt: number } | null {
    if (++this.admissions % SWEEP_EVERY === 0) this.sweep(at);
    let entry = this.buckets.get(key);
    if (entry === undefined) {
      if (this.buckets.size >= MAX_TRACKED_ADDRESSES) {
        this.sweep(at);
        if (this.buckets.size >= MAX_TRACKED_ADDRESSES) return null;
      }
      entry = {
        bucket: new TokenBucket(this.settings.requestsPerSecond, this.settings.requestBurst, at),
        seenAt: at,
      };
      this.buckets.set(key, entry);
    }
    return entry;
  }

  /** Kovası dolup boşta kalan ve açık soketi olmayan adresler unutulur. */
  private sweep(at: number): void {
    const idleMs = Math.max(
      60_000,
      (this.settings.requestBurst / this.settings.requestsPerSecond) * 1000,
    );
    for (const [key, entry] of this.buckets) {
      if (at - entry.seenAt > idleMs && !this.open.has(key)) this.buckets.delete(key);
    }
  }

  private reject(
    reason: RejectReason,
    status: 403 | 429 | 503,
    retryAfterSeconds: number,
  ): Verdict {
    this.rejected[reason]++;
    return { ok: false, reason, status, retryAfterSeconds };
  }
}

const STATUS_TEXT = { 403: 'Forbidden', 429: 'Too Many Requests', 503: 'Service Unavailable' };

function remoteAddress(req: IncomingMessage, trustProxy: boolean): string | undefined {
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    const last = (Array.isArray(forwarded) ? forwarded.join(',') : forwarded)?.split(',').at(-1);
    if (last && isIP(last.trim()) !== 0) return last.trim();
  }
  return req.socket.remoteAddress;
}

function refuse(target: ServerResponse | Duplex, verdict: Extract<Verdict, { ok: false }>): void {
  const headers = ['Connection: close', 'Content-Length: 0'];
  if (verdict.retryAfterSeconds > 0) headers.push(`Retry-After: ${verdict.retryAfterSeconds}`);
  if ('writeHead' in target) {
    target.writeHead(verdict.status, {
      Connection: 'close',
      ...(verdict.retryAfterSeconds > 0 ? { 'Retry-After': verdict.retryAfterSeconds } : {}),
    });
    target.end();
    return;
  }
  target.write(
    `HTTP/1.1 ${verdict.status} ${STATUS_TEXT[verdict.status]}\r\n${headers.join('\r\n')}\r\n\r\n`,
  );
  target.destroy();
}

/**
 * Kapıyı `http` sunucusunun `request` ve `upgrade` olaylarının önüne koyar. Dinleyici sırasına
 * ya da Colyseus'un onları ne zaman eklediğine bağlı kalmamak için `emit` sarılır: reddedilen
 * istek hiçbir dinleyiciye ulaşmaz. Dönüş değeri sarmayı geri alır.
 */
export function installGuard(
  http: HttpServer,
  guard: ConnectionGuard,
  logger?: Logger,
): () => void {
  const emit = http.emit;
  const { trustProxy } = guard.settings;
  const previousMax = http.maxConnections as number | undefined;
  http.maxConnections = guard.settings.maxSockets * 4;
  const warned = new Set<string>();
  const note = (verdict: Extract<Verdict, { ok: false }>): void => {
    // Saldırı sırasında günlük şişmesin: neden başına bir kez, ayrıntı sayaçta.
    if (warned.has(verdict.reason)) return;
    warned.add(verdict.reason);
    logger?.warn('guard.rejected', {
      reason: verdict.reason,
      status: verdict.status,
    });
  };
  http.emit = function guardedEmit(this: HttpServer, event: string | symbol, ...args: unknown[]) {
    if (event === 'request') {
      const [req, res] = args as [IncomingMessage, ServerResponse];
      const address = remoteAddress(req, trustProxy);
      const verdict = guard.admitRequest(address, req.headers.origin);
      if (!verdict.ok) {
        note(verdict);
        refuse(res, verdict);
        return true;
      }
    } else if (event === 'upgrade') {
      const [req, socket] = args as [IncomingMessage, Duplex];
      const address = remoteAddress(req, trustProxy);
      const verdict = guard.admitUpgrade(address, req.headers.origin);
      if (!verdict.ok) {
        note(verdict);
        refuse(socket, verdict);
        return true;
      }
      socket.once('close', verdict.release);
    }
    return emit.call(this, event, ...args);
  } as typeof http.emit;
  return () => {
    http.emit = emit;
    http.maxConnections = previousMax as number;
  };
}
