import type Phaser from 'phaser';
import type { StatBlock, Vector2 } from '@volstudio/core';
import { Diagnostics } from '@volstudio/core';
import { bulletConfig } from '@/config/bullet';
import { Bullet } from './Bullet';
import type { Border } from './Border';
import type { EffectManager } from '@/runtime/systems/EffectManager';

/**
 * Mermi yöneticisi — ateş cooldown, mermi yaşam döngüsü, trail partikül ve çarpışma.
 * Tek tek ateş: `fireRate` stat'ı kadar bekleyip bir kez ateş eder.
 *
 * Hasar ve ateş temposu oyuncunun `StatBlock`'undan okunur; config değerleri
 * yalnızca taban olarak kullanılır (bkz. Player).
 */
export class BulletManager {
  private readonly bullets: Bullet[] = [];
  private fireCooldown = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly effects: EffectManager,
    private readonly stats: StatBlock,
  ) {}

  /** Ateş etmeye çalışır — cooldown aktifse reddedir. */
  tryFire(origin: Vector2, direction: Vector2): boolean {
    if (this.fireCooldown > 0) return false;

    const bullet = new Bullet(
      this.scene,
      origin.x,
      origin.y,
      direction,
      this.effects,
      // Negatif hasar mermiyi iyileştiriciye çevirirdi.
      Math.max(0, this.stats.getValue('damage')),
    );
    this.bullets.push(bullet);
    // fireRate = atışlar arası bekleme (ms); alt sınır olmadan modifier'lar
    // ateşi frame başına bir mermiye kadar hızlandırabilirdi.
    this.fireCooldown = Math.max(bulletConfig.minFireCooldownMs, this.stats.getValue('fireRate'));

    const angleDeg = Math.atan2(direction.y, direction.x) * (180 / Math.PI);
    this.effects.play('bulletFire', origin.x, origin.y, angleDeg);

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
