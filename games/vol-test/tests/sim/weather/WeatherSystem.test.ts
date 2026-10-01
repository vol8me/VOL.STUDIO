import { describe, expect, it } from 'vitest';
import { WORLD } from '@/config/world';
import { WEATHER } from '@/config/weather';
import { parseWeatherOverride, WeatherSystem } from '@/sim/weather/WeatherSystem';
import { WeatherSchedule } from '@/sim/weather/WeatherSchedule';

function weather(override?: 'clear' | 'dust' | 'rain' | 'snow', seed = 7) {
  return new WeatherSystem(512, 512, { seed, override });
}

describe('WeatherSystem', () => {
  it('rüzgâr mesafesi tek saatten birikir, delta bölünmesi ve duraklama sonucu değiştirmez', () => {
    const a = new WeatherSystem(128, 128, { seed: 7, override: 'dust', season: 'winter' });
    const b = new WeatherSystem(128, 128, { seed: 7, override: 'dust', season: 'winter' });
    a.step(3600_016);
    for (let elapsed = 0; elapsed < 3600_000; elapsed += 1600) b.step(1600);
    b.step(16);
    expect(a.frame).toEqual(b.frame);
    expect(a.frame.windTravelX).toBeGreaterThan(0);
    expect(a.frame.windTravelY).toBeGreaterThan(0);
    const before = a.frame;
    a.step(0);
    expect(a.frame).toEqual(before);
    expect(a.frame.season).toBe('winter');
  });

  it('sabit yüzey adımı arasındaki override geçmiş rüzgâr mesafesini değiştirmez', () => {
    const a = weather('dust');
    const b = weather('dust');
    a.step(53);
    b.step(20);
    b.step(33);
    const before = a.frame;
    a.setOverride('snow');
    b.setOverride('snow');
    expect(a.frame.windTravelX).toBe(before.windTravelX);
    expect(a.frame.windTravelY).toBe(before.windTravelY);
    a.step(6071);
    for (const dt of [47, 3000, 3000, 24]) b.step(dt);
    expect(a.frame).toEqual(b.frame);
  });
  it('yalnız sonlu pozitif dünyada ve sonlu simülasyon adımlarında ilerler', () => {
    for (const size of [0, -1, NaN, Infinity])
      expect(() => new WeatherSystem(size, 32, { seed: 1 })).toThrow(RangeError);
    const model = weather();
    for (const step of [-1, NaN, Infinity]) expect(() => model.step(step)).toThrow(RangeError);
    model.step(0);
    expect(model.frame.elapsedMs).toBe(0);
    expect(model.sample(50, 50).grip).toBe(1);
    expect(model.sample(50, 50).rollingResistance).toBe(1);
  });

  it('büyük ve dar dünyalarda hücre sayısını sınırlar ve kenar hücresini kırpar', () => {
    for (const [width, height] of [
      [100_000, 100_000],
      [10_000_000, 32],
    ]) {
      const model = new WeatherSystem(width, height, { seed: 1 });
      expect(model.columns * model.rows).toBeLessThanOrEqual(WEATHER.surface.maxCells);
      const last = model.cell(model.columns - 1, model.rows - 1)!;
      expect(last.x + last.width).toBeCloseTo(width, 8);
      expect(last.y + last.height).toBeCloseTo(height, 8);
    }
    const model = new WeatherSystem(333, 291, { seed: 1 });
    expect(model.cell(-1, 0)).toBeUndefined();
    expect(model.cell(0.5, 0)).toBeUndefined();
    expect(model.cell(model.columns, 0)).toBeUndefined();
    expect(model.sample(-1, 0)).toEqual(model.sample(0, 0));
    expect(model.sample(Infinity, NaN)).toEqual(model.sample(0, 0));
  });

  it('ilk on dakika ilkbaharda kalır, mevsimler on beşer dakika sürer', () => {
    const model = weather();
    expect(model.frame.kind).toBe('clear');
    expect(model.frame.snow).toBe(0);
    expect(model.frame.season).toBe('spring');
    model.step(10 * 60_000);
    expect(model.frame.season).toBe('spring');
    model.step(5 * 60_000);
    expect(model.frame.season).toBe('summer');
    model.step(15 * 60_000);
    expect(model.frame.season).toBe('autumn');
    model.step(15 * 60_000);
    expect(model.frame.season).toBe('winter');
    model.step(15 * 60_000);
    expect(model.frame.season).toBe('spring');
  });

  it('aynı seed ve saat farklı delta bölünmelerinde aynı hava ve zemini üretir', () => {
    const a = weather();
    const b = weather();
    a.step(160_000);
    for (let i = 0; i < 1000; i++) b.step(160);
    expect(a.frame).toEqual(b.frame);
    for (let row = 0; row < a.rows; row++)
      for (let column = 0; column < a.columns; column++)
        expect(a.cell(column, row)).toEqual(b.cell(column, row));
    const rainA = weather('rain');
    const rainB = weather('rain', 8);
    rainA.step(60_000);
    rainB.step(60_000);
    expect(rainB.frame.windX).not.toBe(rainA.frame.windX);
    expect(rainB.sample(50, 50).puddleDepth).not.toBe(rainA.sample(50, 50).puddleDepth);
  });

  it('yağmur zemini ıslatır, çukurda birikir ve açık hava zemini kurutur', () => {
    const model = weather('rain');
    model.step(60_000);
    const wet = model.sample(50, 50);
    expect(wet.wetness).toBeGreaterThan(0);
    expect(wet.puddleDepth).toBeGreaterThan(0);
    expect(wet.grip).toBeLessThan(1);
    expect(wet.rollingResistance).toBeGreaterThan(1);
    expect(wet.snowDepth).toBe(0);
    const cell = model.cell(0, 0)!;
    expect(cell.puddleDepth).toBe(wet.puddleDepth);
    model.setOverride('clear');
    model.step(120_000);
    const dry = model.sample(50, 50);
    expect(dry.wetness).toBeLessThan(wet.wetness);
    expect(dry.puddleDepth).toBeLessThan(wet.puddleDepth);
    expect(dry.grip).toBeGreaterThan(wet.grip);
  });

  it('kar sıkışır; sıcak hava karı eritir ve eriyen suyu zemine geçirir', () => {
    const model = weather('snow');
    model.step(60_000);
    const loose = model.sample(50, 50);
    expect(loose.snowDepth).toBeGreaterThan(0);
    expect(loose.snowCompaction).toBe(0);
    expect(loose.rollingResistance).toBeGreaterThan(1);
    model.compress(50, 50, 0.75);
    const compact = model.sample(50, 50);
    expect(compact.snowCompaction).toBeGreaterThan(0);
    expect(compact.snowDepth).toBeLessThan(loose.snowDepth);
    expect(model.sample(400, 400).snowCompaction).toBe(0);
    model.setOverride('clear');
    model.step(40_000);
    const melted = model.sample(50, 50);
    expect(melted.snowDepth).toBeLessThan(compact.snowDepth);
    expect(melted.wetness).toBeGreaterThan(0);
    expect(melted.puddleDepth).toBeGreaterThan(0);
  });

  it('yağışın başladığı karede geçmiş birikimi sıfırlamaz ve override kaldırılabilir', () => {
    const model = weather('rain');
    model.step(30_000);
    const before = model.sample(50, 50);
    model.setOverride('snow');
    expect(model.sample(50, 50).puddleDepth).toBe(before.puddleDepth);
    expect(model.frame.rain).toBe(1);
    model.step(WEATHER.transitionMs / 2);
    expect(model.frame.rain).toBeGreaterThan(0);
    expect(model.frame.snow).toBeGreaterThan(0);
    model.setOverride(undefined);
    model.step(WEATHER.transitionMs);
    const scheduled = new WeatherSchedule(7).frameAt(model.frame.elapsedMs);
    expect(model.frame.kind).toBe(scheduled.kind);
    expect(model.frame.rain).toBe(scheduled.rain);
  });

  it('toz rüzgârı ve sürükleme çarpanı gösterir; fizik katsayıları sonlu ve sınırlıdır', () => {
    const model = weather('dust');
    expect(Math.hypot(model.frame.windX, model.frame.windY)).toBeGreaterThan(WORLD.metre);
    expect(model.sample(50, 50).airDrag).toBeGreaterThan(1);
    model.step(300_000);
    const sample = model.sample(50, 50);
    for (const value of Object.values(sample)) expect(Number.isFinite(value)).toBe(true);
    expect(sample.grip).toBeGreaterThan(0);
    expect(sample.grip).toBeLessThanOrEqual(1);
    expect(sample.rollingResistance).toBeGreaterThanOrEqual(1);
    expect(sample.puddleDepth).toBeLessThanOrEqual(WEATHER.surface.maxPuddleDepth);
    expect(sample.snowDepth).toBeLessThanOrEqual(WEATHER.surface.maxSnowDepth);
  });

  it('debug override yalnız tanımlı hava adlarını kabul eder', () => {
    for (const kind of ['clear', 'dust', 'rain', 'snow'])
      expect(parseWeatherOverride(kind)).toBe(kind);
    for (const value of [undefined, null, '', 'storm', 'RAIN'])
      expect(parseWeatherOverride(value)).toBeUndefined();
  });
});
