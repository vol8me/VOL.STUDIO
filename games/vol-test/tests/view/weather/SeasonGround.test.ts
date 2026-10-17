import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { SEASONS } from '@/config/seasons';
import { WEATHER_VIEW } from '@/config/weatherView';
import { SeasonGround, seasonPalette } from '@/view/weather/SeasonGround';
import { fakeObject } from '../../support/fakeScene';
import { frame, sample, weather } from '../../support/weatherFixtures';

const rect = { x: 0, y: 0, width: 256, height: 256 };

describe('SeasonGround', () => {
  it('ilk10dk spring tonu korunur, geçiş smooth olur ve yıl döngüsü kesintisiz bağlanır', () => {
    const spring = seasonPalette(frame({ season: 'spring', seasonProgress: 0 }));
    expect(spring.ground).toBe(WEATHER_VIEW.seasons.spring.ground);
    expect(seasonPalette(frame({ season: 'spring', seasonProgress: 10 / 15 }))).toEqual(spring);
    expect(
      seasonPalette(frame({ season: 'spring', seasonProgress: 1 - SEASONS.transitionFraction / 2 }))
        .ground,
    ).not.toBe(spring.ground);
    for (const [current, next] of [
      ['spring', 'summer'],
      ['summer', 'autumn'],
      ['autumn', 'winter'],
      ['winter', 'spring'],
    ] as const) {
      expect(seasonPalette(frame({ season: current, seasonProgress: 1 }))).toEqual(
        seasonPalette(frame({ season: next, seasonProgress: 0 })),
      );
    }
  });

  it('yerel desenler seedlidir; kar ve su modeline yazmaz, hücre dışına çizmez', () => {
    const a = fakeObject('graphics');
    const b = fakeObject('graphics');
    const source = weather(Object.freeze(sample({ snowDepth: 0.03, snowCompaction: 0.8 })));
    new SeasonGround(a as unknown as Phaser.GameObjects.Graphics, 7).draw(source, rect);
    new SeasonGround(b as unknown as Phaser.GameObjects.Graphics, 7).draw(source, rect);
    expect(a.calls).toEqual(b.calls);
    expect(a.calls.filter(([name]) => name === 'fillPath').length).toBeGreaterThan(0);
    expect(a.calls.filter(([name]) => name === 'fillEllipse')).toHaveLength(0);
    expect(source.sample(100, 100).snowDepth).toBe(0.03);
    const read = vi.fn(source.cell);
    const clipped = fakeObject('graphics');
    const layer = new SeasonGround(clipped as unknown as Phaser.GameObjects.Graphics, 7);
    layer.draw({ ...source, cell: read }, { x: 1, y: 2, width: 3, height: 4 });
    expect(read.mock.calls).toContainEqual([0, 0]);
    expect(read.mock.calls.length).toBeLessThanOrEqual(17);
    expect(clipped.calls.find(([name]) => name === 'fillRect')?.[1]).toEqual([1, 2, 3, 4]);
    expect(clipped.calls.filter(([name]) => name === 'fillEllipse')).toHaveLength(0);
    layer.draw(source, { ...rect, height: 0 });
    layer.draw({ ...source, cell: () => undefined }, rect);
    layer.draw(
      { ...source, cell: () => ({ ...sample(), x: 300, y: 300, width: 4, height: 4 }) },
      { x: 0, y: 0, width: 20, height: 20 },
    );
  });
  it('mevsim ışık tonu gerçek daylight değerini izler', () => {
    const dark = fakeObject('graphics');
    const bright = fakeObject('graphics');
    const source = weather();
    new SeasonGround(dark as unknown as Phaser.GameObjects.Graphics, 1).draw(
      { ...source, frame: frame({ daylight: 0.2 }) },
      rect,
    );
    new SeasonGround(bright as unknown as Phaser.GameObjects.Graphics, 1).draw(
      { ...source, frame: frame({ daylight: 1 }) },
      rect,
    );
    const firstColor = (object: typeof dark) =>
      Number(object.calls.find(([name]) => name === 'fillStyle')?.[1][0]);
    expect(firstColor(bright)).toBeGreaterThan(firstColor(dark));
  });
});
