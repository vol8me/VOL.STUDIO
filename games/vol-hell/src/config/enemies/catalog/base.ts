import { enemyConfig } from '@/config/enemy';
import type { EnemyDefinition } from '../types';

/**
 * Temel arketip — oyuncuya doğrudan yürüyen klasik düşman.
 *
 * Taban değerler `enemyConfig`'ten okunur: "base arketipi = bugünkü düşman"
 * eşitliği kopyalanmış sayılarla değil, tek kaynakla korunur.
 */
export const BASE_ENEMIES: Record<string, EnemyDefinition> = {
  grunt: {
    id: 'grunt',
    archetype: 'base',
    displayName: 'Grunt',
    description: 'Oyuncuya doğrudan yürür, temasla hasar verir. Referans düşman.',
    tags: ['melee', 'starter', 'chaser'],
    baseStats: {
      damage: enemyConfig.contactDamage,
      speed: enemyConfig.speed,
      health: enemyConfig.health,
      fireRate: enemyConfig.contactDamageCooldownMs,
    },
    radius: enemyConfig.radius,
    color: enemyConfig.color,
    strokeColor: enemyConfig.strokeColor,
    scoreValue: enemyConfig.scoreValue,
    sparkReward: 3,
    fluxReward: 1,
    minWave: 1,
    spawnWeight: 6,
  },

  swarmling: {
    id: 'swarmling',
    archetype: 'base',
    displayName: 'Swarmling',
    description: 'Swarmer’ın doğurduğu küçük ve hızlı minion. Dalga havuzunda yer almaz.',
    tags: ['melee', 'minion', 'fast'],
    baseStats: {
      damage: 6,
      speed: 130,
      health: 20,
      fireRate: 500,
    },
    radius: 8,
    color: 0xcc66aa,
    strokeColor: 0xffaadd,
    scoreValue: 25,
    sparkReward: 1,
    // Minion Flux düşürmez; yoksa swarmer sonsuz Flux musluğuna dönüşür.
    fluxReward: 0,
    minWave: 1,
    spawnWeight: 0,
  },
};
