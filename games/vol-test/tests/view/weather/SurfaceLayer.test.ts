import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { WEATHER_VIEW } from '@/config/weatherView';
import { SurfaceLayer } from '@/view/weather/SurfaceLayer';
import { fakeObject } from '../../support/fakeScene';
import { sample, weather } from '../../support/weatherFixtures';

describe('SurfaceLayer', () => {
  it('yalnız kameranın değdiği hücreleri okur ve kenarları kamera sınırında kırpar', () => {
    const graphics = fakeObject('graphics');
    const source = weather();
    const read = vi.fn(source.cell);
    const layer = new SurfaceLayer(graphics as unknown as Phaser.GameObjects.Graphics);
    expect(layer.draw({ ...source, cell: read }, { x: 70, y: 80, width: 30, height: 20 }, 0)).toBe(
      1,
    );
    expect(read.mock.calls).toContainEqual([1, 1]);
    expect(read.mock.calls.length).toBeLessThanOrEqual(17);
    const rectangles = graphics.calls
      .filter(([name]) => name === 'fillRect')
      .map(([, args]) => args as number[]);
    expect(rectangles.reduce((area, [, , width, height]) => area + width * height, 0)).toBe(600);
    for (const [x, y, width, height] of rectangles) {
      expect(x).toBeGreaterThanOrEqual(70);
      expect(y).toBeGreaterThanOrEqual(80);
      expect(x + width).toBeLessThanOrEqual(100);
      expect(y + height).toBeLessThanOrEqual(100);
    }
    const before = read.mock.calls.length;
    expect(
      layer.draw({ ...source, cell: read }, { x: 400, y: 400, width: 30, height: 20 }, 0),
    ).toBe(0);
    expect(read.mock.calls).toHaveLength(before + 1);
  });

  it('kar derinliği ve sıkışması modelden okunur; görüntü yüzey değerlerini değiştirmez', () => {
    const data = Object.freeze(sample({ snowDepth: 0.04, snowCompaction: 0.9 }));
    const graphics = fakeObject('graphics');
    const source = weather(data);
    new SurfaceLayer(graphics as unknown as Phaser.GameObjects.Graphics).draw(
      source,
      { x: 0, y: 0, width: 256, height: 256 },
      2,
    );
    const colors = graphics.calls
      .filter(([name]) => name === 'fillStyle')
      .map(([, args]) => args[0]);
    expect(colors).toContain(WEATHER_VIEW.surface.snowColor);
    expect(colors).toContain(WEATHER_VIEW.surface.packedSnowColor);
    const packed = graphics.calls.findIndex(
      ([name, args]) => name === 'fillStyle' && args[0] === WEATHER_VIEW.surface.packedSnowColor,
    );
    expect(graphics.calls[packed + 1][0]).toBe('beginPath');
    expect(graphics.calls.filter(([name]) => name === 'strokeEllipse').length).toBeLessThanOrEqual(
      2,
    );
    expect(data.snowCompaction).toBe(0.9);
  });
  it('kuru, boş veya eksik hücreler ek efekt yaratmaz', () => {
    const graphics = fakeObject('graphics');
    const layer = new SurfaceLayer(graphics as unknown as Phaser.GameObjects.Graphics);
    const source = weather(sample({ wetness: 0, puddleDepth: 0 }));
    expect(layer.draw(source, { x: 0, y: 0, width: 64, height: 64 }, 32)).toBe(1);
    expect(
      graphics.calls.filter(([name]) => name.startsWith('fill') || name === 'strokeEllipse'),
    ).toHaveLength(0);
    expect(layer.draw(source, { x: 0, y: 0, width: 0, height: 64 }, 32)).toBe(0);
    layer.draw({ ...source, cell: () => undefined }, { x: 0, y: 0, width: 64, height: 64 }, 32);
    expect(
      layer.draw(
        { ...source, cell: () => ({ ...sample(), x: 300, y: 300, width: 10, height: 10 }) },
        { x: 0, y: 0, width: 64, height: 64 },
        32,
      ),
    ).toBe(1);
  });
});
