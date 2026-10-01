import { clamp, clamp01, lerp } from '@volstudio/core/math/interpolation';
import { createRandom } from '@volstudio/core/random';
import { WEATHER } from '@/config/weather';
import type { SurfaceCell, SurfaceSample, WeatherState } from './types';

interface StoredCell {
  wetness: number;
  puddle: number;
  snowWater: number;
  compaction: number;
  readonly drain: number;
}

export class SurfaceGrid {
  readonly cellSize: number;
  readonly columns: number;
  readonly rows: number;
  private readonly cells: StoredCell[];

  constructor(
    private readonly width: number,
    private readonly height: number,
    seed: number,
  ) {
    if (![width, height].every((value) => Number.isFinite(value) && value > 0))
      throw new RangeError('Zemin ölçüleri sonlu ve pozitif olmalı.');
    let cellSize = Math.max(
      WEATHER.surface.cellSize,
      Math.sqrt(width / WEATHER.surface.maxCells) * Math.sqrt(height),
    );
    while (Math.ceil(width / cellSize) * Math.ceil(height / cellSize) > WEATHER.surface.maxCells)
      cellSize *= 1.1;
    this.cellSize = cellSize;
    this.columns = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    const random = createRandom(seed);
    this.cells = Array.from({ length: this.columns * this.rows }, () => ({
      wetness: 0,
      puddle: 0,
      snowWater: 0,
      compaction: 0,
      drain: WEATHER.surface.soilDrainMetresPerSecond * (0.5 + random.next()),
    }));
  }

  step(frame: WeatherState, seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0)
      throw new RangeError('Zemin adımı sonlu ve negatif olmayan bir sayı olmalı.');
    const config = WEATHER.surface;
    const rain = frame.rain * config.rainMetresPerSecond * seconds;
    const snow = frame.snow * config.snowWaterMetresPerSecond * seconds;
    const warmth = Math.max(0, frame.temperature);
    const dry = (1 - frame.rain) * Math.max(0, frame.temperature / 12);
    for (const cell of this.cells) {
      cell.snowWater = Math.min(
        config.maxSnowDepth * config.looseSnowDensity,
        cell.snowWater + snow,
      );
      cell.compaction *= Math.exp(-snow * config.freshSnowCompactionDecay);
      const melt = Math.min(cell.snowWater, warmth * config.meltMetresPerDegreeSecond * seconds);
      cell.snowWater -= melt;
      if (cell.snowWater === 0) cell.compaction = 0;
      const water = rain + melt;
      cell.wetness = clamp01(
        cell.wetness + water * config.wetnessPerMetre - dry * config.wetDryPerSecond * seconds,
      );
      cell.puddle = clamp(
        cell.puddle + water - (cell.drain + dry * config.puddleDryMetresPerSecond) * seconds,
        0,
        config.maxPuddleDepth,
      );
    }
  }

  sample(x: number, y: number, frame: WeatherState): SurfaceSample {
    return this.sampleCell(this.cells[this.index(x, y)], frame);
  }

  cell(column: number, row: number, frame: WeatherState): SurfaceCell | undefined {
    if (
      !Number.isInteger(column) ||
      !Number.isInteger(row) ||
      column < 0 ||
      row < 0 ||
      column >= this.columns ||
      row >= this.rows
    )
      return undefined;
    const x = column * this.cellSize;
    const y = row * this.cellSize;
    return {
      ...this.sampleCell(this.cells[row * this.columns + column], frame),
      x,
      y,
      width: Math.min(this.cellSize, this.width - x),
      height: Math.min(this.cellSize, this.height - y),
    };
  }

  compress(x: number, y: number, amount: number): void {
    if (!Number.isFinite(amount) || amount < 0)
      throw new RangeError('Kar sıkışma miktarı sonlu ve negatif olmayan bir sayı olmalı.');
    const cell = this.cells[this.index(x, y)];
    if (cell.snowWater > 0)
      cell.compaction = clamp01(1 - (1 - cell.compaction) * Math.exp(-amount));
  }

  private index(x: number, y: number): number {
    const column = Math.min(this.columns - 1, Math.floor(clamp(x, 0, this.width) / this.cellSize));
    const row = Math.min(this.rows - 1, Math.floor(clamp(y, 0, this.height) / this.cellSize));
    return row * this.columns + column;
  }

  private sampleCell(cell: StoredCell, frame: WeatherState): SurfaceSample {
    const config = WEATHER.surface;
    const density = lerp(config.looseSnowDensity, config.packedSnowDensity, cell.compaction);
    const snowDepth = cell.snowWater / density;
    const puddle = cell.puddle / config.maxPuddleDepth;
    const snow = clamp01(snowDepth / config.maxSnowDepth);
    return {
      wetness: cell.wetness,
      puddleDepth: cell.puddle,
      snowDepth,
      snowCompaction: cell.compaction,
      grip: Math.max(
        config.minGrip,
        1 -
          cell.wetness * config.wetGripLoss -
          puddle * config.puddleGripLoss -
          snow * (config.snowGripLoss + cell.compaction * config.packedSnowGripLoss),
      ),
      rollingResistance:
        1 +
        puddle * config.puddleRolling +
        snow * config.snowRolling * (1 - cell.compaction * config.packedSnowRollingReduction),
      windX: frame.windX,
      windY: frame.windY,
      airDrag: frame.airDrag,
    };
  }
}
