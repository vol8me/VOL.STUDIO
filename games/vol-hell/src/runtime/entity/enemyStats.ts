import { StatBlock } from '@volstudio/core';
import type { HellStat, HellStatBlock } from '@/config/stats';
import { bulletConfig } from '@/config/bullet';
import type { EnemyDefinition } from '@/config/enemies/types';
import type { DifficultyState } from '@/runtime/systems/DifficultyCalculator';
import { MAX_RUNTIME_VALUE, nonNegativeFinite } from '@/runtime/utils/numeric';

/** Zorluk eğrisinin eklediği modifier'ların ortak kimliği. */
export const DIFFICULTY_MODIFIER_ID = 'difficulty';

/**
 * Bir düşmanın stat bloğunu kurar: arketip taban değerleri + zorluk çarpanları.
 *
 * Zorluk ölçeklemesi ayrı bir "hesaplanmış stat" nesnesi üretmez; doğrudan
 * `StatBlock`'a `multiply` modifier olarak girer. Böylece kart modifier'ları
 * ile zorluk eğrisi tek bir zincirde toplanır, iki paralel ölçekleme olmaz.
 *
 * Çarpanlar spawn ANINDA sabitlenir (fonksiyon değil sabit değer): bir düşman
 * doğduğu andaki zorlukla yaşar, zaman geçtikçe canı/hızı kendiliğinden artmaz.
 */
export function createEnemyStats(
  definition: EnemyDefinition,
  difficulty?: DifficultyState,
): HellStatBlock {
  const stats = new StatBlock<HellStat>(definition.baseStats);
  if (!difficulty) return stats;

  stats.addModifier({
    id: DIFFICULTY_MODIFIER_ID,
    stat: 'health',
    type: 'multiply',
    value: difficulty.healthMultiplier,
  });
  stats.addModifier({
    id: DIFFICULTY_MODIFIER_ID,
    stat: 'speed',
    type: 'multiply',
    value: difficulty.speedMultiplier,
  });

  return stats;
}

/**
 * Maksimum canı mermi hasarının katına yuvarlar — can barı her vuruşta
 * anlamlı hareket etsin ve "bir vuruşluk can" artığı kalmasın diye.
 * En az bir vuruşluk can garanti edilir.
 */
export function quantizeEnemyHealth(health: number): number {
  const step = bulletConfig.damage;
  const safeHealth = nonNegativeFinite(health, step);
  return Math.min(MAX_RUNTIME_VALUE, Math.max(step, Math.round(safeHealth / step) * step));
}
