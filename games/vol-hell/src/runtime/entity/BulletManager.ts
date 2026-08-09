import type Phaser from 'phaser';
import type { Vector2 } from '@volstudio/core';
import { Diagnostics } from '@volstudio/core';
import { bulletConfig } from '@/config/bullet';
import { Bullet } from './Bullet';
import type { Border } from './Border';
import type { ParticlePool } from '@/runtime/systems/ParticlePool';

/**
 * Mermi yöneticisi — ateş cooldown, mermi yaşam döngüsü, trail partikül ve çarpışma.
 * Tek tek ateş: fireCooldownMs içinde bir kez ateş edilir.
 */
export class BulletManager {
  private readonly bullets: Bullet[] = [];
  private fireCooldown = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly particles: ParticlePool,
  ) {}

  /** Ateş etmeye çalışır — cooldown aktifse reddedir. */
  tryFire(origin: Vector2, direction: Vector2): boolean {
    if (this.fireCooldown > 0) return false;

    const bullet = new Bullet(this.scene, origin.x, origin.y, direction, this.particles);
    this.bullets.push(bullet);
    this.fireCooldown = bulletConfig.fireCooldownMs;

    Diagnostics.getInstance()?.recordEvent('bulletFire', {
      x: origin.x,
      y: origin.y,
      direction: { x: direction.x, y: direction.y },
    });

    return true;
  }

  update(delta: number, border: Border): void {
    if (this.fireCooldown > 0) {
      this.fireCooldown -= delta;
    }

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      bullet.update(delta, border);

      if (!bullet.isAlive) {
        // Swap-and-pop: O(1) kaldırma, kaydırma yok
        const last = this.bullets.pop()!;
        if (i < this.bullets.length) {
          this.bullets[i] = last;
        }
      }
    }
  }

  /** Tüm mermileri döndürür — çarpışma kontrolü için. */
  getBullets(): readonly Bullet[] {
    return this.bullets;
  }

  /** Mermiyi yok eder. */
  removeBullet(bullet: Bullet): void {
    const idx = this.bullets.indexOf(bullet);
    if (idx >= 0) {
      // Swap-and-pop: O(1) kaldırma
      const last = this.bullets.pop();
      if (last && idx < this.bullets.length) {
        this.bullets[idx] = last;
      }
      bullet.destroy();
    }
  }

  destroy(): void {
    for (const bullet of this.bullets) {
      bullet.destroy();
    }
    this.bullets.length = 0;
  }
}
