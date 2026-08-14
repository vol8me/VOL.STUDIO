import type { EnemyDefinition } from '../types';

/**
 * Özel dalga düşmanları — Elite (dalga 10) ve Boss (dalga 20).
 *
 * İkisi de `spawnWeight: 0` taşır: normal spawn havuzuna GİRMEZ, yalnızca
 * `WaveManager` özel dalga kancasıyla çağırır. Katalogda durmalarının nedeni,
 * stat/görünüm/ödül tanımlarının diğer düşmanlarla aynı yerde ve aynı desende
 * kalması — Enemy sınıfı ikisini de aynı `EnemyDefinition` ile kurar.
 *
 * Davranışları katalogda DEĞİL, ayrı kontrolcülerdedir:
 * `EliteController` (rusher + swarmer kompozisyonu) ve `BossController`
 * (kendi state machine'i). Boss'un stat'ları burada TABAN değerlerdir;
 * gerçek değerleri spawn anında oyuncunun gücüne göre ölçeklenir
 * (bkz. `bossScaling.ts`).
 */
export const SPECIAL_ENEMIES: Record<string, EnemyDefinition> = {
  warden: {
    id: 'warden',
    archetype: 'elite',
    displayName: 'Warden',
    description: 'Elite: hem atılım yapar hem swarmling doğurur. Dalga 10 zorunlu engeli.',
    tags: ['elite', 'dash', 'spawner', 'blocker'],
    baseStats: {
      // İri ve dayanıklı, ama hızı oyuncunun altında: kaçış her zaman mümkün.
      damage: 22,
      speed: 88,
      health: 900,
      fireRate: 900,
    },
    radius: 30,
    color: 0xcc3366,
    strokeColor: 0xff88bb,
    scoreValue: 1200,
    sparkReward: 40,
    fluxReward: 12,
    minWave: 10,
    // Normal havuza girmez; yalnızca elite dalgasında çağrılır.
    spawnWeight: 0,
    rusher: {
      // Elite atılımı lancer'dan daha uzaktan başlar ve daha uzun telegraf verir:
      // iri gövde kaçışı zorlaştırdığı için okunabilirlik daha kritik.
      triggerDistance: 320,
      windupMs: 520,
      dashSpeedMultiplier: 4.6,
      dashDurationMs: 300,
      recoverMs: 620,
      cooldownMs: 2600,
    },
    swarmer: {
      minionId: 'swarmling',
      spawnIntervalMs: 4200,
      maxMinions: 6,
      spawnCount: 3,
      spawnRadius: 44,
      // Elite standoff'u KULLANMAZ (atılım için yaklaşması gerekir); bu alan
      // yalnızca doğurma parametreleri için okunur.
      standoffDistance: 0,
    },
  },

  sovereign: {
    id: 'sovereign',
    archetype: 'boss',
    displayName: 'Sovereign',
    description: 'Boss: üç telegraph’lı saldırı paterni. Dalga 20 zorunlu engeli.',
    tags: ['boss', 'blocker', 'phases'],
    baseStats: {
      // TABAN değerler — gerçek stat'lar spawn anında oyuncunun gücüne
      // oranlanır (bkz. `scaleBossStats`).
      damage: 26,
      speed: 74,
      health: 2200,
      fireRate: 1000,
    },
    radius: 42,
    color: 0x7733cc,
    strokeColor: 0xcc99ff,
    scoreValue: 5000,
    sparkReward: 120,
    fluxReward: 40,
    minWave: 20,
    spawnWeight: 0,
  },
};
