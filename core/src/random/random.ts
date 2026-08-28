/**
 * Deterministik rastgelelik.
 *
 * Sentez `Math.random()` kullanıyordu; bu, build-time asset üretimini
 * tekrarlanamaz hale getiriyordu: `generate:sounds` her çalıştığında farklı WAV
 * üretiyor, üretilen dosyalar diff'lenemiyor ve bir hata raporu yeniden
 * oluşturulamıyordu. Aynı seed her zaman aynı sesi verir.
 *
 * Bu modül ses sentezinde doğdu ama motor geneli bir yardımcıdır — oyun
 * tarafı da (spawn, davranış, kart RNG'si) aynı uygulamayı kullanır. Bu
 * yüzden `devtools/audio-synth/src/` yerine burada, bağımsız bir namespace'te
 * yaşar.
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
 * mulberry32 — 32-bit durumlu, hızlı ve istatistiksel olarak yeterli bir PRNG.
 * Ses gürültüsü için kriptografik kalite gerekmez; tekrarlanabilirlik ve düzgün
 * dağılım yeterlidir.
 */
export function createRandom(seed: number = DEFAULT_SEED): Random {
  // Seed 0 mulberry32'yi dejenere bir diziye sokar; sıfır olmayan bir değere taşı.
  let state = (seed | 0) === 0 ? DEFAULT_SEED : seed | 0;

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
