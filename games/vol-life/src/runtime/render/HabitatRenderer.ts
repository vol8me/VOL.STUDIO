import type Phaser from 'phaser';
import type { WorldDomain } from '@/runtime/sim/WorldDomain';

export interface HabitatStyle {
  readonly contourSegments: number;
  readonly voidColor: number;
  readonly glowRingCount: number;
  readonly glowRingSpacingUnits: number;
  readonly pulsePeriodMs: number;
  readonly pulseAlphaMin: number;
  readonly pulseAlphaMax: number;
}

/** Phaser `strokePoints` yalnız `x`/`y` okur; tip `Vector2` istese de düz nokta yeter. */
type ContourPoint = Phaser.Math.Vector2;

/**
 * Habitat/Void sunumu (DESIGN.md §6). Kare kontur yoktur: habitat içi alan
 * dokusu SDF gölgesiyle kıyıda kararır (bkz. `rasterizeHabitatShade`), bu
 * sınıf ise Void kıyısında içeri akan düşük frekanslı karanlık nabzı çizer.
 * Nabız yalnız alfa oynatır; fizik SDF'si bu sınıftan etkilenmez.
 */
export class HabitatRenderer {
  private readonly glow: Phaser.GameObjects.Graphics;
  private destroyed = false;

  constructor(
    scene: Phaser.Scene,
    private readonly domain: WorldDomain,
    private readonly style: HabitatStyle,
  ) {
    this.glow = scene.add.graphics().setDepth(-990);
    for (let ring = 0; ring < style.glowRingCount; ring++) {
      const fade = 1 - ring / style.glowRingCount;
      this.glow.lineStyle(style.glowRingSpacingUnits, style.voidColor, fade);
      this.glow.strokePoints(
        this.contourPoints(ring * style.glowRingSpacingUnits + style.glowRingSpacingUnits / 2),
        true,
        true,
      );
    }
    this.glow.setAlpha(style.pulseAlphaMin);
  }

  update(nowMs: number): void {
    if (this.destroyed || !Number.isFinite(nowMs)) return;
    const phase = 0.5 + 0.5 * Math.sin((nowMs / this.style.pulsePeriodMs) * Math.PI * 2);
    const alpha =
      this.style.pulseAlphaMin + (this.style.pulseAlphaMax - this.style.pulseAlphaMin) * phase;
    this.glow.setAlpha(alpha);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.glow.destroy();
  }

  /** Konturu Void normali boyunca `offsetUnits` dışa taşır; 0 kıyının kendisidir. */
  private contourPoints(offsetUnits: number): ContourPoint[] {
    const raw = this.domain.contour(this.style.contourSegments);
    const points: { x: number; y: number }[] = [];
    const normal = { x: 0, y: 0 };
    for (let index = 0; index < raw.length; index += 2) {
      const x = raw[index];
      const y = raw[index + 1];
      this.domain.normal(x, y, normal);
      points.push({ x: x + normal.x * offsetUnits, y: y + normal.y * offsetUnits });
    }
    return points as ContourPoint[];
  }
}
