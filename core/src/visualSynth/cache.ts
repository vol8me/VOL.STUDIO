/**
 * Görsel render için bounded LRU cache.
 *
 * Bu cache motor içinde global değildir. Çağıran açıkça bir örnek verir ve
 * bütçesini seçer; böylece Asset Studio, CLI ve oyun aynı süreçte birbirinin
 * belleğini görünmezce tüketmez. Saklanan sonuçlar iki kez kopyalanır:
 * girişte cache sahipliği, çıkışta çağıran sahipliği korunur.
 */

import type { ResolvedPalette } from './color/palette';
import type { NormalChannel } from './shade/normal';
import type { RenderResult } from './render';

export interface RenderCacheOptions {
  /** Varsayılan: 64 MiB. */
  readonly maxBytes?: number;
  /** Varsayılan: 32 sonuç. */
  readonly maxEntries?: number;
}

export interface RenderCacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly entries: number;
  readonly bytes: number;
  readonly maxBytes: number;
  readonly maxEntries: number;
  /** Cache sahipliği ile çağıran sahipliği arasında kopyalanan mantıksal byte. */
  readonly copyBytes: number;
  /** `set` ve başarılı `get` kopyalarının toplamı. */
  readonly copyOperations: number;
}

interface CacheEntry {
  readonly result: RenderResult;
  readonly bytes: number;
}

const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 32;

function cloneNormal(normal: NormalChannel | null): NormalChannel | null {
  if (!normal) return null;
  return {
    x: new Float32Array(normal.x),
    y: new Float32Array(normal.y),
    z: new Float32Array(normal.z),
  };
}

function clonePalette(palette: ResolvedPalette): ResolvedPalette {
  return {
    rgb: new Uint8Array(palette.rgb),
    colorCount: palette.colorCount,
    ramps: new Map([...palette.ramps].map(([id, indices]) => [id, [...indices]])),
    packed: new Set(palette.packed),
  };
}

function cloneResult(result: RenderResult, onCopy?: (bytes: number) => void): RenderResult {
  onCopy?.(estimateRenderResultBytes(result));
  return {
    width: result.width,
    height: result.height,
    rgba: new Uint8ClampedArray(result.rgba),
    channels: {
      coverage: new Float32Array(result.channels.coverage),
      height: new Float32Array(result.channels.height),
      material: new Uint8Array(result.channels.material),
    },
    shade: new Float32Array(result.shade),
    normal: cloneNormal(result.normal),
    outline: result.outline ? new Uint8Array(result.outline) : null,
    glow: result.glow ? new Float32Array(result.glow) : null,
    palette: clonePalette(result.palette),
    diagnostics: {
      scatters: result.diagnostics.scatters.map((diagnostic) => ({ ...diagnostic })),
    },
    profile: result.profile ? { ...result.profile } : null,
    doc: JSON.parse(JSON.stringify(result.doc)) as RenderResult['doc'],
  };
}

/** Typed array + serileştirilebilir metadata için mantıksal cache boyutu. */
export function estimateRenderResultBytes(result: RenderResult): number {
  let bytes = result.rgba.byteLength;
  bytes += result.channels.coverage.byteLength;
  bytes += result.channels.height.byteLength;
  bytes += result.channels.material.byteLength;
  bytes += result.shade.byteLength;
  if (result.normal) {
    bytes += result.normal.x.byteLength + result.normal.y.byteLength + result.normal.z.byteLength;
  }
  if (result.outline) bytes += result.outline.byteLength;
  if (result.glow) bytes += result.glow.byteLength;
  bytes += result.palette.rgb.byteLength;
  for (const indices of result.palette.ramps.values()) bytes += indices.length;
  // JSON metni UTF-16 bellekte yaklaşık iki bayt/karakter tutar; typed array
  // dışındaki belge ve teşhis yükünü de bütçeye dahil etmezsek küçük bir cache
  // girdisi bile beklenmedik biçimde büyüyebilir.
  bytes += JSON.stringify(result.doc).length * 2;
  bytes += JSON.stringify(result.diagnostics).length * 2;
  return bytes;
}

export class RenderCache {
  readonly #entries = new Map<string, CacheEntry>();
  readonly #maxBytes: number;
  readonly #maxEntries: number;
  #bytes = 0;
  #hits = 0;
  #misses = 0;
  #evictions = 0;
  #copyBytes = 0;
  #copyOperations = 0;

  constructor(options: RenderCacheOptions = {}) {
    this.#maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.#maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    if (!Number.isSafeInteger(this.#maxBytes) || this.#maxBytes < 1) {
      throw new Error('Görsel cache maxBytes pozitif güvenli bir tam sayı olmalı');
    }
    if (!Number.isSafeInteger(this.#maxEntries) || this.#maxEntries < 1) {
      throw new Error('Görsel cache maxEntries pozitif güvenli bir tam sayı olmalı');
    }
  }

  get(key: string): RenderResult | null {
    const entry = this.#entries.get(key);
    if (!entry) {
      this.#misses++;
      return null;
    }
    this.#hits++;
    // Map insertion sırası LRU sırasıdır.
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return cloneResult(entry.result, (bytes) => {
      this.#copyBytes += bytes;
      this.#copyOperations++;
    });
  }

  set(key: string, result: RenderResult): void {
    const snapshot = cloneResult(result, (copiedBytes) => {
      this.#copyBytes += copiedBytes;
      this.#copyOperations++;
    });
    const bytes = estimateRenderResultBytes(snapshot);
    if (bytes > this.#maxBytes) return;

    const old = this.#entries.get(key);
    if (old) {
      this.#bytes -= old.bytes;
      this.#entries.delete(key);
    }
    this.#entries.set(key, { result: snapshot, bytes });
    this.#bytes += bytes;

    while (this.#entries.size > this.#maxEntries || this.#bytes > this.#maxBytes) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) break;
      const evicted = this.#entries.get(oldest)!;
      this.#entries.delete(oldest);
      this.#bytes -= evicted.bytes;
      this.#evictions++;
    }
  }

  clear(): void {
    this.#entries.clear();
    this.#bytes = 0;
  }

  get stats(): RenderCacheStats {
    return {
      hits: this.#hits,
      misses: this.#misses,
      evictions: this.#evictions,
      entries: this.#entries.size,
      bytes: this.#bytes,
      maxBytes: this.#maxBytes,
      maxEntries: this.#maxEntries,
      copyBytes: this.#copyBytes,
      copyOperations: this.#copyOperations,
    };
  }
}

/** Anahtar sürüm numarası cache formatı değişince eski girdileri ayırır. */
export function createRenderCacheKey(
  doc: RenderResult['doc'],
  width: number,
  height: number,
  seed: number,
  region?: { readonly x: number; readonly y: number },
): string {
  return JSON.stringify({
    version: 1,
    doc,
    width,
    height,
    seed,
    region: region ?? null,
  });
}
