import { describe, expect, it } from 'vitest';
import { TerrainField } from '@/view/weather/TerrainField';
import { sample, weather } from '../../support/weatherFixtures';

const rect = { x: 0, y: 0, width: 256, height: 256 };

describe('TerrainField', () => {
  it('komşu hücre alanını kesintisiz örnekler ve kamera değişimi dünya değerini değiştirmez', () => {
    const source = weather();
    const grid = {
      ...source,
      cell: (col: number, row: number) => {
        const cell = source.cell(col, row);
        return cell ? { ...cell, puddleDepth: col === 0 ? 0.02 : 0 } : undefined;
      },
    };
    const field = new TerrainField(3);
    field.prepare(grid, rect);
    expect(field.sample('puddleDepth', 32, 32)).toBe(0.02);
    expect(field.sample('puddleDepth', 96, 32)).toBe(0);
    expect(field.sample('puddleDepth', 64, 32)).toBeCloseTo(0.01);
    const water = field.value('water', 80, 90);
    const noise = field.noise(80, 90);
    field.prepare(grid, { x: 70, y: 80, width: 30, height: 20 });
    expect(field.value('water', 80, 90)).toBe(water);
    expect(field.noise(80, 90)).toBe(noise);
    expect(field.sample('puddleDepth', 63.999, 32)).toBeCloseTo(
      field.sample('puddleDepth', 64.001, 32),
      5,
    );
  });

  it('tohum görünüm desenini değiştirir; gerçek kar/sıkışma değeri güncel modelden gelir', () => {
    const a = new TerrainField(1);
    const b = new TerrainField(2);
    const source = weather(Object.freeze(sample({ snowDepth: 0.04, snowCompaction: 0.9 })));
    a.prepare(source, rect);
    b.prepare(source, rect);
    expect(a.noise(100, 120)).not.toBe(b.noise(100, 120));
    expect(a.sample('snowDepth', 100, 120)).toBe(0.04);
    expect(a.value('snow', 100, 120)).toBeGreaterThan(0);
    expect(a.value('packed', 100, 120)).toBeGreaterThan(0);
    expect(a.value('ground', 100, 120)).toBe(
      b.value('ground', 100, 120) - b.noise(100, 120) + a.noise(100, 120),
    );
    a.prepare(weather(sample({ snowDepth: 0, snowCompaction: 0 })), rect);
    expect(a.sample('snowDepth', 100, 120)).toBe(0);
    expect(a.value('packed', 100, 120)).toBeLessThan(0);
    a.prepare({ ...source, cell: () => undefined }, rect);
    expect(a.sample('puddleDepth', 0, 0)).toBe(0);
  });
});
