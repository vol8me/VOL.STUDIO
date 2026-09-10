/**
 * Deterministik rastgelelik.
 *
 * `Math.random()` kullanımı build-time asset üretimini tekrarlanamaz hale
 * getirir: aynı üretim adımı her çalıştığında farklı çıktı verir, dosyalar
 * diff'lenemez ve hata raporları yeniden oluşturulamaz. Aynı seed her zaman
 * aynı sonucu verir.
 *
 * Bu modül oyun ve build-time asset compiler'lar tarafından paylaşılan
 * jenerik bir yardımcıdır; bu yüzden bağımsız bir namespace'te yaşar.
 */

/** Kaynak seed verilmediğinde kullanılan sabit — üretim varsayılan olarak deterministiktir. */
export const DEFAULT_SEED = 0x5eed;

export interface Random {
  /** [0, 1) aralığında sonraki değer. */
  next(): number;
  /** [-1, 1) aralığında sonraki değer — gürültü kaynakları için. */
  bipolar(): number;
}

/**
 * mulberry32: hızlı, kriptografik olmayan 32-bit PRNG. Her 32-bit tohum ayrı bir
 * dizidir, 0 dahil; varsayılan yalnız tohum verilmediğinde uygulanır. Sonlu
 * olmayan tohum `RangeError` fırlatır.
 */
export function createRandom(seed: number = DEFAULT_SEED): Random {
  if (!Number.isFinite(seed)) {
    throw new RangeError(`createRandom: tohum sonlu bir sayı olmalı, gelen: ${String(seed)}`);
  }
  let state = seed | 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    bipolar: () => next() * 2 - 1,
  };
}

/**
 * Bir string'den kararlı bir 32-bit seed üretir (FNV-1a).
 * Preset adından seed türetmek için: aynı ad her zaman aynı sesi verir.
 */
export function seedFromString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}
