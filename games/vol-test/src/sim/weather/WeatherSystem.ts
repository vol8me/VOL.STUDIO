import type { SeasonKind } from '@/config/seasons';
import { WEATHER, type WeatherKind } from '@/config/weather';
import { SurfaceGrid } from './SurfaceGrid';
import { WeatherSchedule } from './WeatherSchedule';
import type { SurfaceCell, SurfaceSample, WeatherFrame, WeatherState } from './types';

export type { SurfaceCell, SurfaceSample, WeatherFrame } from './types';

export interface WeatherOptions {
  readonly seed?: number;
  readonly override?: WeatherKind;
  readonly season?: SeasonKind;
}

export function parseWeatherOverride(value: string | null | undefined): WeatherKind | undefined {
  return value && Object.hasOwn(WEATHER.profiles, value) ? (value as WeatherKind) : undefined;
}

export class WeatherSystem {
  readonly cellSize: number;
  readonly columns: number;
  readonly rows: number;
  private readonly surface: SurfaceGrid;
  private readonly schedule: WeatherSchedule;
  private elapsedMs = 0;
  private surfaceMs = 0;
  private windMs = 0;
  private windTravelX = 0;
  private windTravelY = 0;
  private windX: number;
  private windY: number;
  private currentFrame: WeatherFrame;

  constructor(width: number, height: number, options: WeatherOptions = {}) {
    const seed = options.seed ?? WEATHER.seed;
    this.surface = new SurfaceGrid(width, height, seed);
    this.schedule = new WeatherSchedule(seed, options.override, options.season);
    this.cellSize = this.surface.cellSize;
    this.columns = this.surface.columns;
    this.rows = this.surface.rows;
    const initial = this.schedule.frameAt(0);
    this.windX = initial.windX;
    this.windY = initial.windY;
    this.currentFrame = this.withTravel(initial);
  }

  get frame(): WeatherFrame {
    return this.currentFrame;
  }

  step(dtMs: number): void {
    if (!Number.isFinite(dtMs) || dtMs < 0 || !Number.isFinite(this.elapsedMs + dtMs))
      throw new RangeError('Hava adımı sonlu ve negatif olmayan bir sayı olmalı.');
    const end = this.elapsedMs + dtMs;
    while (this.surfaceMs + WEATHER.surface.stepMs <= end) {
      this.surfaceMs += WEATHER.surface.stepMs;
      const state = this.schedule.frameAt(this.surfaceMs);
      this.integrateWind(state);
      this.surface.step(state, WEATHER.surface.stepMs / 1000);
    }
    this.elapsedMs = end;
    this.currentFrame = this.withTravel(this.schedule.frameAt(end));
  }

  setOverride(kind: WeatherKind | undefined): void {
    this.integrateWind(this.currentFrame);
    this.schedule.setOverride(kind, this.elapsedMs);
    this.currentFrame = this.withTravel(this.schedule.frameAt(this.elapsedMs));
  }

  sample(x: number, y: number): SurfaceSample {
    return this.surface.sample(x, y, this.frame);
  }

  cell(column: number, row: number): SurfaceCell | undefined {
    return this.surface.cell(column, row, this.frame);
  }

  compress(x: number, y: number, amount: number): void {
    this.surface.compress(x, y, amount);
  }

  private integrateWind(state: WeatherState): void {
    const seconds = (state.elapsedMs - this.windMs) / 1000;
    this.windTravelX += ((this.windX + state.windX) / 2) * seconds;
    this.windTravelY += ((this.windY + state.windY) / 2) * seconds;
    this.windMs = state.elapsedMs;
    this.windX = state.windX;
    this.windY = state.windY;
  }

  private withTravel(state: WeatherState): WeatherFrame {
    const seconds = (state.elapsedMs - this.windMs) / 1000;
    return Object.freeze({
      ...state,
      windTravelX: this.windTravelX + ((this.windX + state.windX) / 2) * seconds,
      windTravelY: this.windTravelY + ((this.windY + state.windY) / 2) * seconds,
    });
  }
}
