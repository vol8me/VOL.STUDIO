import type Phaser from 'phaser';
import { PlayerController, Vector2, Diagnostics } from '@volstudio/core';
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
    const arc = scene.add.circle(x, y, playerConfig.hitboxRadius, playerConfig.color, 1);
    arc.setStrokeStyle(2, playerConfig.dashColor, 0.8);
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
        this.arc.setVisible(
          Math.floor(this.invulnerabilityTimer / playerConfig.invulnerabilityFlashIntervalMs) %
            2 ===
            0,
        );
      }
    }

    // Hasar flash efekti — hasarı engellemez, sadece görsel geri bildirim
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= delta;
      if (this.hitFlashTimer <= 0 && !this.dashing) {
        this.arc.setFillStyle(playerConfig.color, playerConfig.fillAlpha);
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
      this.arc.setFillStyle(playerConfig.dashColor, playerConfig.dashAlpha);
    } else if (!this.invulnerable) {
      this.arc.setFillStyle(playerConfig.color, playerConfig.fillAlpha);
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
    if (this.moveDirection.length() <= playerConfig.moveDirectionThreshold) {
      this.moveDirection.copyFrom(aimDirection);
    }
    this.moveDirection.normalizeInPlace();
    this.ghostTimer = 0;

    Diagnostics.getInstance()?.recordEvent('dash', {
      x: this.arc.x,
      y: this.arc.y,
      direction: { x: this.moveDirection.x, y: this.moveDirection.y },
    });

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
    this.hitFlashTimer = playerConfig.hitFlashDurationMs;
    this.arc.setFillStyle(playerConfig.hitColor, playerConfig.fillAlpha);

    Diagnostics.getInstance()?.recordEvent('playerDamaged', {
      x: this.arc.x,
      y: this.arc.y,
      amount,
      health: this.health,
    });

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

  /**
   * DIKKAT: Her cagrida AYNI Vector2 ornegi doner (GC baskisini azaltmak icin).
   * Donen degeri SAKLAMA — bir sonraki getPosition() cagrisi uzerine yazar.
   * Kalici bir kopya gerekiyorsa `.clone()` kullan.
   * (Ayni sozlesme SpatialGrid.queryNearby() icin de gecerli.)
   */
  getPosition(): Vector2 {
    this.positionBuf.set(this.arc.x, this.arc.y);
    return this.positionBuf;
  }

  /** Skalar X koordinatı — Vector2 yaratmaz. */
  getX(): number {
    return this.arc.x;
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
      playerConfig.dashColor,
      playerConfig.dashGhostAlpha,
    );
    ghost.setStrokeStyle(
      playerConfig.dashGhostStrokeWidth,
      playerConfig.ghostStrokeColor,
      playerConfig.dashGhostAlpha * playerConfig.dashGhostStrokeAlphaFactor,
    );

    scene.tweens.add({
      targets: ghost,
      alpha: 0,
      scale: playerConfig.dashGhostScaleEnd,
      duration: playerConfig.dashGhostLifespanMs,
      onComplete: () => this.particles.release(ghost),
    });
  }

  destroy(): void {
    super.destroy();
  }
}
