import type Phaser from 'phaser';
import { arenaConfig } from '@/config/arena';

const ARENA_DEPTH = -100;
const GRID_LINE_WIDTH_PX = 1;

/** Sabit oyun alanının zeminini, ızgarasını ve sınırını çizer. */
export class Arena {
  readonly graphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(ARENA_DEPTH);
    this.draw();
  }

  destroy(): void {
    this.graphics.destroy();
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
}
