import type { Rect } from '@volstudio/core/math/geometry';
import type { SimRandom } from '@/runtime/sim/rng';

interface LightSource {
  readonly originX: number;
  readonly originY: number;
  readonly phase: number;
  readonly angularSpeed: number;
  readonly strength: number;
}

export interface LightSourceParams {
  readonly count: number;
  readonly radiusUnits: number;
  readonly driftUnits: number;
}

/** Tohumdan türeyen, yavaşça kayan yumuşak ışık kaynakları (DESIGN.md §2). */
export class LightSources {
  private readonly sources: readonly LightSource[];
  private readonly radiusSquared: number;

  constructor(
    private readonly bounds: Readonly<Rect>,
    private readonly params: LightSourceParams,
    random: SimRandom,
  ) {
    this.radiusSquared = params.radiusUnits ** 2;
    this.sources = Array.from({ length: params.count }, () => ({
      originX: bounds.x + random.next() * bounds.width,
      originY: bounds.y + random.next() * bounds.height,
      phase: random.next() * Math.PI * 2,
      angularSpeed: 0.00035 + random.next() * 0.00045,
      strength: 0.62 + random.next() * 0.38,
    }));
  }

  /** Verilen satır bandını sıfırlayıp yeniden çizer; Void hücresi ışık almaz. */
  renderRows(
    light: Float32Array,
    resolution: number,
    mask: Uint8Array | null,
    tick: number,
    startRow: number,
    rowCount: number,
  ): void {
    const { bounds } = this;
    const cellWidth = bounds.width / resolution;
    const cellHeight = bounds.height / resolution;
    const endRow = startRow + rowCount;
    light.fill(0, startRow * resolution, endRow * resolution);
    for (const source of this.sources) {
      const angle = source.phase + tick * source.angularSpeed;
      const sourceX = clamp(
        source.originX + Math.cos(angle) * this.params.driftUnits,
        bounds.x,
        bounds.x + bounds.width,
      );
      const sourceY = clamp(
        source.originY + Math.sin(angle * 0.83) * this.params.driftUnits,
        bounds.y,
        bounds.y + bounds.height,
      );
      for (let y = startRow; y < endRow; y++) {
        const dy = bounds.y + (y + 0.5) * cellHeight - sourceY;
        for (let x = 0; x < resolution; x++) {
          const index = y * resolution + x;
          if (mask && mask[index] === 0) continue;
          const dx = bounds.x + (x + 0.5) * cellWidth - sourceX;
          const contribution =
            source.strength * Math.exp(-(dx * dx + dy * dy) / (2 * this.radiusSquared));
          light[index] = Math.min(1, light[index] + contribution);
        }
      }
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
