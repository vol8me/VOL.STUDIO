import type Phaser from 'phaser';
import { Diagnostics } from '@volstudio/core';
import type { TurretParams } from '@/config/abilities';
import { turretVisualConfig } from '@/config/abilities';
import { RENDER_DEPTH } from '@/config/layers';
import { sfxVolumes } from '@/config/audio';
import { gameAudio } from '@/app/services';
import type { EffectManager } from '@/runtime/systems/EffectManager';
import { EntityHealthBar } from './EntityHealthBar';
import type { Enemy } from './Enemy';
import { TurretShot } from './TurretShot';

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
    Diagnostics.getInstance()?.recordEvent('turretPlaced', { x, y });
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

  /** Uçuşta olan kule mermisi sayısı — teşhis/test için. */
  get activeShotCount(): number {
    return this.shots.length;
  }

  /** Kuleyi sürer: kurulum animasyonu, hedefleme, atış ve mermiler. */
  update(deltaMs: number, enemies: readonly Enemy[]): void {
    // Mermiler kule yıkılsa bile yolunu tamamlar; bu yüzden alive kontrolünden önce.
    this.updateShots(deltaMs, enemies);
    if (!this.alive) return;

    this.updateSpawnAnimation(deltaMs);
    this.updateRecoil(deltaMs);

    const target = this.findTarget(enemies);
    if (target) {
      this.aimAngle = Math.atan2(target.y - this.body.y, target.x - this.body.x);
    }
    this.barrel.setRotation(this.aimAngle);
    this.applyBarrelOffset();

    this.fireTimerMs += deltaMs;
    if (!target || this.fireTimerMs < this.params.fireIntervalMs) return;

    // Sayaç yalnızca ATIŞ yapıldığında sıfırlanır: hedefsiz beklerken dolu
    // kalır ve menzile giren ilk düşmana anında ateş edilir.
    this.fireTimerMs = 0;
    this.fire(target);
  }

  /** Kuleye hasar verir. Yıkılırsa true döner. */
  takeDamage(amount: number): boolean {
    if (!this.alive || amount <= 0) return false;

    this.health = Math.max(0, this.health - amount);
    this.healthBar.setRatio(this.health / this.maxHealth, true, this.body.x);
    this.effects.play('turretHit', this.body.x, this.body.y);

    if (this.health > 0) return false;

    this.destroyWithEffect();
    return true;
  }

  /** Kuleyi yok eder — yıkılma efektiyle (yeni kule eskisini bu şekilde kaldırır). */
  destroyWithEffect(): void {
    if (!this.alive) return;
    this.effects.play('turretDestroy', this.body.x, this.body.y);
    Diagnostics.getInstance()?.recordEvent('turretDestroyed', { x: this.body.x, y: this.body.y });
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
      shot.update(deltaMs, enemies);
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
