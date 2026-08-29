import type Phaser from 'phaser';
import { RENDER_DEPTH } from '@/config/layers';
import { uiConfig } from '@/config/ui';
import { approachAngle, quantizeEightDirection } from '@/runtime/utils/direction';

/** Oyuncu hareketinin sekiz yönlü, düşük dikkat dağıtan saha göstergesi. */
export class PlayerDirectionIndicator {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private currentAngle = 0;
  private targetAngle = 0;
  private alpha = 0;
  private destroyed = false;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(RENDER_DEPTH.groundEffect);
    this.graphics.setVisible(false);
  }

  update(deltaMs: number, x: number, y: number, directionX: number, directionY: number): void {
    if (this.destroyed) return;
    const target = quantizeEightDirection(directionX, directionY);
    const smoothing =
      1 - Math.exp(-Math.max(0, deltaMs) / uiConfig.playerFeedback.direction.smoothingMs);
    if (target === null) {
      this.alpha = approach(this.alpha, 0, deltaMs, 90);
      this.graphics.setVisible(this.alpha > 0.01);
    } else {
      if (this.alpha === 0) this.currentAngle = target;
      this.targetAngle = target;
      this.currentAngle = approachAngle(this.currentAngle, this.targetAngle, smoothing);
      this.alpha = approach(this.alpha, uiConfig.playerFeedback.direction.alpha, deltaMs, 55);
      this.graphics.setVisible(true);
    }
    if (!this.graphics.visible) return;

    this.graphics.setPosition(x, y);
    this.graphics.clear();
    this.graphics.lineStyle(
      uiConfig.playerFeedback.direction.lineWidthPx,
      uiConfig.playerFeedback.direction.color,
      Math.max(0, Math.min(1, this.alpha)),
    );
    const { radiusPx, lengthPx, headPx } = uiConfig.playerFeedback.direction;
    const tipX = Math.cos(this.currentAngle) * lengthPx;
    const tipY = Math.sin(this.currentAngle) * lengthPx;
    this.graphics.beginPath();
    this.graphics.moveTo(
      Math.cos(this.currentAngle) * radiusPx,
      Math.sin(this.currentAngle) * radiusPx,
    );
    this.graphics.lineTo(tipX, tipY);
    this.graphics.moveTo(
      tipX - Math.cos(this.currentAngle - Math.PI / 6) * headPx,
      tipY - Math.sin(this.currentAngle - Math.PI / 6) * headPx,
    );
    this.graphics.lineTo(tipX, tipY);
    this.graphics.lineTo(
      tipX - Math.cos(this.currentAngle + Math.PI / 6) * headPx,
      tipY - Math.sin(this.currentAngle + Math.PI / 6) * headPx,
    );
    this.graphics.strokePath();
  }

  reset(): void {
    if (this.destroyed) return;
    this.alpha = 0;
    this.graphics.clear();
    this.graphics.setVisible(false);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.graphics.destroy();
  }
}

function approach(current: number, target: number, deltaMs: number, smoothingMs: number): number {
  if (smoothingMs <= 0) return target;
  return current + (target - current) * (1 - Math.exp(-Math.max(0, deltaMs) / smoothingMs));
}
