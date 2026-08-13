import { enemyConfig } from '@/config/enemy';
import { difficultyConfig } from '@/config/difficulty';

/**
 * Oyunun anlık zorluk durumu.
 *
 * Düşman stat'ları burada MUTLAK değer olarak hesaplanmaz; yalnızca çarpan
 * üretilir ve bu çarpanlar düşmanın `StatBlock`'una modifier olarak girer.
 * İki paralel ölçekleme sistemi (config → EnemyStats ve DifficultyCalculator
 * → EnemyStats) yerine tek zincir: arketip taban stat'ı → modifier → sonuç.
 */
export interface DifficultyState {
  /** Düşman canı çarpanı — StatBlock'a `multiply` modifier olarak girer. */
  readonly healthMultiplier: number;
  /** Düşman hızı çarpanı — StatBlock'a `multiply` modifier olarak girer. */
  readonly speedMultiplier: number;
  /** Güncel spawn aralığı (ms) — entity stat'ı değil, spawn temposu. */
  readonly spawnIntervalMs: number;
  /** Güncel maksimum düşman sayısı. */
  readonly maxEnemies: number;
  /** Skor çarpanı — düşman değeri bunla çarpılır. */
  readonly scoreMultiplier: number;
}

/**
 * Geçen süreye göre zorluğu hesaplar.
 * İlk `rampMinutes` dakikada büyüme yarı hızda; sonrasında tam hızda devam eder.
 */
export function getDifficultyState(elapsedMs: number): DifficultyState {
  const minutes = Math.max(0, elapsedMs) / (60 * 1000);
  const ramped = Math.min(minutes, difficultyConfig.rampMinutes);
  const beyondRamp = Math.max(0, minutes - difficultyConfig.rampMinutes);

  const rampedFactor = ramped * difficultyConfig.rampSlowdownFactor;

  const healthMultiplier =
    1 +
    rampedFactor * difficultyConfig.healthGrowthPerMinute +
    beyondRamp * difficultyConfig.healthGrowthPerMinute;

  const speedMultiplier =
    1 +
    rampedFactor * difficultyConfig.speedGrowthPerMinute +
    beyondRamp * difficultyConfig.speedGrowthPerMinute;

  const spawnMultiplier = Math.max(
    difficultyConfig.minSpawnMultiplier,
    1 -
      (rampedFactor * difficultyConfig.spawnRateGrowthPerMinute +
        beyondRamp * difficultyConfig.spawnRateGrowthPerMinute),
  );

  const extraEnemies = Math.floor(
    rampedFactor * difficultyConfig.maxEnemiesGrowthPerMinute +
      beyondRamp * difficultyConfig.maxEnemiesGrowthPerMinute,
  );

  const scoreMultiplier =
    1 + (rampedFactor + beyondRamp) * difficultyConfig.scoreMultiplierPerMinute;

  return {
    healthMultiplier,
    speedMultiplier,
    spawnIntervalMs: Math.max(
      difficultyConfig.minSpawnIntervalMs,
      enemyConfig.spawnIntervalMs * spawnMultiplier,
    ),
    // Tavan sart: extraEnemies dakikada +4 buyuyor ve spawn araligi 200 ms'de
    // tabanlandigi icin uzun kosularda dusman sayisi sinirsiz artardi.
    maxEnemies: Math.min(difficultyConfig.maxEnemiesCap, enemyConfig.maxCount + extraEnemies),
    scoreMultiplier: Math.min(difficultyConfig.maxScoreMultiplier, scoreMultiplier),
  };
}
