import type Phaser from 'phaser';
import { RENDER_DEPTH } from '@/config/layers';
import { uiConfig } from '@/config/ui';
import { hasFiniteDirection } from '@/runtime/utils/numeric';

/** Gerçek mermi üretildiğinde merminin altında kısa süre görünen nişan çizgisi. */
export class PlayerAimIndicator {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private remainingMs = 0;
  private angle = 0;
  private destroyed = false;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
    // Bullet depth'inin altında kalır; çizgi merminin önüne geçmez.
    this.graphics.setDepth(RENDER_DEPTH.bullet - 1);
    this.graphics.setVisible(false);
  }

  show(x: number, y: number, directionX: number, directionY: number): void {
    if (this.destroyed || !hasFiniteDirection(directionX, directionY)) return;
    this.graphics.setPosition(x, y);
    this.angle = Math.atan2(directionY, directionX);
    this.remainingMs = uiConfig.playerFeedback.aim.lifespanMs;
    this.graphics.setVisible(true);
    this.draw(uiConfig.playerFeedback.aim.alpha);
  }

  update(deltaMs: number, x: number, y: number): void {
    if (this.destroyed || this.remainingMs <= 0) return;
    this.remainingMs = Math.max(0, this.remainingMs - Math.max(0, deltaMs));
    if (this.remainingMs <= 0) {
      this.graphics.clear();
      this.graphics.setVisible(false);
      return;
    }

    this.graphics.setPosition(x, y);
    const fadeStart = uiConfig.playerFeedback.aim.fadeMs;
    const alpha =
      fadeStart > 0 && this.remainingMs < fadeStart
        ? uiConfig.playerFeedback.aim.alpha * (this.remainingMs / fadeStart)
        : uiConfig.playerFeedback.aim.alpha;
    this.draw(alpha);
  }

  private draw(alpha: number): void {
    const { startRadiusPx, lengthPx, lineWidthPx, color } = uiConfig.playerFeedback.aim;
    this.graphics.clear();
    this.graphics.lineStyle(lineWidthPx, color, Math.max(0, Math.min(1, alpha)));
    this.graphics.beginPath();
    this.graphics.moveTo(
      Math.cos(this.angle) * startRadiusPx,
      Math.sin(this.angle) * startRadiusPx,
    );
    this.graphics.lineTo(Math.cos(this.angle) * lengthPx, Math.sin(this.angle) * lengthPx);
    this.graphics.strokePath();
  }

  reset(): void {
    if (this.destroyed) return;
    this.remainingMs = 0;
    this.graphics.clear();
    this.graphics.setVisible(false);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.graphics.destroy();
  }
}
