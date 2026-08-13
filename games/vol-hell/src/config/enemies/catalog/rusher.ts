import type { EnemyDefinition } from '../types';

/**
 * Rusher arketipi — mesafeyi kapatır, kısa bir telegraf sonrası düz bir çizgi
 * üzerinde atılır. Canı düşüktür: atılımdan kaçmak ödüllendirilir.
 */
export const RUSHER_ENEMIES: Record<string, EnemyDefinition> = {
  lancer: {
    id: 'lancer',
    archetype: 'rusher',
    displayName: 'Lancer',
    description: 'Menzile girince hazırlanır ve düz bir çizgi üzerinde atılır.',
    tags: ['melee', 'dash', 'aggressive'],
    baseStats: {
      damage: 16,
      speed: 105,
      health: 35,
      fireRate: 700,
    },
    radius: 12,
    color: 0xff7733,
    strokeColor: 0xffaa66,
    scoreValue: 140,
    sparkReward: 4,
    fluxReward: 1,
    minWave: 3,
    spawnWeight: 3,
    rusher: {
      triggerDistance: 260,
      // Telegraf süresi dash süresinden uzun: atılım okunabilir ve kaçılabilir olsun.
      windupMs: 320,
      dashSpeedMultiplier: 4.2,
      dashDurationMs: 260,
      recoverMs: 420,
      cooldownMs: 1800,
    },
  },
};
