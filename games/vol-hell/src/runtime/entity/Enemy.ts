import type Phaser from 'phaser';
import { Vector2, Diagnostics } from '@volstudio/core';
import { enemyConfig } from '@/config/enemy';
import { playerConfig } from '@/config/player';
import type { Border } from './Border';
import type { SpatialGrid } from '@/runtime/systems/SpatialGrid';
import type { ParticlePool } from '@/runtime/systems/ParticlePool';

/** Bir düşmanın anlık istatistikleri — zorlukla ölçeklenebilir. */
export interface EnemyStats {
  maxHealth: number;
  speed: number;
  scoreValue: number;
}

/**
 * Düşman — oyuncuya doğru hareket eder, temasla hasar verir.
 * Diğer düşmanlarla overlap etmez (separation). Can barı üzerindedir.
 */
export class Enemy {
  readonly arc: Phaser.GameObjects.Arc;
  private readonly healthBarBg: Phaser.GameObjects.Rectangle;
  private readonly healthBarFill: Phaser.GameObjects.Rectangle;
  private health: number;
  private alive = true;
  private lastContactDamage = 0;
  private readonly velocity: Vector2 = Vector2.zero();
  private readonly stats: EnemyStats;
  // Reusable buffer'lar — her frame yeni Vector2 yaratmaz
  private readonly toPlayerBuf: Vector2 = Vector2.zero();
  private readonly separationBuf: Vector2 = Vector2.zero();

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly particles: ParticlePool,
    stats?: Partial<EnemyStats>,
  ) {
    this.stats = {
      maxHealth: stats?.maxHealth ?? enemyConfig.health,
      speed: stats?.speed ?? enemyConfig.speed,
      scoreValue: stats?.scoreValue ?? enemyConfig.scoreValue,
    };

    this.arc = scene.add.circle(x, y, enemyConfig.radius, enemyConfig.color, enemyConfig.fillAlpha);
    this.arc.setStrokeStyle(
      enemyConfig.strokeWidth,
      enemyConfig.strokeColor,
      enemyConfig.strokeAlpha,
    );

    this.health = this.stats.maxHealth;

    const barY = y - enemyConfig.healthBarOffset;
    this.healthBarBg = scene.add.rectangle(
      x,
      barY,
      enemyConfig.healthBarWidth,
      enemyConfig.healthBarHeight,
      enemyConfig.healthBarBgColor,
      enemyConfig.healthBarBgAlpha,
    );
    this.healthBarFill = scene.add.rectangle(
      x,
      barY,
      enemyConfig.healthBarWidth,
      enemyConfig.healthBarHeight,
      enemyConfig.healthBarFillColor,
      enemyConfig.healthBarFillAlpha,
    );
    // Sol kenara sabitlenir ki genislik azalinca bar soldan buyuyup sagdan kisalsin.
    this.healthBarFill.setOrigin(0, 0.5);
    this.updateHealthBar();
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

  get radius(): number {
    return enemyConfig.radius;
  }

  get scoreValue(): number {
    return this.stats.scoreValue;
  }

  /** Düşmana hasar verir. Ölürsa true döner. */
  takeDamage(amount: number): boolean {
    if (!this.alive) return false;
    this.health = Math.max(0, this.health - amount);
    this.updateHealthBar();

    Diagnostics.getInstance()?.recordEvent('enemyHit', {
      x: this.arc.x,
      y: this.arc.y,
      amount,
      health: this.health,
    });

    if (this.health <= 0) {
      this.kill();
      return true;
    }
    return false;
  }

  /** Oyuncuya temas hasarı verir — cooldown aktifse reddedir. */
  tryContactDamage(time: number): number {
    if (time - this.lastContactDamage < enemyConfig.contactDamageCooldownMs) return 0;
    this.lastContactDamage = time;
    return enemyConfig.contactDamage;
  }

  /**
   * Düşmanı günceller — oyuncuya doğru hareket + border clamp + separation.
   * Oyuncuya temas mesafesine gelince durur (içine girmez).
   * Separation için spatial grid kullanır — O(N²) yerine O(N·k).
   */
  update(delta: number, playerPos: Vector2, border: Border, grid: SpatialGrid): void {
    if (!this.alive) return;

    const dt = delta / 1000;

    // Oyuncuya doğru hareket — temas mesafesinde dur
    this.toPlayerBuf.set(playerPos.x - this.arc.x, playerPos.y - this.arc.y);
    const dist = this.toPlayerBuf.length();
    const contactDist = enemyConfig.radius + playerConfig.hitboxRadius;

    if (dist > contactDist) {
      this.toPlayerBuf.normalizeInPlace();
      this.velocity.set(
        this.toPlayerBuf.x * this.stats.speed,
        this.toPlayerBuf.y * this.stats.speed,
      );
    } else {
      // Temas mesafesinde — hareketi durdur
      this.velocity.reset();
    }

    // Separation — spatial grid ile sadece yakındaki düşmanları kontrol et
    this.separationBuf.reset();
    const nearby = grid.queryNearby(this.arc.x, this.arc.y);
    for (const other of nearby) {
      if (other === this || !other.alive) continue;
      const dx = this.arc.x - other.x;
      const dy = this.arc.y - other.y;
      const d = Math.hypot(dx, dy);
      if (d > 0 && d < enemyConfig.separationRadius) {
        const force = (1 - d / enemyConfig.separationRadius) * enemyConfig.separationForce;
        this.separationBuf.x += (dx / d) * force * enemyConfig.speed;
        this.separationBuf.y += (dy / d) * force * enemyConfig.speed;
      }
    }

    this.arc.x += (this.velocity.x + this.separationBuf.x) * dt;
    this.arc.y += (this.velocity.y + this.separationBuf.y) * dt;

    // Border clamp — obje yaratmaz
    this.arc.x = border.clampX(this.arc.x, enemyConfig.radius);
    this.arc.y = border.clampY(this.arc.y, enemyConfig.radius);

    // Can barını pozisyona güncelle — ikisi de düşman merkezine sabitlenir
    this.healthBarBg.x = this.arc.x;
    this.healthBarBg.y = this.arc.y - enemyConfig.healthBarOffset;
    this.healthBarFill.x = this.arc.x - enemyConfig.healthBarWidth / 2;
    this.healthBarFill.y = this.arc.y - enemyConfig.healthBarOffset;
  }

  private updateHealthBar(): void {
    const ratio = this.health / this.stats.maxHealth;
    const visible = this.alive;
    this.healthBarBg.setVisible(visible);
    this.healthBarFill.setVisible(visible && ratio > 0);

    // setSize() kullanilir: `.width`'e dogrudan atamak geom'u ve displayOrigin'i
    // guncellemez, yalnizca WebGL renderer'in src.width okumasi sayesinde
    // tesadufen calisirdi. Origin sola sabitlenmis oldugu icin bar soldan
    // sabit kalip sagdan kisalir — klasik can bari davranisi.
    this.healthBarFill.setSize(
      Math.max(enemyConfig.healthBarMinWidth, enemyConfig.healthBarWidth * ratio),
      enemyConfig.healthBarHeight,
    );
    this.healthBarFill.x = this.arc.x - enemyConfig.healthBarWidth / 2;
  }

  /** Düşmanı öldürür — partikül patlaması + yok etme. */
  private kill(): void {
    if (!this.alive) return;
    this.alive = false;

    Diagnostics.getInstance()?.recordEvent('enemyDeath', {
      x: this.arc.x,
      y: this.arc.y,
    });

    this.spawnDeathParticles();
    this.arc.destroy();
    this.healthBarBg.destroy();
    this.healthBarFill.destroy();
  }

  private spawnDeathParticles(): void {
    for (let i = 0; i < enemyConfig.deathParticleCount; i++) {
      const angle = (i / enemyConfig.deathParticleCount) * Math.PI * 2;
      const speed = enemyConfig.deathParticleSpeed;
      const px = this.particles.acquire(
        this.arc.x,
        this.arc.y,
        enemyConfig.deathParticleSize,
        enemyConfig.deathParticleColor,
        enemyConfig.deathParticleAlpha,
      );
      this.scene.tweens.add({
        targets: px,
        x: this.arc.x + Math.cos(angle) * speed * (enemyConfig.deathParticleLifespanMs / 1000),
        y: this.arc.y + Math.sin(angle) * speed * (enemyConfig.deathParticleLifespanMs / 1000),
        alpha: 0,
        scale: 0,
        duration: enemyConfig.deathParticleLifespanMs,
        onComplete: () => this.particles.release(px),
      });
    }
  }

  /** Düşmana dışarıdan itme uygular (overlap çözümü için). Border'a clamp eder. */
  applyPush(pushX: number, pushY: number, border: Border): void {
    this.arc.x += pushX;
    this.arc.y += pushY;

    this.arc.x = border.clampX(this.arc.x, enemyConfig.radius);
    this.arc.y = border.clampY(this.arc.y, enemyConfig.radius);
  }

  /** Düşmanı yok eder — sadece alive ise. kill() zaten destroy yapar. */
  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.arc.destroy();
    this.healthBarBg.destroy();
    this.healthBarFill.destroy();
  }
}
