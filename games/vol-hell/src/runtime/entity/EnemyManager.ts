import type Phaser from 'phaser';
import type { Vector2 } from '@volstudio/core';
import { Diagnostics } from '@volstudio/core';
import { enemyConfig } from '@/config/enemy';
import { bulletConfig } from '@/config/bullet';
import type { Border } from './Border';
import { Enemy } from './Enemy';
import type { SpatialGrid } from '@/runtime/systems/SpatialGrid';
import type { ParticlePool } from '@/runtime/systems/ParticlePool';
import type { DifficultyState } from '@/runtime/systems/DifficultyCalculator';

/**
 * Düşman yöneticisi — sürekli spawn, sayı limiti, güncelleme ve temizlik.
 * Spawn, border kenarlarında rastgele pozisyonda olur.
 */
export class EnemyManager {
  private readonly enemies: Enemy[] = [];
  private spawnTimer = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly particles: ParticlePool,
  ) {}

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
      const spawned = this.spawn(border, playerPos, difficulty);
      if (spawned) {
        this.spawnTimer = 0;
      } else {
        // Spawn başarısız (oyuncuya çok yakın) — kısa bekleme sonra tekrar dene
        this.spawnTimer = difficulty.spawnIntervalMs * enemyConfig.spawnRetryIntervalFactor;
      }
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      enemy.update(delta, playerPos, border, grid);

      if (!enemy.isAlive) {
        // Swap-and-pop: O(1) kaldırma, kaydırma yok
        const last = this.enemies.pop();
        if (last && i < this.enemies.length) {
          this.enemies[i] = last;
        }
      }
    }
  }

  /** Border kenarından rastgele pozisyonda düşman doğurur. Başarılı true döner. */
  private spawn(border: Border, playerPos: Vector2, difficulty: DifficultyState): boolean {
    const b = border.bounds;
    const side = Math.floor(Math.random() * enemyConfig.spawnEdgeCount);
    let x: number;
    let y: number;

    switch (side) {
      case 0: // top
        x = b.left + Math.random() * b.width;
        y = b.top + enemyConfig.radius;
        break;
      case 1: // bottom
        x = b.left + Math.random() * b.width;
        y = b.bottom - enemyConfig.radius;
        break;
      case 2: // left
        x = b.left + enemyConfig.radius;
        y = b.top + Math.random() * b.height;
        break;
      default: // right
        x = b.right - enemyConfig.radius;
        y = b.top + Math.random() * b.height;
        break;
    }

    // Oyuncuya çok yakın spawn etme
    const distToPlayer = Math.hypot(x - playerPos.x, y - playerPos.y);
    if (distToPlayer < enemyConfig.spawnMinPlayerDistance) return false;

    // Maksimum canı mermi hasarının katına yuvarla — can barı her vuruşta anlamlı ve can düşmanı yaşar görünür kalsın.
    const roundedHealth =
      Math.round(difficulty.enemyHealth / bulletConfig.damage) * bulletConfig.damage;

    const enemy = new Enemy(this.scene, x, y, this.particles, {
      maxHealth: roundedHealth,
      speed: difficulty.enemySpeed,
      scoreValue: enemyConfig.scoreValue * difficulty.scoreMultiplier,
    });
    this.enemies.push(enemy);

    Diagnostics.getInstance()?.recordEvent('enemySpawn', { x, y });

    return true;
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
