import type { Rect } from '@volstudio/core/math/geometry';
import type Phaser from 'phaser';

export interface WorldBoundaryStyle {
  readonly thicknessUnits: number;
  readonly color: number;
}

export class WorldBoundaryRenderer {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private destroyed = false;

  constructor(scene: Phaser.Scene, bounds: Readonly<Rect>, style: WorldBoundaryStyle) {
    const inset = style.thicknessUnits / 2;
    this.graphics = scene.add.graphics().setDepth(-950);
    this.graphics.lineStyle(style.thicknessUnits, style.color, 1);
    this.graphics.strokeRoundedRect(
      bounds.x + inset,
      bounds.y + inset,
      bounds.width - style.thicknessUnits,
      bounds.height - style.thicknessUnits,
      inset,
    );
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.graphics.destroy();
  }
}
