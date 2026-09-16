import type Phaser from 'phaser';
import { particlePalette } from '@/config/particles';
import type { ParticleStore } from '@/runtime/sim/ParticleStore';
import type { DomainSample, WorldDomain } from '@/runtime/sim/WorldDomain';

export interface ParticleGlyphStyle {
  readonly radiusUnits: number;
  readonly maxSpeedUnitsPerReferenceTick: number;
  readonly velocityStretchMax: number;
  readonly fringeWidthUnits: number;
  readonly fringeStretchMax: number;
}

const STRETCH_EPSILON = 1e-3;

/**
 * Parçacık glyph'i (DESIGN.md §6): hız yönünde sınırlı uzama, Void fringe'inde
 * dış normale doğru gerilme. Glyph collision yarıçapını veya kuvveti değiştiremez;
 * yalnız aktif slotlar çizilir.
 */
export class ParticleRenderer {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly sample: DomainSample = { distance: 0, normalX: 1, normalY: 0 };
  private destroyed = false;

  constructor(
    scene: Phaser.Scene,
    private readonly style: ParticleGlyphStyle,
    private readonly domain: WorldDomain | null = null,
  ) {
    if (!(style.radiusUnits > 0) || !Number.isFinite(style.radiusUnits)) {
      throw new RangeError(`Glyph yarıçapı pozitif ve sonlu olmalı: ${style.radiusUnits}`);
    }
    this.graphics = scene.add.graphics().setDepth(-900);
  }

  render(particles: ParticleStore, interpolationAlpha: number): void {
    this.graphics.clear();
    const alpha = Math.max(0, Math.min(1, interpolationAlpha));
    const { active, previousX, previousY, x, y, vx, vy, type, edgeDistance, capacity } = particles;
    const { radiusUnits: radius, maxSpeedUnitsPerReferenceTick: maxSpeed } = this.style;
    for (let slot = 0; slot < capacity; slot++) {
      if (active[slot] === 0) continue;
      const drawX = previousX[slot] + (x[slot] - previousX[slot]) * alpha;
      const drawY = previousY[slot] + (y[slot] - previousY[slot]) * alpha;
      this.graphics.fillStyle(particlePalette[type[slot]], 1);
      const speed = Math.hypot(vx[slot], vy[slot]);
      const velocityStretch =
        1 + (this.style.velocityStretchMax - 1) * Math.min(1, speed / maxSpeed);
      const proximity = this.fringeProximity(edgeDistance[slot]);
      const fringeStretch = 1 + (this.style.fringeStretchMax - 1) * proximity;
      if (velocityStretch - 1 < STRETCH_EPSILON && fringeStretch - 1 < STRETCH_EPSILON) {
        this.graphics.fillCircle(drawX, drawY, radius);
        continue;
      }
      let angle: number;
      let stretch: number;
      if (fringeStretch >= velocityStretch && this.domain) {
        this.domain.sampleDistanceAndNormal(drawX, drawY, this.sample);
        angle = Math.atan2(this.sample.normalY, this.sample.normalX);
        stretch = fringeStretch;
      } else {
        angle = Math.atan2(vy[slot], vx[slot]);
        stretch = velocityStretch;
      }
      this.graphics.save();
      this.graphics.translateCanvas(drawX, drawY);
      this.graphics.rotateCanvas(angle);
      this.graphics.fillEllipse(0, 0, radius * 2 * stretch, (radius * 2) / Math.sqrt(stretch));
      this.graphics.restore();
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.graphics.destroy();
  }

  private fringeProximity(distance: number): number {
    if (!this.domain || !Number.isFinite(distance) || distance < 0) return 0;
    return Math.max(0, 1 - distance / this.style.fringeWidthUnits);
  }
}
