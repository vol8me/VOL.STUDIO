import { describe, it, expect } from 'vitest';
import { enemyConfig } from '@/config/enemy';
import { bulletConfig } from '@/config/bullet';
import { difficultyConfig } from '@/config/difficulty';
import { ENEMY_CATALOG } from '@/config/enemies/catalog';
import { getDifficultyState } from '@/runtime/systems/DifficultyCalculator';
import { createEnemyStats, quantizeEnemyHealth } from '@/runtime/entity/enemyStats';

/**
 * StatBlock refaktörünün DAVRANIŞI DEĞİŞTİRMEDİĞİNİ kilitler.
 *
 * `legacyEnemyStats`, refaktör öncesi zincirin birebir kopyasıdır:
 * DifficultyCalculator mutlak değer üretiyor, EnemyManager bunu
 * `EnemyStats`'e enjekte ediyor, canı mermi hasarına yuvarlıyordu.
 * Yeni zincir (arketip taban stat -> zorluk modifier -> StatBlock) aynı
 * sayıyı vermek zorunda.
 */
function legacyEnemyStats(elapsedMs: number): { health: number; speed: number } {
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

  const scaledHealth = enemyConfig.health * healthMultiplier;

  return {
    health: Math.round(scaledHealth / bulletConfig.damage) * bulletConfig.damage,
    speed: enemyConfig.speed * speedMultiplier,
  };
}

const SAMPLE_TIMES_MS = [0, 1_000, 15_000, 40_000, 120_000, 400_000, 800_000, 1_800_000];

describe('düşman stat zinciri — refaktör regresyonu', () => {
  it('temel arketip, eski sistemle aynı can ve hızı üretir', () => {
    for (const elapsedMs of SAMPLE_TIMES_MS) {
      const legacy = legacyEnemyStats(elapsedMs);
      const stats = createEnemyStats(ENEMY_CATALOG.grunt, getDifficultyState(elapsedMs));

      expect(quantizeEnemyHealth(stats.getValue('health')), `health @${elapsedMs}ms`).toBe(
        legacy.health,
      );
      expect(stats.getValue('speed'), `speed @${elapsedMs}ms`).toBeCloseTo(legacy.speed, 9);
    }
  });

  it('zorluk verilmezse taban değerler aynen kalır', () => {
    const stats = createEnemyStats(ENEMY_CATALOG.grunt);
    expect(stats.getValue('health')).toBe(enemyConfig.health);
    expect(stats.getValue('speed')).toBe(enemyConfig.speed);
    expect(stats.getValue('damage')).toBe(enemyConfig.contactDamage);
    expect(stats.getValue('fireRate')).toBe(enemyConfig.contactDamageCooldownMs);
  });

  it('zorluk modifier’ı tek kimlik altında toplanır — kaldırılınca taban dönülür', () => {
    const stats = createEnemyStats(ENEMY_CATALOG.grunt, getDifficultyState(600_000));
    expect(stats.getValue('health')).toBeGreaterThan(enemyConfig.health);

    expect(stats.removeModifier('difficulty')).toBe(2);
    expect(stats.getValue('health')).toBe(enemyConfig.health);
    expect(stats.getValue('speed')).toBe(enemyConfig.speed);
  });

  it('spawn anındaki çarpan sabitlenir — düşman zamanla kendiliğinden güçlenmez', () => {
    const stats = createEnemyStats(ENEMY_CATALOG.grunt, getDifficultyState(60_000));
    const first = stats.getValue('health');
    // Aynı blok daha sonra tekrar okunduğunda değer değişmemeli.
    expect(stats.getValue('health')).toBe(first);
  });

  it('quantizeEnemyHealth canı mermi hasarının katına yuvarlar ve en az bir vuruş bırakır', () => {
    expect(quantizeEnemyHealth(50) % bulletConfig.damage).toBe(0);
    expect(quantizeEnemyHealth(63) % bulletConfig.damage).toBe(0);
    expect(quantizeEnemyHealth(1)).toBe(bulletConfig.damage);
    expect(quantizeEnemyHealth(0)).toBe(bulletConfig.damage);
  });
});
