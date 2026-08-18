import type Phaser from 'phaser';
import { PlayerController, StatBlock, Vector2, Diagnostics } from '@volstudio/core';
import { playerConfig } from '@/config/player';
import { bulletConfig } from '@/config/bullet';
import { RENDER_DEPTH } from '@/config/layers';
import type { Border } from './Border';
import type { EffectManager } from '@/runtime/systems/EffectManager';

/**
 * Oyuncu entity'si. PlayerController composition ile sprite'ı tutar.
 * Placeholder görsel: Phaser.GameObjects.Arc (texture gerekmez).
 * Arc, Shape üzerinden Transform implement eder — cast gerekmez.
 *
 * Stat'lar `StatBlock` üzerinden okunur (düşmanlarla ortak motor); config
 * değerleri yalnızca TABAN'dır. Kart/buff sistemleri config'e
 * dokunmadan modifier ekleyerek etki eder.
 *
 * Dash sistemi:
 * - Space tuşu ile tetiklenir.
 * - Cooldown tabanlı: dash sonrası dashChargeMs süresince şarj dolar (hareket halindeyken de).
 * - Dash süresince i-frame aktif — hasar alınmaz.
 * - Dash ghost: yarı saydam kopyalar bırakılır.
 */
export class Player extends PlayerController {
  private readonly arc: Phaser.GameObjects.Arc;
  private readonly stats: StatBlock;
  private health: number;
  /** Son görülen maksimum can — kart maks. canı değiştirdiğinde farkı yakalar. */
  private lastMaxHealth: number;
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
  private readonly effects: EffectManager;

  constructor(scene: Phaser.Scene, x: number, y: number, effects: EffectManager) {
    const arc = scene.add.circle(x, y, playerConfig.hitboxRadius, playerConfig.color, 1);
    arc.setStrokeStyle(2, playerConfig.dashColor, 0.8);
    // Oyuncu kalabalıkta düşman gövdelerinin altında kaybolmamalı.
    arc.setDepth(RENDER_DEPTH.player);
    super('player', arc);
    this.arc = arc;
    // fireRate = atışlar arası bekleme (ms); düşük değer hızlı ateş demektir.
    this.stats = new StatBlock({
      damage: bulletConfig.damage,
      speed: playerConfig.moveSpeed,
      health: playerConfig.maxHealth,
      fireRate: bulletConfig.fireCooldownMs,
    });
    this.health = this.stats.getValue('health');
    this.lastMaxHealth = this.health;
    this.effects = effects;
  }

  /**
   * Oyuncunun stat bloğu — mermi hasarı/ateş hızı için BulletManager,
   * kart efektleri için dışarıdan modifier eklenerek kullanılır.
   */
  getStats(): StatBlock {
    return this.stats;
  }

  /** Modifier'lar uygulanmış maksimum can. */
  getMaxHealth(): number {
    return this.stats.getValue('health');
  }

  /**
   * Maksimum can kartlarla değişebilir; mevcut canı buna göre ayarlar.
   *
   * Artışta kazanılan kadar can HEMEN verilir (yoksa "+60 can" kartı o an
   * hiçbir şey yapmaz, yalnızca barın tavanını yükseltir); azalışta mevcut can
   * yeni tavana kelepçelenir.
   */
  private syncMaxHealth(): void {
    const max = this.getMaxHealth();
    if (max === this.lastMaxHealth) return;

    const delta = max - this.lastMaxHealth;
    this.lastMaxHealth = max;
    this.health = Math.max(0, Math.min(max, this.health + Math.max(0, delta)));
  }

  /**
   * Dash hızı. Taban dash hızı, hız stat'ının tabana oranıyla ölçeklenir;
   * böylece "hız +%20" veren bir kart dash'i de aynı oranda hızlandırır.
   */
  private getDashSpeed(): number {
    return playerConfig.dashSpeed * (this.stats.getValue('speed') / playerConfig.moveSpeed);
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
    this.syncMaxHealth();
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

    // Hareket — negatif hız modifier'ı oyuncuyu ters yöne sürüklerdi.
    const speed = Math.max(0, isDashing ? this.getDashSpeed() : this.stats.getValue('speed'));
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
    this.effects.play('playerHit', this.arc.x, this.arc.y);

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
    const max = this.getMaxHealth();
    if (max <= 0) return 0;
    // Maks. can sonradan düşerse (takas kartı) oran 1'i aşmamalı.
    return Math.min(1, this.health / max);
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

  /** Dash izi — konumda sönümlenen bir hayalet bırakır. */
  private spawnGhost(): void {
    this.effects.play('playerDash', this.arc.x, this.arc.y);
  }

  destroy(): void {
    super.destroy();
  }
}
