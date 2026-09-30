import type Phaser from 'phaser';
import { VIEWPORT_REGISTRY_KEY, ViewportManager } from '@volstudio/core';
import { FollowCamera } from '@/sim/camera/FollowCamera';
import type { CameraConfig } from '@/config/camera';

/**
 * Takip kamerası modelini Phaser'ın ana kamerasına bağlar. Phaser kamerasının
 * zoom'u rasterleme çarpanı (DPR × çözünürlük ölçeği) ile modelin zoom'unun
 * çarpımıdır; model CSS pikseli uzayında çalışır.
 */
export class CameraRig {
  readonly model: FollowCamera;

  constructor(
    private readonly scene: Phaser.Scene,
    config: CameraConfig,
    worldWidth: number,
    worldHeight: number,
  ) {
    this.model = new FollowCamera(config, worldWidth, worldHeight);
    this.syncViewport();
  }

  /** Pencere boyu değişince modelin görüntü alanını tazeler. */
  syncViewport(): void {
    const quality = this.renderQuality();
    const main = this.scene.cameras.main;
    this.model.setViewport(main.width / quality, main.height / quality);
  }

  /** Modeli ilerletir (duraklatmada donar) ve Phaser kamerasına uygular. */
  update(targetX: number, targetY: number, deltaMs: number, paused: boolean): void {
    if (!paused) this.model.update(targetX, targetY, deltaMs);
    const main = this.scene.cameras.main;
    main.setZoom(this.renderQuality() * this.model.zoom);
    main.centerOn(this.model.x + this.model.offsetX, this.model.y + this.model.offsetY);
  }

  private renderQuality(): number {
    const manager: unknown = this.scene.game.registry.get(VIEWPORT_REGISTRY_KEY);
    return manager instanceof ViewportManager ? manager.resolveRenderQuality() : 1;
  }
}
