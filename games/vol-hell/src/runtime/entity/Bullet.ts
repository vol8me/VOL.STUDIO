import type Phaser from 'phaser';
import { Vector2, Diagnostics } from '@volstudio/core';
import { bulletConfig } from '@/config/bullet';
import { sfxVolumes } from '@/config/audio';
import { gameAudio } from '@/app/services';
import type { Border } from './Border';
import type { ParticlePool } from '@/runtime/systems/ParticlePool';

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
    private readonly particles: ParticlePool,
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
    return bulletConfig.damage;
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

  /** Hareket sırasında arkada küçük partikül bırakır — mermi yönünün tersine yayılır. */
  private spawnTrailParticle(): void {
    const angle = Math.atan2(this.velocity.y, this.velocity.x) + Math.PI;
    const spread = (Math.random() - 0.5) * bulletConfig.trailSpread;
    const dir = angle + spread;
    const speed = bulletConfig.trailSpeed;
    const px = this.particles.acquire(
      this.arc.x,
      this.arc.y,
      bulletConfig.trailParticleSize,
      bulletConfig.color,
      bulletConfig.trailAlpha,
    );
    this.scene.tweens.add({
      targets: px,
      x: this.arc.x + Math.cos(dir) * speed * (bulletConfig.trailLifespanMs / 1000),
      y: this.arc.y + Math.sin(dir) * speed * (bulletConfig.trailLifespanMs / 1000),
      alpha: 0,
      scale: 0,
      duration: bulletConfig.trailLifespanMs,
      onComplete: () => this.particles.release(px),
    });
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

  /** Sekme anında küçük partikül patlaması. */
  private spawnBounceParticles(): void {
    const colors = bulletConfig.bounceColors;
    for (let i = 0; i < bulletConfig.bounceParticleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed =
        bulletConfig.bounceParticleSpeedMin +
        Math.random() * (bulletConfig.bounceParticleSpeedMax - bulletConfig.bounceParticleSpeedMin);
      const px = this.particles.acquire(
        this.arc.x,
        this.arc.y,
        bulletConfig.bounceParticleSize,
        colors[i % colors.length],
        bulletConfig.bounceParticleAlpha,
      );
      this.scene.tweens.add({
        targets: px,
        x: this.arc.x + Math.cos(angle) * speed,
        y: this.arc.y + Math.sin(angle) * speed,
        alpha: 0,
        duration: bulletConfig.bounceParticleLifespanMs,
        onComplete: () => this.particles.release(px),
      });
    }
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.arc.destroy();
  }
}
