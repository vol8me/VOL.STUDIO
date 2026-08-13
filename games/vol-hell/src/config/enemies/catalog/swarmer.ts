import type { EnemyDefinition } from '../types';

/**
 * Swarmer arketipi — mesafesini korur, kendi minion'larını doğurup onlarla
 * saldırır. Yavaş ve dayanıklıdır; öncelik hedefi olarak tasarlanmıştır.
 */
export const SWARMER_ENEMIES: Record<string, EnemyDefinition> = {
  brooder: {
    id: 'brooder',
    archetype: 'swarmer',
    displayName: 'Brooder',
    description: 'Oyuncudan uzak durur, düzenli aralıklarla swarmling doğurur.',
    tags: ['spawner', 'support', 'slow'],
    baseStats: {
      damage: 10,
      speed: 55,
      health: 80,
      fireRate: 800,
    },
    radius: 17,
    color: 0x9944cc,
    strokeColor: 0xcc88ff,
    scoreValue: 180,
    sparkReward: 6,
    fluxReward: 2,
    minWave: 5,
    spawnWeight: 2,
    swarmer: {
      minionId: 'swarmling',
      spawnIntervalMs: 3000,
      maxMinions: 4,
      spawnCount: 2,
      spawnRadius: 26,
      // Standoff, oyuncunun menzilinden uzak ama minion'ların yürüyebileceği kadar yakın.
      standoffDistance: 220,
    },
  },
};
