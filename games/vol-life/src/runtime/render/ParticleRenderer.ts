import type Phaser from 'phaser';
import { particlePalette } from '@/config/particles';
import type { ParticleStore } from '@/runtime/sim/ParticleStore';

export class ParticleRenderer {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private destroyed = false;

  constructor(
    scene: Phaser.Scene,
    private readonly radius: number,
  ) {
    this.graphics = scene.add.graphics().setDepth(-900);
  }

  render(particles: ParticleStore, interpolationAlpha: number): void {
    this.graphics.clear();
    const alpha = Math.max(0, Math.min(1, interpolationAlpha));
    for (let index = 0; index < particles.count; index++) {
      const x =
        particles.previousX[index] + (particles.x[index] - particles.previousX[index]) * alpha;
      const y =
        particles.previousY[index] + (particles.y[index] - particles.previousY[index]) * alpha;
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
