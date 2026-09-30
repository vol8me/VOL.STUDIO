import { hashCanonical, type Sha256 } from '../kernel/canonical';

/**
 * Render ara sonuçlarının içerik adresli önbelleği. Anahtar, çıktıyı
 * belirleyen her şeyin kanonik özetidir; aynı anahtar aynı PCM demektir.
 * Okuma ve yazma KOPYA üzerinden yapılır: zincir düğümleri tamponu yerinde
 * değiştirir ve önbellekteki örnek hiçbir çağırana ödünç verilmez.
 */
export interface RenderCache {
  read(key: Sha256): Float32Array[] | undefined;
  write(key: Sha256, channels: readonly Float32Array[]): void;
  readonly stats: RenderCacheStats;
}

export interface RenderCacheStats {
  hits: number;
  misses: number;
  writes: number;
  evictions: number;
  /** Tek girdi sınırını aştığı için saklanmayan sonuçlar. */
  skipped: number;
  /** Disk hatası yüzünden yazılamayan girdiler; render etkilenmez. */
  failures: number;
}

export function emptyStats(): RenderCacheStats {
  return { hits: 0, misses: 0, writes: 0, evictions: 0, skipped: 0, failures: 0 };
}

function copyChannels(channels: readonly Float32Array[]): Float32Array[] {
  return channels.map((channel) => channel.slice());
}

export function channelBytes(channels: readonly Float32Array[]): number {
  return channels.reduce((sum, channel) => sum + channel.byteLength, 0);
}

function isPlain(value: object): boolean {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Yalnız dizi ve düz nesneye iner; tip dizisi gibi değerler olduğu gibi kalır ve özet onları reddeder. */
function jsonSafe(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value !== null && typeof value === 'object' && isPlain(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) out[key] = jsonSafe(item);
    }
    return out;
  }
  return value;
}

/** Tanımsız alanları atarak anahtar üretir; sonlu olmayan sayı ve düz olmayan nesne yine reddedilir. */
export function cacheKey(value: unknown): Sha256 {
  return hashCanonical(jsonSafe(value));
}

export interface MemoryCacheOptions {
  readonly maxBytes: number;
  readonly maxEntryBytes?: number;
}

/** Süreç içi, bayt sınırlı, en az yakın zamanda kullanılanı atan önbellek. */
export class MemoryRenderCache implements RenderCache {
  readonly stats = emptyStats();
  private readonly entries = new Map<Sha256, Float32Array[]>();
  private bytes = 0;
  private readonly maxBytes: number;
  private readonly maxEntryBytes: number;

  constructor(options: MemoryCacheOptions) {
    this.maxBytes = options.maxBytes;
    this.maxEntryBytes = options.maxEntryBytes ?? options.maxBytes;
  }

  read(key: Sha256): Float32Array[] | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.stats.hits++;
    return copyChannels(entry);
  }

  write(key: Sha256, channels: readonly Float32Array[]): void {
    const size = channelBytes(channels);
    if (size > this.maxEntryBytes) {
      this.stats.skipped++;
      return;
    }
    const existing = this.entries.get(key);
    if (existing) {
      this.bytes -= channelBytes(existing);
      this.entries.delete(key);
    }
    this.entries.set(key, copyChannels(channels));
    this.bytes += size;
    this.stats.writes++;
    for (const [oldest, entry] of this.entries) {
      if (this.bytes <= this.maxBytes) break;
      this.entries.delete(oldest);
      this.bytes -= channelBytes(entry);
      this.stats.evictions++;
    }
  }

  get size(): number {
    return this.entries.size;
  }

  get byteSize(): number {
    return this.bytes;
  }
}
