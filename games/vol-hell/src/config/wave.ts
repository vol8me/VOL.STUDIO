/**
 * Koşu (run) yapısı — dalga sayısı, dalga süresi ve özel dalga işaretleri.
 * Bir koşu `totalWaves * waveDurationMs` kadar sürer; zorluk eğrisi
 * (`difficultyConfig`) bu toplam süreye göre ayarlanmıştır.
 */
export const waveConfig = {
  /** Bir koşudaki toplam dalga sayısı. */
  totalWaves: 20,
  /** Her dalganın süresi (ms). */
  waveDurationMs: 40_000,
  /** Elite düşmanın çağrıldığı dalga — spawn'ı `SpecialEnemyDirector` yönetir. */
  eliteWave: 10,
  /** Boss'un çağrıldığı dalga — spawn'ı `SpecialEnemyDirector` yönetir. */
  bossWave: 20,
  /**
   * Tek frame'de atılabilecek maksimum dalga adımı. Uzun frame'de (sekme
   * arka plan, GC duraklaması) dalga zamanlayıcısının birden çok dalgayı
   * atlayarak koşuyu aniden bitirmesini önler.
   */
  maxStepsPerFrame: 50,
} as const;

/** Bir koşunun toplam süresi (ms) — 20 x 40 sn = 800 sn. */
export const WAVE_RUN_DURATION_MS = waveConfig.totalWaves * waveConfig.waveDurationMs;

export type WaveConfig = typeof waveConfig;
