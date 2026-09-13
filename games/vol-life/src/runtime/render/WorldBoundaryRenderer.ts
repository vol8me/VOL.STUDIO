import type { Rect } from '@volstudio/core/math/geometry';
import type Phaser from 'phaser';

export interface WorldBoundaryStyle {
  readonly collisionInsetUnits: number;
  readonly preferredThicknessUnits: number;
  readonly minScreenPixels: number;
  readonly maxScreenPixels: number;
  readonly color: number;
}

interface BoundaryCamera {
  readonly zoom: number;
}

export class WorldBoundaryRenderer {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private renderedZoom = Number.NaN;
  private destroyed = false;

  constructor(
    scene: Phaser.Scene,
    private readonly bounds: Readonly<Rect>,
    private readonly style: WorldBoundaryStyle,
    private readonly camera: BoundaryCamera,
  ) {
    this.graphics = scene.add.graphics().setDepth(-950);
    this.update();
  }

  update(): void {
    const zoom = this.camera.zoom;
    if (!(zoom > 0) || !Number.isFinite(zoom) || zoom === this.renderedZoom) return;
    this.renderedZoom = zoom;
    const preferredPixels = this.style.preferredThicknessUnits * zoom;
    const thickness =
      Math.min(this.style.maxScreenPixels, Math.max(this.style.minScreenPixels, preferredPixels)) /
      zoom;
    const collision = this.style.collisionInsetUnits;
    const lineInset = collision - thickness / 2;
    this.graphics.clear();
    this.graphics.lineStyle(thickness, this.style.color, 1);
    this.graphics.strokeRect(
      this.bounds.x + lineInset,
      this.bounds.y + lineInset,
      this.bounds.width - lineInset * 2,
      this.bounds.height - lineInset * 2,
    );
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.graphics.destroy();
  }
}
