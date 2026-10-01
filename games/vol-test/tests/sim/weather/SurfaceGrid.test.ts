import { describe, expect, it } from 'vitest';
import { WEATHER } from '@/config/weather';
import { SurfaceGrid } from '@/sim/weather/SurfaceGrid';
import { WeatherSchedule } from '@/sim/weather/WeatherSchedule';

const snow = new WeatherSchedule(7, 'snow').frameAt(0);
const rain = new WeatherSchedule(7, 'rain').frameAt(0);
const clear = new WeatherSchedule(7, 'clear').frameAt(0);

describe('SurfaceGrid', () => {
  it('aynı temas mesafesi delta bölünmesinden bağımsız aynı kar sıkışmasını verir', () => {
    const one = new SurfaceGrid(128, 128, 7);
    const many = new SurfaceGrid(128, 128, 7);
    one.step(snow, 30);
    many.step(snow, 30);
    one.compress(32, 32, 0.8);
    for (let index = 0; index < 8; index++) many.compress(32, 32, 0.1);
    expect(one.sample(32, 32, snow).snowCompaction).toBeCloseTo(
      many.sample(32, 32, snow).snowCompaction,
      12,
    );
  });
  it('kar sıkıştırma su kütlesini korur ve yalnız temas hücresini değiştirir', () => {
    const grid = new SurfaceGrid(256, 256, 7);
    grid.step(snow, 30);
    const before = grid.sample(32, 32, snow);
    const neighbour = grid.sample(200, 200, snow);
    grid.compress(32, 32, 0.8);
    const after = grid.sample(32, 32, snow);
    const density =
      WEATHER.surface.looseSnowDensity +
      after.snowCompaction * (WEATHER.surface.packedSnowDensity - WEATHER.surface.looseSnowDensity);
    expect(after.snowDepth * density).toBeCloseTo(
      before.snowDepth * WEATHER.surface.looseSnowDensity,
      12,
    );
    expect(after.snowDepth).toBeLessThan(before.snowDepth);
    expect(grid.sample(200, 200, snow)).toEqual(neighbour);
  });

  it('eriyen kar suya geçer; yağış olmadan toplam su kütlesi büyümez', () => {
    const grid = new SurfaceGrid(128, 128, 7);
    grid.step(snow, 60);
    const before = grid.sample(32, 32, snow);
    const snowWater = before.snowDepth * WEATHER.surface.looseSnowDensity;
    grid.step(clear, 20);
    const after = grid.sample(32, 32, clear);
    expect(after.snowDepth).toBeLessThan(before.snowDepth);
    expect(after.puddleDepth).toBeGreaterThan(0);
    expect(
      after.snowDepth * WEATHER.surface.looseSnowDensity + after.puddleDepth,
    ).toBeLessThanOrEqual(snowWater);
  });

  it('yağış ve kar her hücrede sonlu ve sınırlı kalır', () => {
    const grid = new SurfaceGrid(333, 333, 7);
    grid.step(rain, 3600);
    grid.step(snow, 3600);
    for (let row = 0; row < grid.rows; row++) {
      for (let column = 0; column < grid.columns; column++) {
        const cell = grid.cell(column, row, snow)!;
        expect(cell.puddleDepth).toBeLessThanOrEqual(WEATHER.surface.maxPuddleDepth);
        expect(cell.snowDepth).toBeLessThanOrEqual(WEATHER.surface.maxSnowDepth);
        expect(cell.wetness).toBeGreaterThanOrEqual(0);
        expect(cell.wetness).toBeLessThanOrEqual(1);
        expect(cell.snowCompaction).toBeGreaterThanOrEqual(0);
        expect(cell.snowCompaction).toBeLessThanOrEqual(1);
        for (const value of Object.values(cell)) expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it('sonlu çok büyük ölçülerde alan çarpımı taşsa da grid ve örnek sonludur', () => {
    const grid = new SurfaceGrid(1e200, 1e200, 7);
    expect(grid.columns * grid.rows).toBeGreaterThan(0);
    expect(grid.columns * grid.rows).toBeLessThanOrEqual(WEATHER.surface.maxCells);
    expect(Number.isFinite(grid.cellSize)).toBe(true);
    expect(grid.sample(0, 0, clear).grip).toBe(1);
  });

  it('negatif veya sonlu olmayan adım ve kar sıkışması reddedilir', () => {
    const grid = new SurfaceGrid(128, 128, 7);
    for (const value of [-1, Infinity, NaN]) {
      expect(() => grid.step(snow, value)).toThrow(RangeError);
      expect(() => grid.compress(0, 0, value)).toThrow(RangeError);
    }
    grid.compress(0, 0, 1);
    expect(grid.sample(0, 0, clear).snowCompaction).toBe(0);
  });
});
