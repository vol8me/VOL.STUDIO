/**
 * Elite (Warden) davranış sabitleri.
 *
 * Elite'in stat'ları ve rusher/swarmer parametreleri `ENEMY_CATALOG` içindeki
 * `warden` tanımındadır; burada yalnızca kontrolcüye ait, katalogda karşılığı
 * olmayan değerler durur.
 */
export const eliteConfig = {
  /** Atılım telegraph koridorunun genişliği — elite yarıçapının katı. */
  dashTelegraphWidthRatio: 2.2,
  /** Minion doğurmadan önceki uyarı süresi (ms). */
  spawnTelegraphMs: 620,
  /** Doğurma uyarı dairesinin doğum yarıçapına eklediği pay (piksel). */
  spawnTelegraphPaddingPx: 14,
} as const;
