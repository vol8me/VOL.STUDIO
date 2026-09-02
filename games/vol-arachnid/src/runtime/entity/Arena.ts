import type Phaser from 'phaser';
import { clamp, clamp01 } from '@volstudio/core';
import { arenaConfig } from '@/config/arena';
import type { WallImpact } from '@/runtime/entity/ArachnidBody';

const ARENA_DEPTH = -100;
const IMPACT_DEPTH = -90;
const GRID_LINE_WIDTH_PX = 1;
/**
 * Tek karede tüketilebilecek en büyük süre. Sekme sonrası ilk kare yüzlerce
 * milisaniye olabilir; kelepçesiz bir yankı o karede tamamen yanıp söner ve
 * çarpma hiç görülmez.
 */
const MAX_FLASH_DELTA_MS = 50;

interface ImpactFlash {
  x: number;
  y: number;
  /** Duvar dikey mi (normal ±X)? Parlayan yay bu eksende uzanır. */
  vertical: boolean;
  strength01: number;
  remainingMs: number;
}

/**
 * Sabit oyun alanının zeminini, ızgarasını, sınırını ve sınır çarpmalarının
 * görsel yankısını çizer.
 *
 * Çarpma yankısı ayrı bir katmandadır: zemin bir kez çizilip bırakılır, yalnız
 * yankı katmanı her karede yeniden çizilir.
 */
export class Arena {
  readonly graphics: Phaser.GameObjects.Graphics;
  readonly impactGraphics: Phaser.GameObjects.Graphics;
  private flash: ImpactFlash | null = null;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(ARENA_DEPTH);
    this.impactGraphics = scene.add.graphics();
    this.impactGraphics.setDepth(IMPACT_DEPTH);
    this.draw();
  }

  /** Sınır çarpmasını görünür kılar; süren bir yankı yenisiyle DEĞİŞTİRİLİR. */
  strike(impact: WallImpact): void {
    this.flash = {
      x: impact.x,
      y: impact.y,
      vertical: Math.abs(impact.normalX) > Math.abs(impact.normalY),
      strength01: clamp01(impact.strength01),
      remainingMs: arenaConfig.impact.durationMs,
    };
  }

  update(deltaMs: number): void {
    if (!this.flash) return;
    const dt = Number.isFinite(deltaMs) && deltaMs > 0 ? Math.min(deltaMs, MAX_FLASH_DELTA_MS) : 0;
    this.flash.remainingMs -= dt;
    if (this.flash.remainingMs <= 0) {
      this.flash = null;
      this.impactGraphics.clear();
      return;
    }
    this.drawFlash(this.flash);
  }

  destroy(): void {
    this.graphics.destroy();
    this.impactGraphics.destroy();
  }

  private draw(): void {
    const { widthPx, heightPx, gridStepPx } = arenaConfig;

    this.graphics.lineStyle(GRID_LINE_WIDTH_PX, arenaConfig.gridColor, 1);
    this.graphics.beginPath();
    for (let x = gridStepPx; x < widthPx; x += gridStepPx) {
      this.graphics.moveTo(x, 0);
      this.graphics.lineTo(x, heightPx);
    }
    for (let y = gridStepPx; y < heightPx; y += gridStepPx) {
      this.graphics.moveTo(0, y);
      this.graphics.lineTo(widthPx, y);
    }
    this.graphics.strokePath();

    this.graphics.lineStyle(arenaConfig.borderWidthPx, arenaConfig.borderColor, 1);
    this.graphics.strokeRect(0, 0, widthPx, heightPx);
  }

  /**
   * Çarpma noktası çevresinde sınırın bir parçasını parlatır. Uzunluk ve
   * kalınlık şiddetle, saydamlık kalan süreyle ölçeklenir.
   */
  private drawFlash(flash: ImpactFlash): void {
    const { impact, widthPx, heightPx } = arenaConfig;
    const life = clamp01(flash.remainingMs / impact.durationMs);
    const half = (impact.spanPx * (0.4 + 0.6 * flash.strength01)) / 2;

    this.impactGraphics.clear();
    this.impactGraphics.lineStyle(
      impact.widthPx * (0.5 + 0.5 * flash.strength01),
      impact.color,
      life * (0.35 + 0.65 * flash.strength01),
    );
    this.impactGraphics.beginPath();
    if (flash.vertical) {
      this.impactGraphics.moveTo(flash.x, clamp(flash.y - half, 0, heightPx));
      this.impactGraphics.lineTo(flash.x, clamp(flash.y + half, 0, heightPx));
    } else {
      this.impactGraphics.moveTo(clamp(flash.x - half, 0, widthPx), flash.y);
      this.impactGraphics.lineTo(clamp(flash.x + half, 0, widthPx), flash.y);
    }
    this.impactGraphics.strokePath();
  }
}
