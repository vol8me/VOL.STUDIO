import type Phaser from 'phaser';
import { clamp01 } from '@volstudio/core/math/interpolation';
import { FEEL } from '@/config/feel';
import { FX } from '@/config/fx';
import { PALETTE } from '@/config/palette';
import { WORLD } from '@/config/world';
import type { World } from '@/sim/world/World';

const GRID_WIDTH = 1;
/** Her bu kadar ızgara hücresinde bir ana çizgi. */
const BORDER_WIDTH = 4;
const FLASH = FX.wallFlash;
/** Sekme dönüşünde tek karede yankının tamamı sönmesin diye süre tavanı. */
const MAX_FLASH_DELTA_MS = 50;

interface Flash {
  x: number;
  y: number;
  vertical: boolean;
  strength: number;
  remainingMs: number;
}

/**
 * Boş dünyanın zemini: ızgara ve sınır ayrı katmanlarda bir kez çizilir;
 * ızgara kapatılsa da sınır görünür kalır. Duvar çarpması
 * sınırın o bölümünü şiddetle orantılı parlatır; yalnız yankı katmanı her
 * karede yeniden çizilir.
 */
export class ArenaView {
  private readonly ground: Phaser.GameObjects.Graphics;
  private readonly grid: Phaser.GameObjects.Graphics;
  private readonly border: Phaser.GameObjects.Graphics;
  private readonly flashLayer: Phaser.GameObjects.Graphics;
  private flash: Flash | null = null;

  constructor(
    scene: Phaser.Scene,
    private readonly world: World,
  ) {
    this.ground = scene.add.graphics().setDepth(-110);
    this.grid = scene.add.graphics().setDepth(-100);
    this.border = scene.add.graphics().setDepth(-95);
    this.flashLayer = scene.add.graphics().setDepth(-90);
    this.draw();
  }

  get gridVisible(): boolean {
    return this.grid.visible;
  }

  setGridVisible(visible: boolean): void {
    this.grid.setVisible(visible);
  }

  /** Duvar çarpmasını görünür kılar; süren yankı yenisiyle değişir. */
  strike(x: number, y: number, normalX: number, speed: number): void {
    this.flash = {
      x,
      y,
      vertical: Math.abs(normalX) > 0.5,
      strength: clamp01(speed / FEEL.wall.fullSpeed),
      remainingMs: FLASH.durationMs,
    };
  }

  update(deltaMs: number): void {
    if (!this.flash) return;
    const dt = Number.isFinite(deltaMs) && deltaMs > 0 ? Math.min(deltaMs, MAX_FLASH_DELTA_MS) : 0;
    this.flash.remainingMs -= dt;
    if (this.flash.remainingMs <= 0) {
      this.flash = null;
      this.flashLayer.clear();
      return;
    }
    const flash = this.flash;
    const life = clamp01(flash.remainingMs / FLASH.durationMs);
    const half = (FLASH.span * (0.4 + 0.6 * flash.strength)) / 2;
    this.flashLayer.clear();
    this.flashLayer.lineStyle(
      FLASH.width * (0.5 + 0.5 * flash.strength),
      PALETTE.impact,
      life * (0.35 + 0.65 * flash.strength),
    );
    const { width, height } = this.world;
    if (flash.vertical) {
      const x = flash.x < width / 2 ? 0 : width;
      this.flashLayer.lineBetween(
        x,
        Math.max(0, flash.y - half),
        x,
        Math.min(height, flash.y + half),
      );
    } else {
      const y = flash.y < height / 2 ? 0 : height;
      this.flashLayer.lineBetween(
        Math.max(0, flash.x - half),
        y,
        Math.min(width, flash.x + half),
        y,
      );
    }
  }

  destroy(): void {
    this.ground.destroy();
    this.grid.destroy();
    this.border.destroy();
    this.flashLayer.destroy();
  }

  private draw(): void {
    const { width, height, gridStep } = this.world;
    this.ground.fillStyle(PALETTE.sand, 1);
    this.ground.fillRect(0, 0, width, height);
    for (const major of [false, true]) {
      const style = major ? PALETTE.gridMajor : PALETTE.gridMinor;
      this.grid.lineStyle(GRID_WIDTH * (major ? 1.5 : 1), style.color, style.alpha);
      this.grid.beginPath();
      for (let index = 1; index * gridStep < width; index++) {
        if ((index % WORLD.gridMajorEvery === 0) !== major) continue;
        this.grid.moveTo(index * gridStep, 0);
        this.grid.lineTo(index * gridStep, height);
      }
      for (let index = 1; index * gridStep < height; index++) {
        if ((index % WORLD.gridMajorEvery === 0) !== major) continue;
        this.grid.moveTo(0, index * gridStep);
        this.grid.lineTo(width, index * gridStep);
      }
      this.grid.strokePath();
    }
    this.border.lineStyle(BORDER_WIDTH, PALETTE.border, 1);
    this.border.strokeRect(0, 0, width, height);
  }
}
