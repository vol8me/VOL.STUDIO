import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { TerrainContours } from '@/view/weather/TerrainContours';
import { fakeObject } from '../../support/fakeScene';

const rect = { x: 0, y: 0, width: 64, height: 64 };

describe('TerrainContours', () => {
  it('her köşe bileşimini sınırlı polygonlarla çizer ve bütün noktaları kamera içinde tutar', () => {
    const renderer = new TerrainContours();
    for (let mask = 0; mask < 16; mask++) {
      const graphics = fakeObject('graphics');
      const values = [0, 1, 2, 3].map((corner) => (mask & (1 << corner) ? 1 : -1));
      renderer.draw(
        graphics as unknown as Phaser.GameObjects.Graphics,
        { x: 10, y: 12, width: 31, height: 27 },
        0,
        0,
        64,
        values[0],
        values[1],
        values[2],
        values[3],
      );
      const points = graphics.calls.filter(([name]) => name === 'moveTo' || name === 'lineTo');
      for (const [, args] of points) {
        const [x, y] = args as number[];
        expect(x).toBeGreaterThanOrEqual(10);
        expect(x).toBeLessThanOrEqual(41);
        expect(y).toBeGreaterThanOrEqual(12);
        expect(y).toBeLessThanOrEqual(39);
      }
    }
  });

  it('kamera kırpması dünyadaki konturun konumunu değiştirmez, yalnız görünmeyen kısmı keser', () => {
    const renderer = new TerrainContours();
    const full = fakeObject('graphics');
    const cropped = fakeObject('graphics');
    renderer.draw(full as unknown as Phaser.GameObjects.Graphics, rect, 0, 0, 64, -1, 1, 1, -1);
    renderer.draw(
      cropped as unknown as Phaser.GameObjects.Graphics,
      { x: 20, y: 0, width: 44, height: 64 },
      0,
      0,
      64,
      -1,
      1,
      1,
      -1,
    );
    expect(full.calls).toEqual(cropped.calls);
    const absent = fakeObject('graphics');
    expect(
      renderer.draw(
        absent as unknown as Phaser.GameObjects.Graphics,
        { x: 70, y: 70, width: 20, height: 20 },
        0,
        0,
        64,
        1,
        1,
        1,
        1,
      ),
    ).toBe(false);
    expect(absent.calls).toHaveLength(0);
    renderer.draw(full as unknown as Phaser.GameObjects.Graphics, rect, 0, 0, 64, 2, -1, 2, -1);
    expect(full.calls.filter(([name]) => name === 'fillPath')).toHaveLength(2);
  });
});
