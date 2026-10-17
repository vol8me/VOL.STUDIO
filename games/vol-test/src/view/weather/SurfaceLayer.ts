import type Phaser from 'phaser';
import { WEATHER_VIEW } from '@/config/weatherView';
import type { WeatherSystem } from '@/sim/weather/WeatherSystem';
import type { WeatherRect } from './WeatherParticles';
import { TerrainField, type ContourKind } from './TerrainField';
import { TerrainContours } from './TerrainContours';

export type WeatherSource = Pick<
  WeatherSystem,
  'frame' | 'cellSize' | 'columns' | 'rows' | 'cell' | 'sample'
>;

export class SurfaceLayer {
  private readonly contours = new TerrainContours();

  constructor(
    private readonly graphics: Phaser.GameObjects.Graphics,
    private readonly field = new TerrainField(0),
  ) {}

  draw(weather: WeatherSource, rect: WeatherRect, rippleBudget: number, prepared = false): number {
    this.graphics.clear();
    if (rect.width <= 0 || rect.height <= 0) return 0;
    if (!prepared) this.field.prepare(weather, rect);
    const field = this.field;
    const style = WEATHER_VIEW.surface;
    const step = weather.cellSize / WEATHER_VIEW.terrain.subdivisions;
    const firstCol = Math.max(0, Math.floor(rect.x / step));
    const lastCol = Math.min(
      Math.ceil(field.width / step) - 1,
      Math.ceil((rect.x + rect.width) / step) - 1,
    );
    const firstRow = Math.max(0, Math.floor(rect.y / step));
    const lastRow = Math.min(
      Math.ceil(field.height / step) - 1,
      Math.ceil((rect.y + rect.height) / step) - 1,
    );
    const clip = { x: Math.max(0, rect.x), y: Math.max(0, rect.y), width: 0, height: 0 };
    clip.width = Math.min(field.width, rect.x + rect.width) - clip.x;
    clip.height = Math.min(field.height, rect.y + rect.height) - clip.y;
    let ripples = 0;
    for (let row = firstRow; row <= lastRow; row++) {
      for (let col = firstCol; col <= lastCol; col++) {
        const x = col * step;
        const y = row * step;
        const cx = x + step / 2;
        const cy = y + step / 2;
        const wet = field.sample('wetness', cx, cy);
        const water = Math.min(1, field.sample('puddleDepth', cx, cy) / style.puddleFullDepth);
        const snow = Math.min(1, field.sample('snowDepth', cx, cy) / style.snowFullDepth);
        if (wet > 0) {
          this.graphics.fillStyle(style.wetColor, wet * style.wetAlpha);
          const left = Math.max(clip.x, x);
          const top = Math.max(clip.y, y);
          this.graphics.fillRect(
            left,
            top,
            Math.min(clip.x + clip.width, x + step) - left,
            Math.min(clip.y + clip.height, y + step) - top,
          );
        }
        if (water > 0) {
          this.graphics.fillStyle(style.puddleColor, water * style.puddleAlpha);
          this.drawContour('water', clip, x, y, step);
          if (
            weather.frame.rain > 0 &&
            ripples < rippleBudget &&
            field.value('water', cx, cy) > 0 &&
            field.noise(cx + 43, cy - 17) > 0.64
          ) {
            const phase =
              ((weather.frame.elapsedMs + col * 173 + row * 239) % style.ripplePeriodMs) /
              style.ripplePeriodMs;
            const radius = style.rippleRadius * phase;
            if (
              cx - radius >= clip.x &&
              cy - radius >= clip.y &&
              cx + radius <= clip.x + clip.width &&
              cy + radius <= clip.y + clip.height
            ) {
              this.graphics.lineStyle(
                1,
                style.glintColor,
                water * weather.frame.rain * (1 - phase) * 0.22,
              );
              this.graphics.strokeEllipse(cx, cy, radius * 2, radius);
              ripples++;
            }
          }
        }
        if (snow > 0) {
          this.graphics.fillStyle(style.snowColor, snow * style.snowAlpha);
          this.drawContour('snow', clip, x, y, step);
          const pack = field.sample('snowCompaction', cx, cy);
          if (pack > 0) {
            this.graphics.fillStyle(style.packedSnowColor, snow * pack * 0.18);
            this.drawContour('packed', clip, x, y, step);
          }
        }
      }
    }
    const columns = Math.max(
      0,
      Math.min(weather.columns - 1, Math.ceil((rect.x + rect.width) / weather.cellSize) - 1) -
        Math.max(0, Math.floor(rect.x / weather.cellSize)) +
        1,
    );
    const rows = Math.max(
      0,
      Math.min(weather.rows - 1, Math.ceil((rect.y + rect.height) / weather.cellSize) - 1) -
        Math.max(0, Math.floor(rect.y / weather.cellSize)) +
        1,
    );
    return columns * rows;
  }

  private drawContour(
    kind: ContourKind,
    rect: WeatherRect,
    x: number,
    y: number,
    size: number,
  ): void {
    const field = this.field;
    this.contours.draw(
      this.graphics,
      rect,
      x,
      y,
      size,
      field.value(kind, x, y),
      field.value(kind, x + size, y),
      field.value(kind, x + size, y + size),
      field.value(kind, x, y + size),
    );
  }
}
