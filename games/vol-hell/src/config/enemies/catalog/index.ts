import type { Random } from '@volstudio/core';
import type { EnemyDefinition, FindEnemiesQuery } from '../types';
import { BASE_ENEMIES } from './base';
import { RUSHER_ENEMIES } from './rusher';
import { SWARMER_ENEMIES } from './swarmer';

/**
 * Tüm düşman tanımlarının keşfedilebilir kataloğu.
 *
 * Arketip başına ayrı dosya: yeni bir düşman eklerken tanımının nereye
 * yazılacağı aranmaz. (Ses preset kataloğuyla aynı desen.)
 */
export const ENEMY_CATALOG: Record<string, EnemyDefinition> = {
  ...BASE_ENEMIES,
  ...RUSHER_ENEMIES,
  ...SWARMER_ENEMIES,
};

/** Katalogda tanımlı düşman kimlikleri. */
export type EnemyId = keyof typeof ENEMY_CATALOG;

/** Katalog içinde düşman arar; sorgu alanları AND ile birleşir. */
export function findEnemies(query: FindEnemiesQuery = {}): string[] {
  return Object.entries(ENEMY_CATALOG)
    .filter(([, definition]) => {
      if (query.archetype && definition.archetype !== query.archetype) return false;
      if (query.tags && !query.tags.some((tag) => definition.tags.includes(tag))) return false;
      if (query.spawnableOnly && definition.spawnWeight <= 0) return false;
      if (query.wave !== undefined && definition.minWave > query.wave) return false;
      return true;
    })
    .map(([id]) => id);
}

/** Tanımı kimliğe göre getirir; bilinmeyen kimlikte hata fırlatır. */
export function getEnemyDefinition(id: string): EnemyDefinition {
  const definition = ENEMY_CATALOG[id];
  if (!definition) {
    throw new Error(`[ENEMY_CATALOG] Bilinmeyen düşman kimliği: ${id}`);
  }
  return definition;
}

/**
 * Verilen dalgada spawn edilebilen tanımlar arasından ağırlıklı seçim yapar.
 * Seçim seed'li PRNG ile yapılır — aynı seed aynı koşuyu verir.
 * Uygun tanım yoksa null döner.
 */
export function pickEnemyDefinition(random: Random, wave: number): EnemyDefinition | null {
  const candidates = findEnemies({ wave, spawnableOnly: true }).map((id) => ENEMY_CATALOG[id]);
  if (candidates.length === 0) return null;

  let totalWeight = 0;
  for (const definition of candidates) {
    totalWeight += definition.spawnWeight;
  }
  if (totalWeight <= 0) return null;

  let roll = random.next() * totalWeight;
  for (const definition of candidates) {
    roll -= definition.spawnWeight;
    if (roll <= 0) return definition;
  }
  // Kayan nokta artığı son adımda eşiği geçiremezse son uygun tanıma düş.
  return candidates[candidates.length - 1];
}

/**
 * Katalogdaki en büyük düşman yarıçapı — spatial grid hücre boyutu bunu
 * kullanır, yoksa iri düşmanlar komşu hücre taramasından kaçabilir.
 */
export function getMaxEnemyRadius(): number {
  let max = 0;
  for (const definition of Object.values(ENEMY_CATALOG)) {
    if (definition.radius > max) max = definition.radius;
  }
  return max;
}
