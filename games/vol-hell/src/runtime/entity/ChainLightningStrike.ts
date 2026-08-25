import type Phaser from 'phaser';
import type { Random } from '@volstudio/core';
import type { ChainLightningParams } from '@/config/abilities';
import { chainVisualConfig } from '@/config/abilities';
import { RENDER_DEPTH } from '@/config/layers';
import type { EffectManager } from '@/runtime/systems/EffectManager';
import { findNearestEnemy } from '@/runtime/ability/types';
import type { Enemy } from './Enemy';
import { safeDeltaMs } from '@/runtime/utils/numeric';

/** Zikzak bir kolun kırılma noktaları — sabit dizi, her frame yeniden çizilir. */
interface LightningArc {
  points: number[];
  ageMs: number;
}

/**
 * Zincir yıldırım — bir hedefe vurur, sonra yakındaki bir sonraki düşmana
 * sıçrar. Hasar her sıçramada AYNIDIR (falloff yok).
 *
 * Mermi değildir: uçuş yerine ZAMANLI sıçrama yapar (`hopIntervalMs`), böylece
 * zincir gözle takip edilebilir. Kol düz bir çizgi değil, seed'li PRNG ile
 * kırılmış bir zikzaktır ve iki katman çizilir (kalın parıltı + ince çekirdek);
 * düz ince çizgi ekranda kayboluyordu.
 */
export class ChainLightningStrike {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly arcs: LightningArc[] = [];
  private readonly hit = new Set<Enemy>();
  private currentX: number;
  private currentY: number;
  private hopsRemaining: number;
  private hopTimerMs = 0;
  private chainFinished = false;
  private active = true;

  constructor(
    scene: Phaser.Scene,
    originX: number,
    originY: number,
    private readonly effects: EffectManager,
    private readonly params: ChainLightningParams,
    private readonly random: Random,
    /** Sıçrama sayısı kartlarla artırılabilir; taban değerin üstüne biner. */
    bonusBounces = 0,
  ) {
    this.currentX = originX;
    this.currentY = originY;
    // İlk hedef + `bounces` kadar sıçrama.
    this.hopsRemaining = 1 + Math.max(0, params.bounces + bonusBounces);

    this.graphics = scene.add.graphics();
    this.graphics.setDepth(RENDER_DEPTH.abilityVisual);
  }

  get isActive(): boolean {
    return this.active;
  }

  update(deltaMs: number, enemies: readonly Enemy[]): void {
    if (!this.active) return;
    const safeDelta = safeDeltaMs(deltaMs);

    this.advanceChain(safeDelta, enemies);
    this.renderArcs(safeDelta);

    // Zincir bittikten sonra kollar sönene kadar sahnede kalır.
    if (this.chainFinished && this.arcs.length === 0) {
      this.destroy();
    }
  }

  destroy(): void {
    if (!this.active) return;
    this.active = false;
    this.graphics.destroy();
  }

  /** Sıçrama zamanlayıcısını yürütür ve sıradaki hedefi vurur. */
  private advanceChain(deltaMs: number, enemies: readonly Enemy[]): void {
    if (this.chainFinished) return;

    this.hopTimerMs -= deltaMs;
    if (this.hopTimerMs > 0) return;

    const isFirst = this.hit.size === 0;
    const range = isFirst ? this.params.firstRangePx : this.params.hopRangePx;
    const target = findNearestEnemy(enemies, this.currentX, this.currentY, range, this.hit);

    // Menzilde hedef kalmadıysa zincir biter — bekleyen sıçramalar boşa gider.
    if (!target) {
      this.chainFinished = true;
      return;
    }

    this.arcs.push({
      points: this.buildArcPoints(this.currentX, this.currentY, target.x, target.y),
      ageMs: 0,
    });

    this.effects.play('chainHop', target.x, target.y);
    this.hit.add(target);
    this.currentX = target.x;
    this.currentY = target.y;
    // Hasar her sıçramada sabit — zincirin sonu da başı kadar tehlikeli.
    target.takeDamage(this.params.damage);

    this.hopsRemaining -= 1;
    this.hopTimerMs = this.params.hopIntervalMs;
    if (this.hopsRemaining <= 0) {
      this.chainFinished = true;
    }
  }

  /**
   * İki nokta arasında zikzak bir yol üretir: doğru üzerinde eşit aralıklı
   * noktalar, her biri doğrunun DİKİNE rastgele sapmış. Sapma seed'li PRNG
   * ile üretilir — aynı koşu aynı görüntüyü verir.
   */
  private buildArcPoints(fromX: number, fromY: number, toX: number, toY: number): number[] {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const length = Math.hypot(dx, dy) || 1;
    // Doğruya dik birim vektör.
    const normalX = -dy / length;
    const normalY = dx / length;

    const points: number[] = [fromX, fromY];
    for (let i = 1; i < chainVisualConfig.segments; i++) {
      const t = i / chainVisualConfig.segments;
      // Uçlarda sapma sıfıra yaklaşır: kol hedeflere tam oturur.
      const taper = Math.sin(t * Math.PI);
      const offset = (this.random.next() * 2 - 1) * chainVisualConfig.jitterPx * taper;
      points.push(fromX + dx * t + normalX * offset, fromY + dy * t + normalY * offset);
    }
    points.push(toX, toY);

    return points;
  }

  /** Kolları yaşlandırır ve sönenleri düşürerek yeniden çizer. */
  private renderArcs(deltaMs: number): void {
    this.graphics.clear();

    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const arc = this.arcs[i];
      arc.ageMs += deltaMs;
      if (arc.ageMs >= chainVisualConfig.arcLifetimeMs) {
        this.arcs.splice(i, 1);
        continue;
      }

      const alpha = 1 - arc.ageMs / chainVisualConfig.arcLifetimeMs;
      // Önce kalın parıltı, üstüne ince çekirdek: kol ekranda kaybolmaz.
      this.strokePath(
        arc.points,
        chainVisualConfig.glowWidthPx,
        chainVisualConfig.glowColor,
        alpha * 0.45,
      );
      this.strokePath(arc.points, chainVisualConfig.coreWidthPx, chainVisualConfig.color, alpha);
    }
  }

  private strokePath(points: number[], width: number, color: number, alpha: number): void {
    this.graphics.lineStyle(width, color, alpha);
    this.graphics.beginPath();
    this.graphics.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) {
      this.graphics.lineTo(points[i], points[i + 1]);
    }
    this.graphics.strokePath();
  }
}
