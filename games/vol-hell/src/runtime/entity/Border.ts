import Phaser from 'phaser';
import { borderConfig, type BorderBounds } from '@/config/border';
import { RENDER_DEPTH } from '@/config/layers';

/**
 * Saha sınırı — kameradan küçük bir dikdörtgen.
 * Hiçbir şey (oyuncu, mermi, düşman) dışarı çıkamaz.
 * Normal oyuncu mermileri duvardan sekebilir; kule mermileri sınır temasında
 * `TurretShot` tarafından sekmeden yok edilir. Oyuncu ve düşman duvara çarpar.
 */
export class Border {
  readonly graphics: Phaser.GameObjects.Graphics;
  bounds: BorderBounds;
  private readonly sceneRef: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.sceneRef = scene;
    const { width, height } = scene.scale;
    this.bounds = this.computeBounds(width, height);

    this.graphics = scene.add.graphics();
    this.graphics.setDepth(RENDER_DEPTH.border);
    this.draw();

    scene.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
  }

  private computeBounds(width: number, height: number): BorderBounds {
    // Cok dar pencerede sabit margin `right < left` uretir; Phaser.Math.Clamp
    // min > max durumunda min dondurdugu icin her sey sol kenara yapisir ve
    // oyun oynanamaz hale gelirdi. Margin viewport'un bir oranina kelepcelenir.
    const margin = Math.min(
      borderConfig.margin,
      width * borderConfig.maxMarginRatio,
      height * borderConfig.maxMarginRatio,
    );
    return {
      left: margin,
      right: width - margin,
      top: margin,
      bottom: height - margin,
      width: width - margin * 2,
      height: height - margin * 2,
      centerX: width / 2,
      centerY: height / 2,
    };
  }

  private onResize(gameSize: Phaser.Structs.Size): void {
    this.bounds = this.computeBounds(gameSize.width, gameSize.height);
    this.draw();
  }

  private draw(): void {
    const { left, top, width, height } = this.bounds;
    this.graphics.clear();
    this.graphics.lineStyle(borderConfig.lineWidth, borderConfig.color, borderConfig.alpha);
    this.graphics.strokeRect(left, top, width, height);
  }

  /** Verilen pozisyonu sınır içine clamp eder. */
  clamp(x: number, y: number, radius: number): { x: number; y: number } {
    return {
      x: Phaser.Math.Clamp(x, this.bounds.left + radius, this.bounds.right - radius),
      y: Phaser.Math.Clamp(y, this.bounds.top + radius, this.bounds.bottom - radius),
    };
  }

  /** X eksenini sınır içine clamp eder — obje yaratmaz. */
  clampX(x: number, radius: number): number {
    return Phaser.Math.Clamp(x, this.bounds.left + radius, this.bounds.right - radius);
  }

  /** Y eksenini sınır içine clamp eder — obje yaratmaz. */
  clampY(y: number, radius: number): number {
    return Phaser.Math.Clamp(y, this.bounds.top + radius, this.bounds.bottom - radius);
  }

  destroy(): void {
    this.sceneRef.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.graphics.destroy();
  }
}
