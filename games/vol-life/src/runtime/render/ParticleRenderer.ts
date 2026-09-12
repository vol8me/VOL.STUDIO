import type { WorldCameraState } from '@volstudio/core';
import type Phaser from 'phaser';
import { particlePalette } from '@/config/particles';
import type { ParticleStore } from '@/runtime/sim/ParticleStore';

export class ParticleRenderer {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private cameraState: WorldCameraState | null = null;
  private destroyed = false;

  constructor(
    scene: Phaser.Scene,
    private readonly worldSize: number,
    private readonly radius: number,
  ) {
    this.graphics = scene.add.graphics().setDepth(-900);
  }

  updateCamera(state: WorldCameraState): void {
    this.cameraState = state;
  }

  render(particles: ParticleStore): void {
    this.graphics.clear();
    const state = this.cameraState;
    for (let index = 0; index < particles.count; index++) {
      let x = particles.x[index];
      let y = particles.y[index];
      if (state && !state.overview) {
        x += Math.round((state.centerX - x) / this.worldSize) * this.worldSize;
        y += Math.round((state.centerY - y) / this.worldSize) * this.worldSize;
      }
      this.graphics.fillStyle(particlePalette[particles.type[index]], 1);
      this.graphics.fillCircle(x, y, this.radius);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.graphics.destroy();
  }
}
