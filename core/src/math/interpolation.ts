/**
 * Ara değer ve kelepçeleme. Hepsi SAF ve NaN/Infinity GEÇİRMEZ: bozuk bir
 * değerin konuma/cana sızması kaynağından çok sonra fark edilir.
 */

/** Sınırlar ters verilirse takas edilir. */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return Number.isFinite(min) ? min : 0;
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.min(hi, Math.max(lo, value));
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/** `t` KELEPÇELENMEZ; taşan `t` bilinçli ekstrapolasyon olabilir. */
export function lerp(a: number, b: number, t: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(t)) return a;
  return a + (b - a) * t;
}

/** `lerp`in tersi. Sıfır genişlikte aralık 0 döner. */
export function inverseLerp(a: number, b: number, value: number): number {
  const span = b - a;
  if (span === 0 || !Number.isFinite(span)) return 0;
  return (value - a) / span;
}

export function remap(
  value: number,
  fromMin: number,
  fromMax: number,
  toMin: number,
  toMax: number,
): number {
  return lerp(toMin, toMax, inverseLerp(fromMin, fromMax, value));
}

/**
 * Sabit hızla yaklaşır, hedefi AŞMAZ ve ona gerçekten ULAŞIR. `lerp` her karede
 * kalanın bir kısmını kapatır, yani teorik olarak hiç varmaz.
 */
export function approach(current: number, target: number, maxDelta: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(target)) return current;
  const step = Math.abs(maxDelta);
  if (Math.abs(target - current) <= step) return target;
  return current + Math.sign(target - current) * step;
}

/**
 * Kare hızından BAĞIMSIZ üstel yumuşatma — kamera takibi, HUD değeri, nişan
 * yumuşatma.
 *
 * Naif `lerp(current, target, 0.1)` her KAREDE aynı oranı uygular, yani 30 FPS
 * ile 144 FPS'te farklı hızda yumuşatır ve oyun hissi donanıma göre değişir.
 * Burada oran delta ile üstel olarak hesaplanır: aynı `smoothing`, farklı kare
 * hızlarında aynı sonucu verir.
 *
 * @param smoothing Kalan mesafenin bir SANİYEDE kapanan oranı, (0, 1].
 *   1 = anında.
 */
export function damp(current: number, target: number, smoothing: number, deltaMs: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(target)) return current;
  if (deltaMs <= 0) return current;

  const rate = clamp01(smoothing);
  if (rate >= 1) return target;
  if (rate <= 0) return current;

  const t = 1 - Math.pow(1 - rate, deltaMs / 1000);
  return lerp(current, target, t);
}

/**
 * Değeri bir aralığa sarar (wrap) — açı normalizasyonu, döngüsel indeks.
 * `max` dışlayıcıdır: `wrap(360, 0, 360) === 0`.
 */
export function wrap(value: number, min: number, max: number): number {
  const span = max - min;
  if (span <= 0 || !Number.isFinite(span) || !Number.isFinite(value)) return min;
  return ((((value - min) % span) + span) % span) + min;
}
