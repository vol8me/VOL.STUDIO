/** Oyun sayaçlarının güvenle taşıyabileceği üst sınır. */
export const MAX_RUNTIME_VALUE = Number.MAX_SAFE_INTEGER;

/** Sonlu değilse yedek değeri döndürür. */
export function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : Number.isFinite(fallback) ? fallback : 0;
}

/** Sonlu ve negatif olmayan değer; aksi hâlde yedek. */
export function nonNegativeFinite(value: number, fallback = 0): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** Sonlu değeri aralığa kelepçeler; geçersiz değer yedeğe düşer. */
export function clampFinite(value: number, min: number, max: number, fallback: number): number {
  const safeFallback = Number.isFinite(fallback) ? Math.min(max, Math.max(min, fallback)) : min;
  if (!Number.isFinite(value)) return safeFallback;
  return Math.min(max, Math.max(min, value));
}

/** Frame süresini negatif/sonsuz delta'nın simülasyonu bozmasını engeller. */
export function safeDeltaMs(value: number, max = MAX_RUNTIME_VALUE): number {
  return clampFinite(value, 0, max, 0);
}

/** Sayaç eklemesini overflow'a karşı doyurur. */
export function saturatingAdd(current: number, amount: number, max = MAX_RUNTIME_VALUE): number {
  const base = clampFinite(current, 0, max, 0);
  const increment = nonNegativeFinite(amount);
  return Math.min(max, base + increment);
}

/** İşaretli sayaçları iki güvenli sınır arasında doyurarak toplar. */
export function saturatingAddSigned(
  current: number,
  amount: number,
  min = -MAX_RUNTIME_VALUE,
  max = MAX_RUNTIME_VALUE,
): number {
  const base = clampFinite(current, min, max, 0);
  if (!Number.isFinite(amount)) return base;

  const next = base + amount;
  if (Number.isFinite(next)) return Math.min(max, Math.max(min, next));
  return amount > 0 ? max : min;
}

/** İki bileşenin güvenli, sıfırdan farklı bir yön oluşturup oluşturmadığı. */
export function hasFiniteDirection(x: number, y: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y) && Math.hypot(x, y) > 0;
}
