import type { SpatialEntity } from '@volstudio/core';
import type { EnemyDefinition } from '@/config/enemies/types';
import type { EnemyArchetype } from '@/config/enemies/types';
import type {
  MinionSpawnRequest,
  MutableBehaviorContext,
  RusherState,
  SwarmerState,
} from '@/runtime/entity/behaviors';

/** Phaser'dan bağımsız, yalnızca simülasyonun ihtiyaç duyduğu saha sınırı. */
export interface SimulationBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Simülasyonda oyuncu konumunu üreten saf callback. */
export type SimulationPlayerPosition = (
  frame: number,
  bounds: SimulationBounds,
) => { x: number; y: number };

export interface VolHellSimulationOptions {
  seed?: number;
  bounds?: SimulationBounds;
  /** Verilmezse config'teki deterministik orbit kullanılır. */
  playerPosition?: SimulationPlayerPosition;
  /** Otomatik saldırının düşman öldürme yarıçapı; null verilirse kapatılır. */
  killRadius?: number | null;
  /** Varsayılan config adımını ezmek için simülasyon frame süresi. */
  stepMs?: number;
}

/** Headless simülasyonun dışarıya verdiği değişmez koşu özeti. */
export interface VolHellSimulationSnapshot {
  readonly frame: number;
  readonly elapsedMs: number;
  readonly player: { readonly x: number; readonly y: number };
  readonly economy: {
    readonly flux: number;
    readonly spark: number;
    readonly level: number;
  };
  readonly waves: readonly number[];
  readonly shopTriggers: readonly number[];
  readonly levelUps: readonly number[];
  readonly eliteWaves: readonly number[];
  readonly bossWaves: readonly number[];
  readonly runCompleted: boolean;
  readonly maxEnemies: number;
  readonly maxPickups: number;
  readonly enemyCount: number;
  readonly pickupCount: number;
}

/** Render katmanına verilen, iç duruma sahip olmayan düşman görünümü. */
export interface SimulationEnemyView {
  readonly id: number;
  readonly definitionId: string;
  readonly archetype: EnemyArchetype;
  readonly radius: number;
  readonly maxHealth: number;
  readonly scoreValue: number;
  readonly health: number;
  readonly isAlive: boolean;
  readonly x: number;
  readonly y: number;
}

/** Render katmanına verilen Flux görünümü; hareket durumu kopyalanır. */
export interface SimulationPickupView {
  readonly x: number;
  readonly y: number;
  readonly amount: number;
  readonly settled: boolean;
}

/**
 * Simülasyonun bir frame için sunduğu render DTO'su.
 *
 * Bu yüzey yalnızca kopya veri taşır; render kodu oyun state'ini değiştiremez
 * ve Phaser nesnesi simülasyon modeline geri sızamaz.
 */
export interface VolHellRenderSnapshot {
  readonly frame: number;
  readonly elapsedMs: number;
  readonly player: { readonly x: number; readonly y: number };
  readonly economy: {
    readonly flux: number;
    readonly spark: number;
    readonly level: number;
  };
  readonly currentWave: number;
  readonly waveProgress: number;
  readonly waveRemainingMs: number;
  readonly awaitingBlocker: boolean;
  readonly runCompleted: boolean;
  readonly enemies: readonly SimulationEnemyView[];
  readonly pickups: readonly SimulationPickupView[];
}

/** Test/benchmark için modelin iç düşman kaydı; render sınırından dışarı çıkmaz. */
export interface SimulationEnemyState extends SpatialEntity {
  readonly id: number;
  readonly definition: EnemyDefinition;
  readonly radius: number;
  readonly maxHealth: number;
  readonly scoreValue: number;
  health: number;
  isAlive: boolean;
  readonly speed: number;
  readonly rusherState: RusherState | null;
  readonly swarmerState: SwarmerState | null;
  readonly spawnRequest: MinionSpawnRequest | null;
  readonly minions: SimulationEnemyState[];
  behaviorContext: MutableBehaviorContext | null;
}

export interface SimulationPickup {
  x: number;
  y: number;
  readonly originX: number;
  readonly originY: number;
  readonly landingX: number;
  readonly landingY: number;
  amount: number;
  dropElapsedMs: number;
  bobElapsedMs: number;
  settled: boolean;
}

export interface SimulationBoundsWithMetrics extends SimulationBounds {
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
  readonly centerY: number;
}

/** Simülasyon frame'lerini tüketen render tarafı. Phaser bilmez. */
export interface VolHellSimulationRenderPort {
  render(snapshot: VolHellRenderSnapshot): void;
}
