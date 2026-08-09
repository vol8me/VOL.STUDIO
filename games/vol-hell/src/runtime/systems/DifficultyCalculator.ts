import { enemyConfig } from '@/config/enemy';
import { difficultyConfig } from '@/config/difficulty';

/** Oyunun anlık zorluk durumu. */
export interface DifficultyState {
  /** Güncel düşman sağlığı (scale uygulanmış). */
  readonly enemyHealth: number;
  /** Güncel düşman hızı (scale uygulanmış). */
  readonly enemySpeed: number;
  /** Güncel spawn aralığı (ms). */
  readonly spawnIntervalMs: number;
  /** Güncel maksimum düşman sayısı. */
  readonly maxEnemies: number;
  /** Skor çarpanı — düşman değeri bunla çarpılır. */
  readonly scoreMultiplier: number;
}

/** Zaman çarpanını hiçbir zaman bu alt sınırın altına düşürmeme. */
const MIN_SPAWN_MULTIPLIER = 0.15;
/** Spawn aralığı için mutlak alt sınır (ms). */
const MIN_SPAWN_INTERVAL_MS = 200;

/**
 * Geçen süreye göre zorluğu hesaplar.
 * İlk `rampMinutes` dakikada büyüme yarı hızda; sonrasında tam hızda devam eder.
 */
export function getDifficultyState(elapsedMs: number): DifficultyState {
  const minutes = Math.max(0, elapsedMs) / (60 * 1000);
  const ramped = Math.min(minutes, difficultyConfig.rampMinutes);
  const beyondRamp = Math.max(0, minutes - difficultyConfig.rampMinutes);

  const rampedFactor = ramped * 0.5;

  const healthMultiplier =
    1 +
    rampedFactor * difficultyConfig.healthGrowthPerMinute +
    beyondRamp * difficultyConfig.healthGrowthPerMinute;

  const speedMultiplier =
    1 +
    rampedFactor * difficultyConfig.speedGrowthPerMinute +
    beyondRamp * difficultyConfig.speedGrowthPerMinute;

  const spawnMultiplier = Math.max(
    MIN_SPAWN_MULTIPLIER,
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
    enemyHealth: enemyConfig.health * healthMultiplier,
    enemySpeed: enemyConfig.speed * speedMultiplier,
    spawnIntervalMs: Math.max(MIN_SPAWN_INTERVAL_MS, enemyConfig.spawnIntervalMs * spawnMultiplier),
    maxEnemies: enemyConfig.maxCount + extraEnemies,
    scoreMultiplier,
  };
}
