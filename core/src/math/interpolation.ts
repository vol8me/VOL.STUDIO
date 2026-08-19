/**
 * Sayısal ara değer ve kelepçeleme yardımcıları.
 *
 * Hepsi saf fonksiyondur ve NaN/Infinity geçirmez: bozuk bir değerin oyun
 * durumuna sızıp konumu/canı `NaN`e çevirmesi, kaynağı çok sonra fark edilen
 * bir hata biçimidir.
 */

/** Değeri [min, max] aralığına kelepçeler. Sınırlar ters verilirse takas edilir. */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return Number.isFinite(min) ? min : 0;
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.min(hi, Math.max(lo, value));
}

/** Değeri [0, 1] aralığına kelepçeler. */
export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/**
 * `a` ile `b` arasında doğrusal ara değer. `t` kelepçelenmez — dışarı taşan
 * `t` bilinçli bir ekstrapolasyon olabilir; kelepçe isteyen `clamp01` ile
 * sarar.
 */
export function lerp(a: number, b: number, t: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(t)) return a;
  return a + (b - a) * t;
}

/**
 * `lerp`in tersi: `value`nun `a`-`b` aralığındaki oranı. Aralık sıfır
 * genişlikteyse 0 döner (sıfıra bölme yok).
 */
export function inverseLerp(a: number, b: number, value: number): number {
  const span = b - a;
  if (span === 0 || !Number.isFinite(span)) return 0;
  return (value - a) / span;
}

/** Bir aralıktaki değeri başka bir aralığa eşler. */
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
 * `current`ı `target`a doğru en fazla `maxDelta` kadar yaklaştırır ve hedefi
 * AŞMAZ.
 *
 * `lerp`ten farkı: sabit hızlı yaklaşmadır ve hedefe gerçekten ULAŞIR.
 * `lerp(current, target, 0.1)` her karede kalan mesafenin bir kısmını kapatır,
 * yani teorik olarak hiç varmaz ve bir eşitlik kontrolü asla tutmaz.
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
