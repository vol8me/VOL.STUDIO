import type Phaser from 'phaser';
import { FX } from '@/config/fx';
import { PALETTE } from '@/config/palette';

export interface AimGuideFrame {
  /** Mermi yolu `x0,y0,x1,y1,…`: ilk nokta ekrandaki namlu ucudur, son nokta tahmini varış. */
  readonly path: ArrayLike<number>;
  /** `path` içindeki nokta sayısı. */
  readonly length: number;
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
    if (!frame || frame.length < 2) return;
    const style = FX.aimGuide;
    const color = frame.aligned ? PALETTE.energy : PALETTE.aimTurning;
    const pulse = style.alpha + Math.sin(timeMs / style.pulseMs) * style.pulseAlpha;
    graphics.lineStyle(style.haloWidth, color, pulse * style.haloAlpha);
    this.trace(frame);
    graphics.lineStyle(style.coreWidth, color, pulse);
    this.trace(frame);
    const last = (frame.length - 1) * 2;
    graphics.strokeCircle(frame.path[last], frame.path[last + 1], style.markerRadius);
  }

  /** Yörüngeyi seyrelterek çizer; son nokta her zaman çizilir. */
  private trace(frame: AimGuideFrame): void {
    const graphics = this.graphics;
    const path = frame.path;
    graphics.beginPath();
    graphics.moveTo(path[0], path[1]);
    const last = frame.length - 1;
    for (let point = FX.aimGuide.stride; point < last; point += FX.aimGuide.stride)
      graphics.lineTo(path[point * 2], path[point * 2 + 1]);
    graphics.lineTo(path[last * 2], path[last * 2 + 1]);
    graphics.strokePath();
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
