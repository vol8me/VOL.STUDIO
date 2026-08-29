import type Phaser from 'phaser';
import type { FireZoneParams } from '@/config/abilities';
import { fireZoneVisualConfig } from '@/config/abilities';
import { RENDER_DEPTH } from '@/config/layers';
import type { EffectManager } from '@/runtime/systems/EffectManager';
import type { Enemy } from './Enemy';
import { safeDeltaMs } from '@/runtime/utils/numeric';

/**
 * Zemine serilen ateş alanı — içinde kalan düşmanlara düzenli aralıklarla
 * hasar verir, süresi dolunca söner.
 *
 * Görsel olarak üç katman: nabız gibi genişleyip daralan DIŞ HALKA, içeride
 * yanıp sönen KOR DOLGU ve alan boyunca yükselen kıvılcımlar. Tek düz daire
 * "ucuz" duruyordu; alan artık yaşıyor ve tehlikeli olduğu okunuyor.
 */
export class FireZone {
  private readonly fill: Phaser.GameObjects.Arc;
  private readonly ring: Phaser.GameObjects.Arc;
  private elapsedMs = 0;
  private tickTimerMs = 0;
  private emberTimerMs = 0;
  private active = true;

  constructor(
    scene: Phaser.Scene,
    private readonly x: number,
    private readonly y: number,
    private readonly effects: EffectManager,
    private readonly params: FireZoneParams,
  ) {
    this.fill = scene.add.circle(x, y, params.radius, params.color, fireZoneVisualConfig.fillAlpha);
    this.fill.setDepth(RENDER_DEPTH.abilityGround);

    this.ring = scene.add.circle(x, y, params.radius, params.color, 0);
    this.ring.setStrokeStyle(fireZoneVisualConfig.ringWidthPx, params.color, 0.9);
    this.ring.setDepth(RENDER_DEPTH.abilityGround);

    this.effects.play('fireZoneSpawn', x, y);
  }

  get isActive(): boolean {
    return this.active;
  }

  /** Alanı yürütür: nabız, kıvılcım, hasar tick'leri ve ömür sonunda sönme. */
  update(deltaMs: number, enemies: readonly Enemy[]): void {
    if (!this.active) return;
    const safeDelta = safeDeltaMs(deltaMs);

    // Süre sınırında önce o ana kadar düşen hasar tick'ini uygula. Aksi halde
    // duration, tick aralığının tam katı olduğunda son tick sessizce kaybolur.
    const remainingMs = Math.max(0, this.params.durationMs - this.elapsedMs);
    const appliedDelta = Math.min(safeDelta, remainingMs);
    this.elapsedMs += appliedDelta;

    this.updateVisuals(appliedDelta);
    this.updateDamage(appliedDelta, enemies);

    if (this.elapsedMs >= this.params.durationMs) this.destroy();
  }

  destroy(): void {
    if (!this.active) return;
    this.active = false;
    this.fill.destroy();
    this.ring.destroy();
  }

  /** Nabız + sönümlenme + sürekli kıvılcım. */
  private updateVisuals(deltaMs: number): void {
    const remainingRatio = 1 - this.elapsedMs / this.params.durationMs;
    // Son çeyrekte sönerek kaybolur; aniden yok olmaz.
    const fade =
      remainingRatio < fireZoneVisualConfig.fadeStartRatio
        ? remainingRatio / fireZoneVisualConfig.fadeStartRatio
        : 1;

    const phase = (this.elapsedMs / fireZoneVisualConfig.pulsePeriodMs) * Math.PI * 2;
    const pulse = (Math.sin(phase) + 1) / 2;

    this.fill.setAlpha(
      fade * (fireZoneVisualConfig.fillAlpha + pulse * fireZoneVisualConfig.fillPulseAlpha),
    );
    // Halka nabızla hafifçe genişler — alan "nefes alır".
    this.ring.setScale(1 + pulse * fireZoneVisualConfig.ringPulseScale);
    this.ring.setAlpha(fade);

    this.emberTimerMs += deltaMs;
    if (this.emberTimerMs < fireZoneVisualConfig.emberIntervalMs) return;
    this.emberTimerMs -= fireZoneVisualConfig.emberIntervalMs;
    this.effects.play('fireZoneTick', this.x, this.y);
  }

  private updateDamage(deltaMs: number, enemies: readonly Enemy[]): void {
    this.tickTimerMs += deltaMs;
    const tickMs = this.params.tickMs;
    if (!(tickMs > 0)) return;

    const maxTicks = Math.max(1, Math.ceil(this.params.durationMs / tickMs) + 1);
    let ticks = 0;
    while (this.tickTimerMs >= tickMs && ticks < maxTicks) {
      this.tickTimerMs -= tickMs;
      ticks++;
      for (const enemy of enemies) {
        if (!enemy.isAlive) continue;
        if (Math.hypot(enemy.x - this.x, enemy.y - this.y) > this.params.radius + enemy.radius) {
          continue;
        }
        // Yanan düşmanın üstünde kıvılcım: hasarın kimden geldiği görünür olsun.
        this.effects.play('fireZoneBurn', enemy.x, enemy.y);
        enemy.takeDamage(this.params.damagePerTick);
      }
    }

    // Süre finite olduğu için toplam tick sayısı duration/tick ile sınırlıdır;
    // büyük frame'de bile final tick kaybolmaz.
  }
}
