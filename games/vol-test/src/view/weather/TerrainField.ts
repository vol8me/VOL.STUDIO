import { WEATHER } from '@/config/weather';
import { WEATHER_VIEW } from '@/config/weatherView';
import type { WeatherRect } from './WeatherParticles';
import type { WeatherSource } from './SurfaceLayer';

export type SurfaceChannel = 'wetness' | 'puddleDepth' | 'snowDepth' | 'snowCompaction';
export type ContourKind = 'ground' | 'water' | 'snow' | 'packed';

const smooth = (value: number): number => value * value * (3 - 2 * value);

/** Model alanlarını yalnız bu sunum karesi için örnekler; birikim hesabı yapmaz. */
export class TerrainField {
  private readonly samples: Record<SurfaceChannel, Float64Array> = {
    wetness: new Float64Array(WEATHER.surface.maxCells),
    puddleDepth: new Float64Array(WEATHER.surface.maxCells),
    snowDepth: new Float64Array(WEATHER.surface.maxCells),
    snowCompaction: new Float64Array(WEATHER.surface.maxCells),
  };
  private columns = 0;
  private rows = 0;
  cellSize = 128;
  width = 0;
  height = 0;

  constructor(private readonly seed: number) {}

  prepare(weather: WeatherSource, rect: WeatherRect): void {
    this.columns = weather.columns;
    this.rows = weather.rows;
    this.cellSize = weather.cellSize;
    const last = weather.cell(this.columns - 1, this.rows - 1);
    this.width = last ? last.x + last.width : this.columns * this.cellSize;
    this.height = last ? last.y + last.height : this.rows * this.cellSize;
    const firstCol = Math.max(0, Math.floor(rect.x / this.cellSize) - 1);
    const lastCol = Math.min(
      this.columns - 1,
      Math.ceil((rect.x + rect.width) / this.cellSize) + 1,
    );
    const firstRow = Math.max(0, Math.floor(rect.y / this.cellSize) - 1);
    const lastRow = Math.min(this.rows - 1, Math.ceil((rect.y + rect.height) / this.cellSize) + 1);
    for (let row = firstRow; row <= lastRow; row++) {
      for (let col = firstCol; col <= lastCol; col++) {
        const cell = weather.cell(col, row);
        const index = row * this.columns + col;
        this.samples.wetness[index] = cell?.wetness ?? 0;
        this.samples.puddleDepth[index] = cell?.puddleDepth ?? 0;
        this.samples.snowDepth[index] = cell?.snowDepth ?? 0;
        this.samples.snowCompaction[index] = cell?.snowCompaction ?? 0;
      }
    }
  }

  sample(channel: SurfaceChannel, x: number, y: number): number {
    const column = Math.max(0, Math.min(this.columns - 1, x / this.cellSize - 0.5));
    const row = Math.max(0, Math.min(this.rows - 1, y / this.cellSize - 0.5));
    const c = Math.floor(column);
    const r = Math.floor(row);
    const right = Math.min(this.columns - 1, c + 1);
    const bottom = Math.min(this.rows - 1, r + 1);
    const values = this.samples[channel];
    const top =
      values[r * this.columns + c] +
      (values[r * this.columns + right] - values[r * this.columns + c]) * (column - c);
    const low =
      values[bottom * this.columns + c] +
      (values[bottom * this.columns + right] - values[bottom * this.columns + c]) * (column - c);
    return top + (low - top) * (row - r);
  }

  noise(x: number, y: number): number {
    const scale = WEATHER_VIEW.terrain.noiseScale;
    const column = Math.floor(x / scale);
    const row = Math.floor(y / scale);
    const u = smooth(x / scale - column);
    const v = smooth(y / scale - row);
    const a = this.hash(column, row);
    const b = this.hash(column + 1, row);
    const c = this.hash(column, row + 1);
    const d = this.hash(column + 1, row + 1);
    return a + (b - a) * u + (c + (d - c) * u - a - (b - a) * u) * v;
  }

  value(kind: ContourKind, x: number, y: number): number {
    if (kind === 'ground') return this.noise(x, y) - WEATHER_VIEW.terrain.groundThreshold;
    if (kind === 'snow')
      return this.sample('snowDepth', x, y) / WEATHER_VIEW.surface.snowFullDepth - 0.03;
    if (kind === 'packed')
      return (
        (this.sample('snowCompaction', x, y) * this.sample('snowDepth', x, y)) /
          WEATHER_VIEW.surface.snowFullDepth -
        0.1
      );
    return (
      (this.sample('puddleDepth', x, y) / WEATHER_VIEW.surface.puddleFullDepth) *
        WEATHER_VIEW.terrain.waterDepthBias +
      this.noise(x, y) * WEATHER_VIEW.terrain.waterNoise -
      WEATHER_VIEW.terrain.waterThreshold
    );
  }

  private hash(column: number, row: number): number {
    let value = this.seed ^ Math.imul(column, 73856093) ^ Math.imul(row, 19349663);
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
  }
}
