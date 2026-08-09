import type Phaser from 'phaser';
import { PlayerController, Vector2 } from '@volstudio/core';
import { playerConfig } from '@/config/player';
import type { Border } from './Border';
import type { ParticlePool } from '@/runtime/systems/ParticlePool';

/**
 * Oyuncu entity'si. PlayerController composition ile sprite'ı tutar.
 * Placeholder görsel: Phaser.GameObjects.Arc (texture gerekmez).
 * Arc, Shape üzerinden Transform implement eder — cast gerekmez.
 *
 * Dash sistemi:
 * - Space tuşu ile tetiklenir.
 * - Cooldown tabanlı: dash sonrası dashChargeMs süresince şarj dolar (hareket halindeyken de).
 * - Dash süresince i-frame aktif — hasar alınmaz.
 * - Dash ghost: yarı saydam kopyalar bırakılır.
 */
export class Player extends PlayerController {
  private readonly arc: Phaser.GameObjects.Arc;
  private health: number;
  private moveDirection = Vector2.zero();

  // Dash şarjı (0-1, cooldown tabanlı — dash dışında her zaman dolar)
  private dashCharge = 1;
  // Dash aktif mi
  private dashing = false;
  private dashTimer = 0;
  // i-frame aktif mi (sadece dash için)
  private invulnerable = false;
  private invulnerabilityTimer = 0;
  // Hasar alınca kısa görsel flash (hasarı engellemez)
  private hitFlashTimer = 0;
  // Dash ghost timer
  private ghostTimer = 0;
  private currentBorder: Border | null = null;
  // Reusable buffer — getPosition() her çağrıda yeni Vector2 yaratmaz
  private readonly positionBuf: Vector2 = Vector2.zero();
  private readonly particles: ParticlePool;

  constructor(scene: Phaser.Scene, x: number, y: number, particles: ParticlePool) {
    const arc = scene.add.circle(x, y, playerConfig.hitboxRadius, 0x4488ff, 1);
    arc.setStrokeStyle(2, 0x88ccff, 0.8);
    super('player', arc);
    this.arc = arc;
    this.health = playerConfig.maxHealth;
    this.particles = particles;
  }

  /** InputManager'dan gelen hareket yönü — update()'ten önce çağrılmalı. Dash sırasında reddedilir. */
  setMoveDirection(direction: Vector2): void {
    if (this.dashing) return;
    this.moveDirection.copyFrom(direction);
  }

  /** Border referansını ayarlar — update()'ten önce çağrılmalı. */
  setBorder(border: Border): void {
    this.currentBorder = border;
  }

  update(delta: number): void {
    const isDashing = this.dashTimer > 0;

    // Dash şarjı — dash dışında her zaman dolar (cooldown tabanlı)
    if (!isDashing) {
      this.dashCharge = Math.min(1, this.dashCharge + delta / playerConfig.dashChargeMs);
    }

    // Dash timer decrement
    if (this.dashTimer > 0) {
      this.dashTimer -= delta;
      if (this.dashTimer <= 0) {
        this.dashTimer = 0;
        this.dashing = false;
      }
    }

    // Invulnerability timer decrement (sadece dash i-frame)
    if (this.invulnerabilityTimer > 0) {
      this.invulnerabilityTimer -= delta;
      if (this.invulnerabilityTimer <= 0) {
        this.invulnerabilityTimer = 0;
        this.invulnerable = false;
        this.arc.setVisible(true);
      } else {
        this.arc.setVisible(Math.floor(this.invulnerabilityTimer / 80) % 2 === 0);
      }
    }

    // Hasar flash efekti — hasarı engellemez, sadece görsel geri bildirim
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= delta;
      if (this.hitFlashTimer <= 0 && !this.dashing) {
        this.arc.setFillStyle(0x4488ff, 1);
      }
    }

    // Dash ghost bırakma
    if (this.dashing) {
      this.ghostTimer += delta;
      const ghostInterval = playerConfig.dashDurationMs / playerConfig.dashGhostCount;
      if (this.ghostTimer >= ghostInterval) {
        this.ghostTimer = 0;
        this.spawnGhost();
      }
    }

