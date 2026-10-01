import type Phaser from 'phaser';
import { FX } from '@/config/fx';
import { PALETTE } from '@/config/palette';

export interface AimGuideFrame {
  readonly x: number;
  readonly y: number;
  readonly endX: number;
  readonly endY: number;
  readonly aligned: boolean;
}

export class AimGuide {
  private readonly graphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(FX.aimGuide.depth);
  }

  draw(frame: AimGuideFrame | null, timeMs: number): void {
    const graphics = this.graphics;
    graphics.clear();
    if (!frame) return;
    const style = FX.aimGuide;
    const color = frame.aligned ? PALETTE.energy : PALETTE.aimTurning;
    const pulse = style.alpha + Math.sin(timeMs / style.pulseMs) * style.pulseAlpha;
    graphics.lineStyle(style.haloWidth, color, pulse * style.haloAlpha);
    graphics.lineBetween(frame.x, frame.y, frame.endX, frame.endY);
    graphics.lineStyle(style.coreWidth, color, pulse);
    graphics.lineBetween(frame.x, frame.y, frame.endX, frame.endY);
    graphics.strokeCircle(frame.endX, frame.endY, style.markerRadius);
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
