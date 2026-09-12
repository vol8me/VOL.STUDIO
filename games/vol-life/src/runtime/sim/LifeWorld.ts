import type { WorldConfig } from '@/config/world';
import { FieldSet, type FieldSnapshot } from '@/runtime/sim/FieldSet';
import { createSimRandom } from '@/runtime/sim/rng';
import { SimulationTempo } from '@/runtime/sim/SimulationTempo';

interface LightSource {
  readonly originX: number;
  readonly originY: number;
  readonly phase: number;
  readonly angularSpeed: number;
  readonly strength: number;
}

export interface LifeWorldSnapshot {
  readonly tick: number;
  readonly rngState: number;
  readonly nextFieldBand: number;
  readonly fields: FieldSnapshot;
}

export class LifeWorld {
  readonly fields: FieldSet;
  private readonly random;
  private readonly tempo = new SimulationTempo(60);
  private readonly sources: LightSource[];
  private nextFieldBand = 0;
  private fieldUpdated = false;

  constructor(private readonly config: WorldConfig) {
    if (
      !Number.isInteger(config.fieldUpdateBands) ||
      config.fieldUpdateBands < 1 ||
      config.fieldResolution % config.fieldUpdateBands !== 0
    ) {
      throw new RangeError(`Alan bant sayısı çözünürlüğü tam bölmeli: ${config.fieldUpdateBands}`);
    }
    this.fields = new FieldSet(config.fieldResolution);
    this.random = createSimRandom(config.seed);
    this.sources = Array.from({ length: config.lightSourceCount }, () => ({
      originX: this.random.next() * config.sizeUnits,
      originY: this.random.next() * config.sizeUnits,
      phase: this.random.next() * Math.PI * 2,
      angularSpeed: 0.00035 + this.random.next() * 0.00045,
      strength: 0.62 + this.random.next() * 0.38,
    }));
    this.fields.temperature.fill(0.5);
    this.renderLight(0);
    for (let i = 0; i < this.fields.length; i++) {
      this.fields.nutrient[i] = this.fields.light[i] * 0.58;
    }
    this.tempo.every(config.fieldHz, (tick) => {
      this.stepFields(tick);
      this.fieldUpdated = true;
    });
  }

  get tick(): number {
    return this.tempo.getTick();
  }

  step(): boolean {
    this.fieldUpdated = false;
    this.tempo.advance();
    return this.fieldUpdated;
  }

  snapshot(): LifeWorldSnapshot {
    return {
      tick: this.tick,
      rngState: this.random.getState(),
      nextFieldBand: this.nextFieldBand,
      fields: this.fields.snapshot(),
    };
  }

  restore(snapshot: LifeWorldSnapshot): void {
    this.tempo.setTick(snapshot.tick);
    this.random.setState(snapshot.rngState);
    this.nextFieldBand = snapshot.nextFieldBand;
    this.fields.restore(snapshot.fields);
  }

  private stepFields(tick: number): void {
    const rowCount = this.fields.resolution / this.config.fieldUpdateBands;
    const startRow = this.nextFieldBand * rowCount;
    this.renderLightRows(tick, startRow, rowCount);
    this.fields.diffuseRows('nutrient', this.config.nutrientDiffusion, startRow, rowCount);
    const { nutrient, light } = this.fields;
    const start = startRow * this.fields.resolution;
    const end = start + rowCount * this.fields.resolution;
    for (let i = start; i < end; i++) {
      nutrient[i] += (light[i] - nutrient[i]) * this.config.nutrientRenewal;
    }
    this.nextFieldBand = (this.nextFieldBand + 1) % this.config.fieldUpdateBands;
  }

  private renderLight(tick: number): void {
    this.renderLightRows(tick, 0, this.fields.resolution);
  }

  private renderLightRows(tick: number, startRow: number, rowCount: number): void {
    const { light, resolution } = this.fields;
    const cellSize = this.config.sizeUnits / resolution;
    const radiusSquared = this.config.lightSourceRadiusUnits ** 2;
    const endRow = startRow + rowCount;
    light.fill(0, startRow * resolution, endRow * resolution);
    for (const source of this.sources) {
      const angle = source.phase + tick * source.angularSpeed;
      const sourceX = wrap(
        source.originX + Math.cos(angle) * this.config.lightSourceDriftUnits,
        this.config.sizeUnits,
      );
      const sourceY = wrap(
        source.originY + Math.sin(angle * 0.83) * this.config.lightSourceDriftUnits,
        this.config.sizeUnits,
      );
      for (let y = startRow; y < endRow; y++) {
        const worldY = (y + 0.5) * cellSize;
        const dy = toroidalDelta(worldY, sourceY, this.config.sizeUnits);
        for (let x = 0; x < resolution; x++) {
          const worldX = (x + 0.5) * cellSize;
          const dx = toroidalDelta(worldX, sourceX, this.config.sizeUnits);
          const contribution =
            source.strength * Math.exp(-(dx * dx + dy * dy) / (2 * radiusSquared));
          const index = y * resolution + x;
          light[index] = Math.min(1, light[index] + contribution);
        }
      }
    }
  }
}

function wrap(value: number, size: number): number {
  return ((value % size) + size) % size;
}

function toroidalDelta(left: number, right: number, size: number): number {
  const direct = left - right;
  return direct - Math.round(direct / size) * size;
}
