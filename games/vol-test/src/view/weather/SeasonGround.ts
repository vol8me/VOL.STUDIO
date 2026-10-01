import type Phaser from 'phaser';
import { SEASONS } from '@/config/seasons';
import { WEATHER_VIEW } from '@/config/weatherView';
import type { WeatherFrame } from '@/sim/weather/WeatherSystem';
import type { WeatherRect } from './WeatherParticles';
import type { WeatherSource } from './SurfaceLayer';
import { TerrainField } from './TerrainField';
import { TerrainContours } from './TerrainContours';

function mixColor(a: number, b: number, t: number): number {
  let result = 0;
  for (const shift of [16, 8, 0]) {
    const from = (a >> shift) & 255;
    const to = (b >> shift) & 255;
    result |= Math.round(from + (to - from) * t) << shift;
  }
  return result;
}

export function seasonPalette(frame: Pick<WeatherFrame, 'season' | 'seasonProgress'>): {
  ground: number;
  patch: number;
  alpha: number;
} {
  const current = WEATHER_VIEW.seasons[frame.season];
  const next =
    WEATHER_VIEW.seasons[
      SEASONS.order[(SEASONS.order.indexOf(frame.season) + 1) % SEASONS.order.length]
    ];
  const fraction = SEASONS.transitionFraction;
  const phase = Math.max(0, Math.min(1, (frame.seasonProgress - (1 - fraction)) / fraction));
  const t = phase * phase * (3 - 2 * phase);
  return {
    ground: mixColor(current.ground, next.ground, t),
    patch: mixColor(current.patch, next.patch, t),
    alpha: current.alpha + (next.alpha - current.alpha) * t,
  };
}

function daylightColor(color: number, daylight: number): number {
  const brightness = 0.8 + daylight * (2 / 7);
  let result = 0;
  for (const shift of [16, 8, 0]) {
    result |= Math.min(255, Math.round(((color >> shift) & 255) * brightness)) << shift;
  }
  return result;
}

export class SeasonGround {
  private readonly contours = new TerrainContours();

  constructor(
    private readonly graphics: Phaser.GameObjects.Graphics,
    seed: number,
    private readonly field = new TerrainField(seed),
  ) {}

  draw(weather: WeatherSource, rect: WeatherRect, prepared = false): void {
    this.graphics.clear();
    if (rect.width <= 0 || rect.height <= 0) return;
    if (!prepared) this.field.prepare(weather, rect);
    const field = this.field;
    const palette = seasonPalette(weather.frame);
    const x = Math.max(0, rect.x);
    const y = Math.max(0, rect.y);
    const width = Math.min(field.width, rect.x + rect.width) - x;
    const height = Math.min(field.height, rect.y + rect.height) - y;
    if (width <= 0 || height <= 0) return;
    const clip = { x, y, width, height };
    this.graphics.fillStyle(daylightColor(palette.ground, weather.frame.daylight), 1);
    this.graphics.fillRect(x, y, width, height);
    this.graphics.fillStyle(daylightColor(palette.patch, weather.frame.daylight), palette.alpha);
    const step = weather.cellSize / WEATHER_VIEW.terrain.subdivisions;
    const firstCol = Math.max(0, Math.floor(x / step));
    const lastCol = Math.ceil((x + width) / step) - 1;
    const firstRow = Math.max(0, Math.floor(y / step));
    const lastRow = Math.ceil((y + height) / step) - 1;
    for (let row = firstRow; row <= lastRow; row++) {
      for (let col = firstCol; col <= lastCol; col++) {
        const px = col * step;
        const py = row * step;
        this.contours.draw(
          this.graphics,
          clip,
          px,
          py,
          step,
          field.value('ground', px, py),
          field.value('ground', px + step, py),
          field.value('ground', px + step, py + step),
          field.value('ground', px, py + step),
        );
      }
    }
  }
}
