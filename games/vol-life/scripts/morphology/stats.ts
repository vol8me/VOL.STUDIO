/**
 * Morfoloji katmanının ortak sıra istatistikleri.
 *
 * `percentile` burada yaşar çünkü iki ayrı tanımı olamaz: küme boyutu dağılımı
 * (`metrics`) ile başlangıç sağkalımının "en kötü ondalık dilim"i (`startupSurvival`)
 * aynı kelimeyi kullanır. Tanım nearest-rank'tir, interpolasyonlu değil.
 */

/** Girdi ARTAN sıralı olmalı; sıralamayı çağıran yapar. */
export function percentile(sorted: readonly number[], ratio: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

export function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return percentile(
    [...values].sort((a, b) => a - b),
    0.5,
  );
}
