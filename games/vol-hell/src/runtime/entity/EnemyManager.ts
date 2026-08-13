import type Phaser from 'phaser';
import type { Random, Vector2 } from '@volstudio/core';
import { Diagnostics } from '@volstudio/core';
import { enemyConfig } from '@/config/enemy';
import { difficultyConfig } from '@/config/difficulty';
import { getEnemyDefinition, pickEnemyDefinition } from '@/config/enemies/catalog';
import type { EnemyDefinition } from '@/config/enemies/types';
import type { Border } from './Border';
import { Enemy } from './Enemy';
import { createEnemyStats } from './enemyStats';
import type { MinionSpawnRequest } from './behaviors';
import type { SpatialGrid } from '@/runtime/systems/SpatialGrid';
import type { EffectManager } from '@/runtime/systems/EffectManager';
import type { DifficultyState } from '@/runtime/systems/DifficultyCalculator';

/**
 * Düşman yöneticisi — katalogdan arketip seçip spawn eder, günceller, temizler.
 *
 * Spawn, border kenarlarında seed'li PRNG ile belirlenen bir noktada olur;
 * hangi türün doğacağını dalga numarası ve katalog ağırlıkları belirler.
 * Swarmer'ların minion doğurma istekleri de burada karşılanır.
 */
export class EnemyManager {
  private readonly enemies: Enemy[] = [];
  private spawnTimer = 0;
  private currentWave = 1;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly effects: EffectManager,
    private readonly random: Random,
  ) {}

  /** Aktif dalga — spawn havuzunu belirler. */
  setWave(wave: number): void {
    this.currentWave = wave;
  }

  update(
    delta: number,
    playerPos: Vector2,
    border: Border,
    _time: number,
    grid: SpatialGrid,
    difficulty: DifficultyState,
  ): void {
    this.spawnTimer += delta;
    if (
      this.spawnTimer >= difficulty.spawnIntervalMs &&
      this.enemies.length < difficulty.maxEnemies
    ) {
      const spawned = this.spawnFromCatalog(border, playerPos, difficulty);
      if (spawned) {
        this.spawnTimer = 0;
      } else {
        // Spawn başarısız (oyuncuya çok yakın) — kısa bekleme sonra tekrar dene
        this.spawnTimer = difficulty.spawnIntervalMs * enemyConfig.spawnRetryIntervalFactor;
      }
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      const spawnRequest = enemy.update(delta, playerPos, border, grid, this.random);
      if (spawnRequest) {
        this.spawnMinions(enemy, spawnRequest, difficulty);
      }

      if (!enemy.isAlive) {
        // Swap-and-pop: O(1) kaldırma, kaydırma yok
        const last = this.enemies.pop();
        if (last && i < this.enemies.length) {
          this.enemies[i] = last;
        }
      }
    }
  }

  /** Border kenarından, dalga havuzundan seçilen bir düşman doğurur. */
  private spawnFromCatalog(
    border: Border,
    playerPos: Vector2,
    difficulty: DifficultyState,
  ): boolean {
    const definition = pickEnemyDefinition(this.random, this.currentWave);
    if (!definition) return false;

    const position = this.pickEdgePosition(border, definition.radius);

    // Oyuncuya çok yakın spawn etme
    const distToPlayer = Math.hypot(position.x - playerPos.x, position.y - playerPos.y);
    if (distToPlayer < enemyConfig.spawnMinPlayerDistance) return false;

    this.createEnemy(definition, position.x, position.y, difficulty);
    return true;
  }

  /** Swarmer'ın doğurma isteğini karşılar — minion'lar ebeveyne kaydedilir. */
  private spawnMinions(
    parent: Enemy,
    request: MinionSpawnRequest,
    difficulty: DifficultyState,
  ): void {
    const definition = getEnemyDefinition(request.minionId);

    for (const angle of request.angles) {
      // Minion'lar dalga spawn limitine değil, mutlak performans tavanına tabidir:
      // yoksa sürü limiti doldurup normal spawn'ı tamamen kilitleyebilirdi.
      if (this.enemies.length >= difficultyConfig.maxEnemiesCap) return;

      const x = parent.x + Math.cos(angle) * request.radius;
      const y = parent.y + Math.sin(angle) * request.radius;
      const minion = this.createEnemy(definition, x, y, difficulty);
      parent.registerMinion(minion);
    }
  }

  private createEnemy(
    definition: EnemyDefinition,
    x: number,
    y: number,
    difficulty: DifficultyState,
  ): Enemy {
    const enemy = new Enemy(this.scene, x, y, this.effects, {
      definition,
      stats: createEnemyStats(definition, difficulty),
      scoreValue: definition.scoreValue * difficulty.scoreMultiplier,
    });
    this.enemies.push(enemy);

    Diagnostics.getInstance()?.recordEvent('enemySpawn', { x, y, id: definition.id });

    return enemy;
  }

  /** Border kenarlarından birinde rastgele (seed'li) bir nokta seçer. */
  private pickEdgePosition(border: Border, radius: number): { x: number; y: number } {
    const b = border.bounds;
    const side = Math.floor(this.random.next() * enemyConfig.spawnEdgeCount);

    switch (side) {
      case 0: // top
        return { x: b.left + this.random.next() * b.width, y: b.top + radius };
      case 1: // bottom
        return { x: b.left + this.random.next() * b.width, y: b.bottom - radius };
      case 2: // left
        return { x: b.left + radius, y: b.top + this.random.next() * b.height };
      default: // right
        return { x: b.right - radius, y: b.top + this.random.next() * b.height };
    }
  }

  getEnemies(): readonly Enemy[] {
    return this.enemies;
  }

  destroy(): void {
    for (const enemy of this.enemies) {
      enemy.destroy();
    }
    this.enemies.length = 0;
  }
}
