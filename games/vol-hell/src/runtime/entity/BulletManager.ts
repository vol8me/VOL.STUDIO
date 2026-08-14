import type Phaser from 'phaser';
import type { StatBlock } from '@volstudio/core';
import { Diagnostics, Vector2 } from '@volstudio/core';
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
  /** Reusable buffer — mermi başına yeni Vector2 yaratmaz. */
  private readonly directionBuf: Vector2 = new Vector2();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly effects: EffectManager,
    private readonly stats: StatBlock,
  ) {}

  /** Ateş etmeye çalışır — cooldown aktifse reddedir. */
  tryFire(origin: Vector2, direction: Vector2): boolean {
    if (this.fireCooldown > 0) return false;

    // Negatif hasar mermiyi iyileştiriciye çevirirdi.
    this.spawnBullet(
      origin.x,
      origin.y,
      direction.x,
      direction.y,
      Math.max(0, this.stats.getValue('damage')),
    );
    // fireRate = atışlar arası bekleme (ms); alt sınır olmadan modifier'lar
    // ateşi frame başına bir mermiye kadar hızlandırabilirdi.
    this.fireCooldown = Math.max(bulletConfig.minFireCooldownMs, this.stats.getValue('fireRate'));

    return true;
  }

  /**
   * Mermiyi doğrudan doğurur — ateş cooldown'unu OKUMAZ ve BAŞLATMAZ.
   * Ability'ler (çoklu atış) bunu kullanır: kendi cooldown'ları zaten
   * sınırlayıcıdır, silahın temposuna ikinci kez tabi olmamalıdırlar.
   */
  spawnBullet(x: number, y: number, dirX: number, dirY: number, damage: number): void {
    this.directionBuf.set(dirX, dirY);
    const bullet = new Bullet(
      this.scene,
      x,
      y,
      this.directionBuf,
      this.effects,
      Math.max(0, damage),
    );
    this.bullets.push(bullet);

    const angleDeg = Math.atan2(dirY, dirX) * (180 / Math.PI);
    this.effects.play('bulletFire', x, y, angleDeg);

    Diagnostics.getInstance()?.recordEvent('bulletFire', {
      x,
      y,
      direction: { x: dirX, y: dirY },
    });
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
