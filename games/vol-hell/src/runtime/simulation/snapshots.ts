import type { RunEconomy } from '@/runtime/systems/RunEconomy';
import type { WaveManager } from '@/runtime/systems/WaveManager';
import type {
  SimulationEnemyState,
  SimulationPickup,
  SimulationEnemyView,
  SimulationPickupView,
  VolHellRenderSnapshot,
  VolHellSimulationSnapshot,
} from './types';

interface SnapshotSource {
  readonly frame: number;
  readonly elapsedMs: number;
  readonly playerX: number;
  readonly playerY: number;
  readonly economy: RunEconomy;
  readonly waveManager: WaveManager;
  readonly runCompleted: boolean;
  readonly enemies: readonly SimulationEnemyState[];
  readonly pickups: readonly SimulationPickup[];
  readonly waves: readonly number[];
  readonly shopTriggers: readonly number[];
  readonly levelUps: readonly number[];
  readonly eliteWaves: readonly number[];
  readonly bossWaves: readonly number[];
  readonly maxEnemyCount: number;
  readonly maxPickupCount: number;
}

/** Simülasyon iç durumundan render için sahipliği ayrılmış DTO üretir. */
export function createRenderSnapshot(source: SnapshotSource): VolHellRenderSnapshot {
  const enemies: SimulationEnemyView[] = source.enemies.map((enemy) => ({
    id: enemy.id,
    definitionId: enemy.definition.id,
    archetype: enemy.definition.archetype,
    radius: enemy.radius,
    maxHealth: enemy.maxHealth,
    scoreValue: enemy.scoreValue,
    health: enemy.health,
    isAlive: enemy.isAlive,
    x: enemy.x,
    y: enemy.y,
  }));
  const pickups: SimulationPickupView[] = source.pickups.map((pickup) => ({
    x: pickup.x,
    y: pickup.y,
    amount: pickup.amount,
    settled: pickup.settled,
  }));

  return {
    frame: source.frame,
    elapsedMs: source.elapsedMs,
    player: { x: source.playerX, y: source.playerY },
    economy: {
      flux: source.economy.getFlux(),
      spark: source.economy.getSpark(),
      level: source.economy.getLevel(),
    },
    currentWave: source.waveManager.getCurrentWave(),
    waveProgress: source.waveManager.getProgress(),
    waveRemainingMs: source.waveManager.getRemainingMs(),
    awaitingBlocker: source.waveManager.isAwaitingBlocker(),
    runCompleted: source.runCompleted,
    enemies,
    pickups,
  };
}

/** Koşu denetimleri için iç dizilerden bağımsız, kopyalanmış özet üretir. */
export function createSimulationSnapshot(source: SnapshotSource): VolHellSimulationSnapshot {
  return {
    frame: source.frame,
    elapsedMs: source.elapsedMs,
    player: { x: source.playerX, y: source.playerY },
    economy: {
      flux: source.economy.getFlux(),
      spark: source.economy.getSpark(),
      level: source.economy.getLevel(),
    },
    waves: [...source.waves],
    shopTriggers: [...source.shopTriggers],
    levelUps: [...source.levelUps],
    eliteWaves: [...source.eliteWaves],
    bossWaves: [...source.bossWaves],
    runCompleted: source.runCompleted,
    maxEnemies: source.maxEnemyCount,
    maxPickups: source.maxPickupCount,
    enemyCount: source.enemies.length,
    pickupCount: source.pickups.length,
  };
}
