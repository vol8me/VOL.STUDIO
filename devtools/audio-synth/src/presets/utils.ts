/**
 * Preset yardımcıları.
 *
 * Her iki helper perdeye göre filtre kesimi verir; sabit kesim yalnızca bir
 * oktavda doğru sonuç verir. Burada toplanıp tek bir kaynakta yaşarlar.
 */

/** Enstrümanın ulaşması gereken en üst kısmi tona göre lowpass tavanı. */
export function reach(frequency: number, harmonic: number, floorHz: number): number {
  return Math.min(20000, Math.max(floorHz, frequency * harmonic));
}

/** Temelin altında kalmaya zorlanan highpass kesimi — pes kayıtta temeli yutmamak için. */
export function belowFundamental(frequency: number, ceilingHz: number): number {
  return Math.min(ceilingHz, frequency * 0.5);
}
