import type Phaser from 'phaser';
import type { TurretParams } from '@/config/abilities';
import { turretDurabilityConfig, turretVisualConfig } from '@/config/abilities';
import { RENDER_DEPTH } from '@/config/layers';
import { sfxVolumes } from '@/config/audio';
import { diagnostics, gameAudio } from '@/app/services';
import type { EffectManager } from '@/runtime/systems/EffectManager';
import type { Border } from './Border';
import { EntityHealthBar } from './EntityHealthBar';
import type { Enemy } from './Enemy';
import { TurretShot } from './TurretShot';
import { nonNegativeFinite, safeDeltaMs } from '@/runtime/utils/numeric';
import { gameConfig } from '@/config/game';

/**
 * Yerleştirilen savunma kulesi — menzilindeki en yakın düşmana namlusunu
 * çevirir ve mermi atar. Düşmanlar kuleyi hedefleyip temasla yıkabilir.
 *
 * Görsel olarak üç parçadır: gövde (daire), NAMLU (hedefe dönen, ateşte geri
 * tepen dikdörtgen) ve MENZİL halkası (soluk, kurulum anında belirgin). Atış
 * hitscan değil gerçek bir mermidir; oyuncu kulenin çalıştığını görür.
 */
export class Turret {
  private readonly body: Phaser.GameObjects.Arc;
  private readonly barrel: Phaser.GameObjects.Rectangle;
  private readonly rangeRing: Phaser.GameObjects.Arc;
  private readonly healthBar: EntityHealthBar;
  private readonly shots: TurretShot[] = [];
  private readonly maxHealth: number;
  private health: number;
  private alive = true;
  private fireTimerMs = 0;
  /** Kalabalık temasının tek frame'de kule canını silmesini önleyen ortak kapı. */
  private nextContactDamageAt = Number.NEGATIVE_INFINITY;
  /** Namlunun geri tepme miktarı (piksel) — atışta artar, hızla sönümlenir. */
  private recoilPx = 0;
  /** Kurulum animasyonunun ilerlemesi (ms). */
  private spawnAgeMs = 0;
  /** Namlunun baktığı açı (radyan) — hedef yokken son yön korunur. */
  private aimAngle = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly effects: EffectManager,
    private readonly border: Border,
    private readonly params: TurretParams,
  ) {
    this.maxHealth = params.health;
    this.health = params.health;

    // Menzil halkası: dolgusuz, çok soluk. Oyuncu kuleyi nereye kuracağını
    // bilmeden yerleştiriyordu; menzil görünmeden kule "kör" hissettiriyor.
    this.rangeRing = scene.add.circle(x, y, params.rangePx, params.color, 0);
    this.rangeRing.setStrokeStyle(1, params.strokeColor, turretVisualConfig.rangeRingAlpha);
    this.rangeRing.setDepth(RENDER_DEPTH.abilityGround);

    this.barrel = scene.add.rectangle(
      x,
      y,
      params.radius * turretVisualConfig.barrelLengthRatio,
      turretVisualConfig.barrelWidthPx,
      params.strokeColor,
      1,
    );
    // Origin sol kenarda: namlu gövdenin merkezinden DIŞA doğru uzar ve
    // döndürme merkezi gövde olur.
    this.barrel.setOrigin(0, 0.5);
    this.barrel.setDepth(RENDER_DEPTH.structure);

    this.body = scene.add.circle(x, y, params.radius, params.color, 1);
    this.body.setStrokeStyle(2, params.strokeColor, 0.9);
    this.body.setDepth(RENDER_DEPTH.structure);

    this.healthBar = new EntityHealthBar(scene, x, y, params.radius, {
      fillColor: params.strokeColor,
      depth: RENDER_DEPTH.structure,
    });
    this.healthBar.setRatio(1, true, x);

    this.effects.play('turretPlace', x, y);
    diagnostics?.recordEvent('turretPlaced', { x, y });
  }

  get x(): number {
    return this.body.x;
  }

  get y(): number {
    return this.body.y;
  }

  get radius(): number {
    return this.params.radius;
  }

  get isAlive(): boolean {
    return this.alive;
  }

  /** Kalan kule canı — HUD/diagnostic ve denge testleri için. */
  getHealth(): number {
    return this.health;
  }

  /** Kule can tavanı — oyuncu can statıyla ölçeklenmiş değer. */
  getMaxHealth(): number {
    return this.maxHealth;
  }

  /** Kule can oranı (0-1) — hasar göstergeleri için. */
  getHealthRatio(): number {
    return this.maxHealth > 0 ? Math.max(0, Math.min(1, this.health / this.maxHealth)) : 0;
  }

  /** Uçuşta olan kule mermisi sayısı — teşhis/test için. */
  get activeShotCount(): number {
    return this.shots.length;
  }

  /** Kuleyi sürer: kurulum animasyonu, hedefleme, atış ve mermiler. */
  update(deltaMs: number, enemies: readonly Enemy[]): void {
    const safeDelta = safeDeltaMs(deltaMs);
    // Mermiler kule yıkılsa bile yolunu tamamlar; bu yüzden alive kontrolünden önce.
    this.updateShots(safeDelta, enemies);
    if (!this.alive) return;

    this.updateSpawnAnimation(safeDelta);
    this.updateRecoil(safeDelta);

    const target = this.findTarget(enemies);
    if (target) {
      this.aimAngle = Math.atan2(target.y - this.body.y, target.x - this.body.x);
    }
    this.barrel.setRotation(this.aimAngle);
    this.applyBarrelOffset();

    const intervalMs = Math.max(1, nonNegativeFinite(this.params.fireIntervalMs, 1));
    this.fireTimerMs = Math.min(
      this.fireTimerMs + safeDelta,
      intervalMs * gameConfig.maxTimerCatchUpSteps,
    );
    if (!target) return;

    let shots = 0;
    while (
      this.fireTimerMs >= intervalMs &&
      shots < gameConfig.maxTimerCatchUpSteps &&
      this.alive
    ) {
      // Interval'i düşürmek, 50 ms'lik bir frame'de geçen 20 ms'lik atışı
      // kaybetmez; burst yine de bounded catch-up ile sınırlıdır.
      this.fireTimerMs -= intervalMs;
      this.fire(target);
      shots++;
    }
    if (shots >= gameConfig.maxTimerCatchUpSteps && this.fireTimerMs >= intervalMs) {
      this.fireTimerMs %= intervalMs;
    }
  }

  /** Kuleye hasar verir. Yıkılırsa true döner. */
  takeDamage(amount: number): boolean {
    if (!this.alive || !Number.isFinite(amount) || amount <= 0) return false;

    this.health = Math.max(0, this.health - nonNegativeFinite(amount));
    this.healthBar.setRatio(this.health / this.maxHealth, true, this.body.x);
    this.effects.play('turretHit', this.body.x, this.body.y);

    if (this.health > 0) return false;

    this.destroyWithEffect();
    return true;
  }

  /** Verilen oyun zamanında yeni bir düşman temas paketi kabul edebilir mi? */
  canTakeContactDamage(time: number): boolean {
    return this.alive && Number.isFinite(time) && time >= this.nextContactDamageAt;
  }

  /**
   * Düşman temasını yapı zırhından geçirir ve ortak hasar aralığını başlatır.
   * `true`, paketin kabul edildiğini anlatır; kulenin yıkılıp yıkılmadığını
   * çağıranın ayrıca bilmesine gerek yoktur (`isAlive` tek kaynaktır).
   */
  takeContactDamage(amount: number, time: number): boolean {
    if (!this.canTakeContactDamage(time) || !Number.isFinite(amount) || amount <= 0) return false;

    this.nextContactDamageAt = time + turretDurabilityConfig.contactDamageCooldownMs;
    this.takeDamage(amount * turretDurabilityConfig.contactDamageMultiplier);
    return true;
  }

  /** Kuleyi yok eder — yıkılma efektiyle (yeni kule eskisini bu şekilde kaldırır). */
  destroyWithEffect(): void {
    if (!this.alive) return;
    this.effects.play('turretDestroy', this.body.x, this.body.y);
    diagnostics?.recordEvent('turretDestroyed', { x: this.body.x, y: this.body.y });
    this.teardown();
  }

  destroy(): void {
    this.teardown();
    for (const shot of this.shots) shot.destroy();
    this.shots.length = 0;
  }

  /** Gövdeyi/namluyu kaldırır ama uçan mermileri bırakır. */
  private teardown(): void {
    if (!this.alive) return;
    this.alive = false;
    this.body.destroy();
    this.barrel.destroy();
    this.rangeRing.destroy();
    this.healthBar.destroy();
  }

  private fire(target: Enemy): void {
    this.recoilPx = turretVisualConfig.recoilPx;

    // Mermi namlunun UCUNDAN çıkar; gövdenin ortasından değil.
    const muzzleDistance = this.params.radius * turretVisualConfig.barrelLengthRatio;
    const muzzleX = this.body.x + Math.cos(this.aimAngle) * muzzleDistance;
    const muzzleY = this.body.y + Math.sin(this.aimAngle) * muzzleDistance;

    this.shots.push(
      new TurretShot(this.scene, muzzleX, muzzleY, target, this.params.damage, this.effects),
    );
    this.effects.play('turretShot', muzzleX, muzzleY, (this.aimAngle * 180) / Math.PI);
    if (gameAudio) {
      void gameAudio.playSfx('turretFire', { volume: sfxVolumes.turretFire });
    }
  }

  private updateShots(deltaMs: number, enemies: readonly Enemy[]): void {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const shot = this.shots[i];
      shot.update(deltaMs, enemies, this.border);
      if (!shot.isActive) this.shots.splice(i, 1);
    }
  }

  /** Kurulum: gövde büyüyerek oturur, menzil halkası parlayıp söner. */
  private updateSpawnAnimation(deltaMs: number): void {
    const duration = turretVisualConfig.spawnDurationMs;
    if (this.spawnAgeMs >= duration) return;

    this.spawnAgeMs = Math.min(duration, this.spawnAgeMs + deltaMs);
    const t = this.spawnAgeMs / duration;
    const eased = 1 - Math.pow(1 - t, 3);

    // Gövde 1.6x'ten 1'e oturur.
    this.body.setScale(turretVisualConfig.spawnScale - (turretVisualConfig.spawnScale - 1) * eased);
    this.barrel.setScale(eased, 1);
    // Halka kurulumda belirgin, sonra soluk bir referansa döner.
    this.rangeRing.setStrokeStyle(
      1,
      this.params.strokeColor,
      turretVisualConfig.rangeRingAlpha +
        (turretVisualConfig.rangeRingSpawnAlpha - turretVisualConfig.rangeRingAlpha) * (1 - eased),
    );
  }

  /** Geri tepme sönümlenir — namlu yerine yavaşça döner. */
  private updateRecoil(deltaMs: number): void {
    if (this.recoilPx <= 0) return;
    const decayPerMs = turretVisualConfig.recoilPx / turretVisualConfig.recoilRecoverMs;
    this.recoilPx = Math.max(0, this.recoilPx - decayPerMs * deltaMs);
  }

  /** Namluyu geri tepme kadar gövdenin içine çeker. */
  private applyBarrelOffset(): void {
    this.barrel.x = this.body.x - Math.cos(this.aimAngle) * this.recoilPx;
    this.barrel.y = this.body.y - Math.sin(this.aimAngle) * this.recoilPx;
  }

  private findTarget(enemies: readonly Enemy[]): Enemy | null {
    let best: Enemy | null = null;
    let bestDistance = this.params.rangePx;

    for (const enemy of enemies) {
      if (!enemy.isAlive) continue;
      const distance = Math.hypot(enemy.x - this.body.x, enemy.y - this.body.y);
      if (distance > bestDistance) continue;
      best = enemy;
      bestDistance = distance;
    }

    return best;
  }
}
