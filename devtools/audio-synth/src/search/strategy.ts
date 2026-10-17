import { substream } from '../program/random';

/**
 * Deterministik uzay doldurma stratejisi. Seçim gerekçesi (DESIGN "Arama
 * stratejisi"): Latin hypercube aday sayısı N'ye bağlıdır — N değişince
 * bütün noktalar değişir; Sobol yön sayısı tablosu ister ve küçük N'de
 * ilk boyutlar eşleşir. Halton öneki kararlıdır (k. aday N'den bağımsız),
 * tablo istemez ve ≤ 8 boyutta düşük uyumsuzluk verir. Yüksek tabanlardaki
 * bilinen boyutlar-arası ilinti, taban başına tohum + boyut adından türeyen
 * basamak permütasyonuyla (0 sabit; Faure/Braaten–Weller çizgisi) kırılır;
 * tohum ayrıca rastgele bir başlangıç indeksi seçer (Wang–Hickernell), böylece
 * permütasyonu olmayan taban 2 de tohuma bağlıdır. Ardışık her p^k indeks
 * bütün kalıntıları kapsadığından tabakalama korunur.
 *
 * Optimizasyon, Bayesçi arama, genetik algoritma ya da estetik puan YOKTUR:
 * strateji yalnız noktaları üretir, sonucu okumaz.
 */
export const SEARCH_STRATEGIES = {
  'scrambled-halton': { version: 1, maxDimensions: 8 },
} as const;
export type SearchStrategyId = keyof typeof SEARCH_STRATEGIES;

const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19] as const;
const START_RANGE = 1 << 20;

/** Tohum + boyut ADINDAN türeyen basamak permütasyonu; 0 → 0 sabit (Fisher–Yates 1…p−1). */
function digitPermutation(seed: number, name: string, base: number): number[] {
  const random = substream(seed, `search:scrambled-halton-v1/dimension:${name}`);
  const digits = Array.from({ length: base }, (_, i) => i);
  for (let i = base - 1; i > 1; i--) {
    const j = 1 + Math.min(i - 1, Math.floor(random.next() * i));
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }
  return digits;
}

function scrambledInverse(index: number, base: number, perm: readonly number[]): number {
  let value = 0;
  let scale = 1 / base;
  let n = index;
  while (n > 0) {
    value += perm[n % base] * scale;
    n = Math.floor(n / base);
    scale /= base;
  }
  return value;
}

/**
 * `count` noktanın birim küp koordinatları. Boyutlar ADLARIYLA verilir ve
 * çağıran onları ad sırasına dizmiş olmalıdır; k. nokta (başlangıç + k + 1)
 * indeksinden üretilir, dolayısıyla aday sayısını büyütmek önceki adayları
 * değiştirmez.
 */
export function strategyPoints(seed: number, names: readonly string[], count: number): number[][] {
  if (names.length > PRIMES.length) throw new RangeError(`en çok ${PRIMES.length} boyut`);
  const start = Math.floor(
    substream(seed, 'search:scrambled-halton-v1/start').next() * START_RANGE,
  );
  const perms = names.map((name, d) => digitPermutation(seed, name, PRIMES[d]));
  return Array.from({ length: count }, (_, k) =>
    names.map((_, d) => scrambledInverse(start + k + 1, PRIMES[d], perms[d])),
  );
}
