/**
 * Zorluk eğrisi — vol.hell tempolu ve kısa süreli bir hayatta kalma oyunu.
 *
 * Büyüme oranları koşunun TOPLAM SÜRESİNE göre ayarlanır: 20 dalga x 40 sn =
 * ~13,3 dakika (bkz. `waveConfig`). Süresiz koşuya göre kalibre edilmiş eski
 * oranlar (can %18/dk, hız %15/dk) bu pencerede düşmanı oyuncudan hızlı
 * yapıyordu — kaçış imkânsız hale geliyordu.
 */
export const difficultyConfig = {
  /** Düşman canı her dakika %14 artar — koşu sonunda ~2,8x. */
  healthGrowthPerMinute: 0.14,
  /** Düşman hızı her dakika %7 artar — koşu sonunda ~1,9x, oyuncunun altında kalır. */
  speedGrowthPerMinute: 0.07,
  /** Spawn aralığı her dakika %18 kısalır. */
  spawnRateGrowthPerMinute: 0.18,
  /** Maksimum düşman sayısı her dakika +4 artar. */
  maxEnemiesGrowthPerMinute: 4,
  /** Skor, düşmanların ne kadar "zor" olduğuna göre çarpılır. */
  scoreMultiplierPerMinute: 0.1,
  /** İlk yarım dakikada büyüme daha yavaş başlar; sonrasında tam gaz devam eder. */
  rampMinutes: 0.5,
  /** Ramp süresince büyüme bu oranla yavaşlar (0.5 = yarı hız). */
  rampSlowdownFactor: 0.5,
  /** Spawn aralığı çarpanının alt sınırı — bunun altına inmez. */
  minSpawnMultiplier: 0.15,
  /** Spawn aralığı için mutlak alt sınır (ms). */
  minSpawnIntervalMs: 200,
  /** Eşzamanlı düşman sayısı tavanı — performans koruması. */
  maxEnemiesCap: 80,
  /** Skor çarpanı tavanı. */
  maxScoreMultiplier: 8,
} as const;

export type DifficultyConfig = typeof difficultyConfig;
