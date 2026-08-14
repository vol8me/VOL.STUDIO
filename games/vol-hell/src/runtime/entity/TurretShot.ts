import type Phaser from 'phaser';
import { turretVisualConfig } from '@/config/abilities';
import { RENDER_DEPTH } from '@/config/layers';
import type { EffectManager } from '@/runtime/systems/EffectManager';
import type { Enemy } from './Enemy';

/**
 * Kulenin attığı mermi — hedefi TAKİP EDER ve çarpınca hasar verir.
 *
 * Kule önce hitscan vuruyordu: hasar veriliyordu ama ekranda hiçbir şey
 * uçmuyordu, kulenin çalıştığı ancak düşman ölünce anlaşılıyordu. Takipli
 * mermi hem geri bildirim verir hem de kulenin menzilini görünür kılar.
 *
 * Hedef mermi yoldayken ölürse mermi son bilinen yöne devam eder ve kısa
 * ömrünün sonunda söner — havada asılı kalmaz.
 */
export class TurretShot {
  private readonly dot: Phaser.GameObjects.Arc;
  private target: Enemy | null;
  private dirX: number;
  private dirY: number;
  private ageMs = 0;
  private active = true;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    target: Enemy,
    private readonly damage: number,
    private readonly effects: EffectManager,
  ) {
    this.target = target;

    const dx = target.x - x;
    const dy = target.y - y;
    const distance = Math.hypot(dx, dy) || 1;
    this.dirX = dx / distance;
    this.dirY = dy / distance;

    this.dot = scene.add.circle(
      x,
      y,
      turretVisualConfig.shotRadius,
      turretVisualConfig.shotColor,
      1,
    );
    this.dot.setStrokeStyle(1, 0xffffff, 0.85);
    this.dot.setDepth(RENDER_DEPTH.bullet);
  }

  get isActive(): boolean {
    return this.active;
  }

  update(deltaMs: number, enemies: readonly Enemy[]): void {
    if (!this.active) return;

    this.ageMs += deltaMs;
    if (this.ageMs >= turretVisualConfig.shotLifetimeMs) {
      this.destroy();
      return;
    }

    if (this.target && !this.target.isAlive) {
      this.target = null;
    }

    if (this.target) {
      const dx = this.target.x - this.dot.x;
      const dy = this.target.y - this.dot.y;
      const distance = Math.hypot(dx, dy) || 1;
      this.dirX = dx / distance;
      this.dirY = dy / distance;
    }

    const step = (turretVisualConfig.shotSpeed * deltaMs) / 1000;
    this.dot.x += this.dirX * step;
    this.dot.y += this.dirY * step;

    this.checkHit(enemies);
  }

  destroy(): void {
    if (!this.active) return;
    this.active = false;
    this.dot.destroy();
  }

  /** Hedefe ya da yolda denk gelen başka bir düşmana çarpar. */
  private checkHit(enemies: readonly Enemy[]): void {
    for (const enemy of enemies) {
      if (!enemy.isAlive) continue;
      const distance = Math.hypot(enemy.x - this.dot.x, enemy.y - this.dot.y);
      if (distance > enemy.radius + turretVisualConfig.shotRadius) continue;

      this.effects.play('turretImpact', this.dot.x, this.dot.y);
      enemy.takeDamage(this.damage);
      this.destroy();
      return;
    }
  }
}
