import type Phaser from 'phaser';
import { Vector2, Diagnostics } from '@volstudio/core';
import { bulletConfig } from '@/config/bullet';
import { RENDER_DEPTH } from '@/config/layers';
import { sfxVolumes } from '@/config/audio';
import { gameAudio } from '@/app/services';
import type { Border } from './Border';
import type { EffectManager } from '@/runtime/systems/EffectManager';

/**
 * Mermi — oyuncunun fare yönüne doğru ateşlediği projectile.
 * Border duvarından seker, ömrü dolunca yok edilir.
 */
export class Bullet {
  readonly arc: Phaser.GameObjects.Arc;
  private readonly velocity: Vector2 = Vector2.zero();
  private age = 0;
  private alive = true;
  private lastTrailTime = 0;
  private lastBounceSoundTime = -Infinity;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    direction: Vector2,
    private readonly effects: EffectManager,
    /** Ateşlendiği andaki hasar — oyuncunun stat bloğundan gelir. */
    private readonly damageValue: number = bulletConfig.damage,
  ) {
    this.arc = scene.add.circle(
      x,
      y,
      bulletConfig.radius,
      bulletConfig.color,
      bulletConfig.fillAlpha,
    );
    this.arc.setStrokeStyle(
      bulletConfig.strokeWidth,
      bulletConfig.strokeColor,
      bulletConfig.strokeAlpha,
    );
    this.arc.setDepth(RENDER_DEPTH.bullet);

    this.velocity.copyFrom(direction).normalizeInPlace().scaleInPlace(bulletConfig.speed);
  }

  get isAlive(): boolean {
    return this.alive;
  }

  get x(): number {
    return this.arc.x;
  }

  get y(): number {
    return this.arc.y;
  }

  get damage(): number {
    return this.damageValue;
  }

  update(delta: number, border: Border): void {
    if (!this.alive) return;

    const dt = delta / 1000;
    this.arc.x += this.velocity.x * dt;
    this.arc.y += this.velocity.y * dt;

    this.handleBounce(border);

    // Trail partikül
    this.lastTrailTime += delta;
    if (this.lastTrailTime >= bulletConfig.trailFrequencyMs) {
      this.lastTrailTime = 0;
      this.spawnTrailParticle();
    }

    this.age += delta;
    if (this.age >= bulletConfig.lifetimeMs) {
      this.destroy();
    }
  }

  /** Hareket sırasında arkada iz bırakır — mermi yönünün tersine yayılır. */
  private spawnTrailParticle(): void {
    // Phaser açıları derece cinsinden bekler; iz mermi yönünün tersine gider.
    const angleDeg = Math.atan2(-this.velocity.y, -this.velocity.x) * (180 / Math.PI);
    this.effects.play('bulletTrail', this.arc.x, this.arc.y, angleDeg);
  }

  /** Border duvarından sekme — hız vektörünü yansıt. */
  private handleBounce(border: Border): void {
    const r = bulletConfig.radius;
    const b = border.bounds;
    let bounced = false;

    if (this.arc.x - r < b.left) {
      this.arc.x = b.left + r;
      this.velocity.x = -this.velocity.x * bulletConfig.bounceDamping;
      bounced = true;
    } else if (this.arc.x + r > b.right) {
      this.arc.x = b.right - r;
      this.velocity.x = -this.velocity.x * bulletConfig.bounceDamping;
      bounced = true;
    }

    if (this.arc.y - r < b.top) {
      this.arc.y = b.top + r;
      this.velocity.y = -this.velocity.y * bulletConfig.bounceDamping;
      bounced = true;
    } else if (this.arc.y + r > b.bottom) {
      this.arc.y = b.bottom - r;
      this.velocity.y = -this.velocity.y * bulletConfig.bounceDamping;
      bounced = true;
    }

    if (bounced) {
      Diagnostics.getInstance()?.recordEvent('bulletBounce', {
        x: this.arc.x,
        y: this.arc.y,
      });

      const now = this.scene.time.now;
      if (now - this.lastBounceSoundTime >= bulletConfig.bounceSoundCooldownMs) {
        this.lastBounceSoundTime = now;
        void gameAudio.playSfx('bulletBounce', { volume: sfxVolumes.bulletBounce });
      }

      this.spawnBounceParticles();
    }
  }

  /** Sekme anında küçük kıvılcım patlaması. */
  private spawnBounceParticles(): void {
    this.effects.play('bulletBounce', this.arc.x, this.arc.y);
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.arc.destroy();
  }
}
