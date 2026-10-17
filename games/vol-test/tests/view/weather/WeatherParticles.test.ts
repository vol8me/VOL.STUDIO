import { describe, expect, it } from 'vitest';
import { WeatherParticles } from '@/view/weather/WeatherParticles';
import { frame } from '../../support/weatherFixtures';
import { WeatherSystem } from '@/sim/weather/WeatherSystem';
import { WEATHER_VIEW } from '@/config/weatherView';

const rect = { x: -50, y: 100, width: 800, height: 600 };

describe('WeatherParticles', () => {
  it('bir saatin ardından küçük gust değişimi parçacıkları sıçratmaz', () => {
    const model = new WeatherSystem(128, 128, { seed: 7, override: 'dust' });
    const particles = new WeatherParticles(123);
    model.step(3600_000);
    const count = particles.write(model.frame, rect, 1);
    const before = particles.points.slice(0, count).map(({ x, y }) => ({ x, y }));
    model.step(16);
    particles.write(model.frame, rect, 1);
    const margin = Math.min(WEATHER_VIEW.dust.radius, rect.width / 4, rect.height / 4);
    const cyclicDistance = (a: number, b: number, extent: number) =>
      Math.min(Math.abs(a - b), Math.abs(extent - Math.abs(a - b)));
    for (let index = 0; index < count; index++) {
      const point = particles.points[index];
      expect(cyclicDistance(point.x, before[index].x, rect.width - margin * 2)).toBeLessThan(4);
      expect(cyclicDistance(point.y, before[index].y, rect.height - margin * 2)).toBeLessThan(4);
    }
  });

  it('model bölünmesi ve render sıklığı aynı saat ve tohumda aynı parçacıkları verir; pause sabittir', () => {
    const a = new WeatherSystem(128, 128, { seed: 7, override: 'rain', season: 'autumn' });
    const b = new WeatherSystem(128, 128, { seed: 7, override: 'rain', season: 'autumn' });
    const frequent = new WeatherParticles(123);
    const once = new WeatherParticles(123);
    a.step(10_071);
    for (let index = 0; index < 100; index++) {
      b.step(100);
      frequent.write(b.frame, rect, 1);
    }
    b.step(71);
    frequent.write(b.frame, rect, 1);
    once.write(a.frame, rect, 1);
    expect(frequent.points).toEqual(once.points);
    const paused = structuredClone(frequent.points);
    b.step(0);
    frequent.write(b.frame, rect, 1);
    expect(frequent.points).toEqual(paused);
  });
  it('aynı tohum, saat ve kamera aynı havuzu verir; kare sayısı sonucu değiştirmez', () => {
    const a = new WeatherParticles(123);
    const b = new WeatherParticles(123);
    const now = frame();
    a.write(frame({ elapsedMs: 500 }), rect, 1);
    expect(a.write(now, rect, 1)).toBe(512);
    expect(b.write(now, rect, 1)).toBe(512);
    expect(a.points).toEqual(b.points);
    const storage = a.points;
    a.write(now, rect, 1);
    expect(a.points).toBe(storage);
    expect(a.points).toEqual(b.points);
    const c = new WeatherParticles(124);
    c.write(now, rect, 1);
    expect(c.points[0]).not.toEqual(a.points[0]);
  });

  it('geçiş yoğunlukları havuzu aşmaz, düşük kalite256 öğe çizer ve sakin hava boş kalır', () => {
    const particles = new WeatherParticles(1);
    expect(particles.write(frame({ rain: 1, snow: 1, dust: 1 }), rect, 1)).toBe(512);
    expect(particles.write(frame(), rect, 0.5)).toBe(256);
    expect(particles.write(frame({ rain: 0 }), rect, 1)).toBe(0);
    expect(particles.write(frame(), { ...rect, width: 0 }, 1)).toBe(0);
  });

  it.each(['rain', 'snow', 'dust'] as const)(
    '%s negatif rüzgârda da kamera içinde kalır',
    (kind) => {
      const particles = new WeatherParticles(3);
      const count = particles.write(
        frame({
          rain: 0,
          [kind]: 1,
          windX: -1000,
          windY: -2000,
          windTravelX: -999999,
          windTravelY: -1999999,
          elapsedMs: 999999,
        }),
        rect,
        1,
      );
      for (let index = 0; index < count; index++) {
        const point = particles.points[index];
        expect(point.x - point.size).toBeGreaterThanOrEqual(rect.x);
        expect(point.y - point.size).toBeGreaterThanOrEqual(rect.y);
        expect(point.x + point.size).toBeLessThanOrEqual(rect.x + rect.width);
        expect(point.y + point.size).toBeLessThanOrEqual(rect.y + rect.height);
      }
    },
  );
});