    // Hareket
    const speed = isDashing ? playerConfig.dashSpeed : playerConfig.moveSpeed;
    this.move(this.moveDirection, speed, delta);

    // Border clamp
    if (this.currentBorder) {
      this.arc.x = this.currentBorder.clampX(this.arc.x, playerConfig.hitboxRadius);
      this.arc.y = this.currentBorder.clampY(this.arc.y, playerConfig.hitboxRadius);
    }

    // Dash görsel: dash sırasında renk değişimi (invulnerability yanıp sönmesi ile çakışmasın)
    if (this.dashing) {
      this.arc.setFillStyle(0x88ccff, 0.7);
    } else if (!this.invulnerable) {
      this.arc.setFillStyle(0x4488ff, 1);
    }
  }

  /**
   * Dash başlatır — şarj doluysa ve dash aktif değilse.
   * Hareket yönünde dash yapar; hareketsizse aim yönünde.
   */
  tryDash(aimDirection: Vector2): boolean {
    if (this.dashTimer > 0 || this.dashCharge < 1) return false;

    this.dashing = true;
    this.dashTimer = playerConfig.dashDurationMs;
    this.dashCharge = 0;
    this.invulnerable = true;
    this.invulnerabilityTimer = Math.max(playerConfig.dashIFrameMs, this.invulnerabilityTimer);

    // Dash yönü — hareket yönü varsa onu kullan, yoksa aim
    if (this.moveDirection.length() <= 0.01) {
      this.moveDirection.copyFrom(aimDirection);
    }
    this.moveDirection.normalizeInPlace();
    this.ghostTimer = 0;

    return true;
  }

  /** Dash şarj oranı (0-1) — UI bar için. */
  getDashChargeRatio(): number {
    return this.dashCharge;
  }

  /** Dash hazır mı? */
  canDash(): boolean {
    return this.dashCharge >= 1 && this.dashTimer <= 0;
  }

  /** Hasar alır — dash i-frame aktifse reddedilir. Contact damage i-frame vermez. */
  takeDamage(amount: number): boolean {
    if (this.invulnerable) return false;
    this.health = Math.max(0, this.health - amount);
    this.hitFlashTimer = 150;
    this.arc.setFillStyle(0xff4444, 1);
    return true;
  }

  getHealth(): number {
    return this.health;
  }

  getHealthRatio(): number {
    return this.health / playerConfig.maxHealth;
  }

  isAlive(): boolean {
    return this.health > 0;
  }

  getPosition(): Vector2 {
    this.positionBuf.set(this.arc.x, this.arc.y);
    return this.positionBuf;
  }

  /** Skalar X koordinatı — Vector2 yaratmaz. */
  getX(): number {
    return this.arc.x;
  }

  /** Skalar Y koordinatı — Vector2 yaratmaz. */
  getY(): number {
    return this.arc.y;
  }

  /**
   * Dışarıdan itme uygular (düşman overlap çözümü için).
   * Pozisyonu günceller ve border'a clamp eder.
   */
  applyPush(pushX: number, pushY: number): void {
    this.arc.x += pushX;
    this.arc.y += pushY;

    if (this.currentBorder) {
      this.arc.x = this.currentBorder.clampX(this.arc.x, playerConfig.hitboxRadius);
      this.arc.y = this.currentBorder.clampY(this.arc.y, playerConfig.hitboxRadius);
    }
  }

  /** Dash ghost — yarı saydam kopya bırakır ve fade-out yapar. */
  private spawnGhost(): void {
    const scene = this.arc.scene;
    const ghost = this.particles.acquire(
      this.arc.x,
      this.arc.y,
      playerConfig.hitboxRadius,
      0x88ccff,
      playerConfig.dashGhostAlpha,
    );
    ghost.setStrokeStyle(2, 0xaaddff, playerConfig.dashGhostAlpha * 0.5);

    scene.tweens.add({
      targets: ghost,
      alpha: 0,
      scale: 0.5,
      duration: playerConfig.dashGhostLifespanMs,
      onComplete: () => this.particles.release(ghost),
    });
  }

  destroy(): void {
    super.destroy();
  }
}
