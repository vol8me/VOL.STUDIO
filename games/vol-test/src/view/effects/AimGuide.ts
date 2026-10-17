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
  private readonly end = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(FX.aimGuide.depth);
  }

  /**
   * `presence` (0..1) çizginin görünürlüğüdür: alfa ile birlikte çizgi namludan o oranda uzanır,
   * sönerken namluya doğru geri çekilir.
   */
  draw(frame: AimGuideFrame | null, timeMs: number, presence = 1): void {
    const graphics = this.graphics;
    graphics.clear();
    if (!frame || frame.length < 2 || presence <= 0) return;
    const style = FX.aimGuide;
    const color = frame.aligned ? PALETTE.energy : PALETTE.aimTurning;
    const pulse = (style.alpha + Math.sin(timeMs / style.pulseMs) * style.pulseAlpha) * presence;
    const reach = (frame.length - 1) * Math.min(1, presence * style.revealGain);
    graphics.lineStyle(style.haloWidth, color, pulse * style.haloAlpha);
    const end = this.trace(frame, reach);
    graphics.lineStyle(style.coreWidth, color, pulse);
    this.trace(frame, reach);
    graphics.strokeCircle(end.x, end.y, style.markerRadius * (0.6 + 0.4 * presence));
  }

  /**
   * Yörüngeyi namludan `reach` örnek uzaklığa kadar seyrelterek çizer; uç noktası örnekler arasında
   * ara değerlenir ve döndürülür (işaret orada durur).
   */
  private trace(frame: AimGuideFrame, reach: number): { x: number; y: number } {
    const graphics = this.graphics;
    const path = frame.path;
    const whole = Math.min(frame.length - 1, Math.floor(reach));
    const next = Math.min(frame.length - 1, whole + 1);
    const fraction = whole === next ? 0 : reach - whole;
    const end = this.end;
    end.x = path[whole * 2] + (path[next * 2] - path[whole * 2]) * fraction;
    end.y = path[whole * 2 + 1] + (path[next * 2 + 1] - path[whole * 2 + 1]) * fraction;
    graphics.beginPath();
    graphics.moveTo(path[0], path[1]);
    for (let point = FX.aimGuide.stride; point <= whole; point += FX.aimGuide.stride)
      graphics.lineTo(path[point * 2], path[point * 2 + 1]);
    graphics.lineTo(end.x, end.y);
    graphics.strokePath();
    return end;
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
