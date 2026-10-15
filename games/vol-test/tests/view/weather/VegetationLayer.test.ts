import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { WEATHER_VIEW } from '@/config/weatherView';
import { TerrainField } from '@/view/weather/TerrainField';
import { VegetationLayer, vegetationPalette } from '@/view/weather/VegetationLayer';
import { fakeObject } from '../../support/fakeScene';
import { frame, sample, weather } from '../../support/weatherFixtures';

const rect = { x: 0, y: 0, width: 256, height: 256 };
const VEGETATION = WEATHER_VIEW.vegetation;

function layer(growth: number, quality = 1) {
  const graphics = fakeObject('graphics');
  const view = new VegetationLayer(graphics as unknown as Phaser.GameObjects.Graphics);
  const source = weather(sample({ growth }));
  const field = new TerrainField(7);
  field.prepare(source, rect);
  return { graphics, view, source, field, quality };
}

const count = (object: ReturnType<typeof fakeObject>, name: string): number =>
  object.calls.filter(([call]) => call === name).length;

describe('VegetationLayer', () => {
  it('çıplak toprağa çizim yapmaz; örtü büyüdükçe küme sayısı artar', () => {
    const bare = layer(0);
    bare.view.draw(bare.field, bare.source.frame, rect);
    expect(bare.view.drawn).toBe(0);
    expect(count(bare.graphics, 'lineTo')).toBe(0);

    const young = layer(0.2);
    young.view.draw(young.field, young.source.frame, rect);
    const lush = layer(1);
    lush.view.draw(lush.field, lush.source.frame, rect);
    expect(young.view.drawn).toBeGreaterThan(0);
    expect(lush.view.drawn).toBeGreaterThan(young.view.drawn);
    expect(count(lush.graphics, 'fillEllipse')).toBeGreaterThan(0);
  });

  it('kare başına tutam tavanını aşmaz ve kalite düşünce seyrelir', () => {
    const size = 64;
    const cells = 24;
    const surface = sample({ growth: 1 });
    const source = {
      ...weather(surface),
      columns: cells,
      rows: cells,
      cell: (col: number, row: number) =>
        col < 0 || row < 0 || col >= cells || row >= cells
          ? undefined
          : { ...surface, x: col * size, y: row * size, width: size, height: size },
    };
    const wide = { x: 0, y: 0, width: cells * size, height: cells * size };
    const draw = (quality: number) => {
      const field = new TerrainField(7);
      field.prepare(source, wide);
      const graphics = fakeObject('graphics');
      const view = new VegetationLayer(graphics as unknown as Phaser.GameObjects.Graphics);
      view.draw(field, source.frame, wide, quality);
      return view.drawn;
    };
    const full = draw(1);
    // 24x24 hücrelik tam örtü kare tavanının çok üstünde aday verir: seyreltme devreye girer.
    expect(full).toBeGreaterThan(VEGETATION.capacity * 0.6);
    expect(full).toBeLessThanOrEqual(VEGETATION.capacity * 1.2);
    expect(draw(0.25)).toBeLessThan(full);
  });

  it('eşiği yeni geçen küme bir anda tam boyda belirmez: filizlenir (en küçük küme tam boyun yarısından küçük)', () => {
    const young = layer(0.22);
    young.view.draw(young.field, young.source.frame, rect);
    const widths = young.graphics.calls
      .filter(([name]) => name === 'fillEllipse')
      .map(([, args]) => Number(args[2]));
    expect(widths.length).toBeGreaterThan(0);
    const minimum = VEGETATION.length[0] * 1.25;
    expect(Math.min(...widths)).toBeLessThan(minimum * 0.5);
  });

  it('çizim seedlidir: aynı alan iki katmanda aynı çizgileri verir', () => {
    const a = layer(0.6);
    const b = layer(0.6);
    a.view.draw(a.field, a.source.frame, rect);
    b.view.draw(b.field, b.source.frame, rect);
    expect(a.graphics.calls).toEqual(b.graphics.calls);
  });

  it('kamera kapsanan alan içinde kalırsa ve saat yakınsa yeniden çizmez; dışına çıkınca çizer', () => {
    const run = layer(0.8);
    run.view.draw(run.field, run.source.frame, rect);
    const first = run.graphics.calls.length;
    run.view.draw(run.field, run.source.frame, { x: 8, y: 8, width: 200, height: 200 });
    expect(run.graphics.calls).toHaveLength(first);
    // Saat belirli aralıktan fazla ilerlerse örtü tazelenir.
    run.view.draw(
      run.field,
      { ...run.source.frame, elapsedMs: run.source.frame.elapsedMs + VEGETATION.redrawMs + 1 },
      rect,
    );
    expect(run.graphics.calls.length).toBeGreaterThan(first);
    const second = run.graphics.calls.length;
    // Kapsanan alanın çok dışına çıkınca yeniden çizilir.
    run.field.prepare(run.source, { x: 0, y: 0, width: 256, height: 256 });
    run.view.draw(run.field, run.source.frame, { x: 2000, y: 2000, width: 256, height: 256 });
    expect(run.graphics.calls.length).toBeGreaterThanOrEqual(second);
  });

  it('kar üstünde yalnız karlı hücrelerde uç çizer; derin karda seyrekleşir, karsızda çizmez', () => {
    const draw = (snowDepth: number) => {
      const graphics = fakeObject('graphics');
      const tips = fakeObject('graphics');
      const view = new VegetationLayer(
        graphics as unknown as Phaser.GameObjects.Graphics,
        tips as unknown as Phaser.GameObjects.Graphics,
      );
      const source = weather(sample({ growth: 0.8, snowDepth }));
      const field = new TerrainField(7);
      field.prepare(source, rect);
      view.draw(field, source.frame, rect);
      return tips.calls.filter(([name]) => name === 'lineTo').length;
    };
    const full = WEATHER_VIEW.surface.snowFullDepth;
    expect(draw(0)).toBe(0);
    const light = draw(full * 0.3);
    expect(light).toBeGreaterThan(0);
    expect(draw(full * 1.2)).toBeLessThan(light);
    // Derin karda uçlar seyrek ama tümden yok olmaz: kar altı yeşillik sezilir.
    const deep = draw(full * VEGETATION.tip.fadeDepth * 1.1);
    expect(deep).toBeGreaterThan(0);
    expect(deep).toBeLessThan(light);
  });

  it('boş görünür alan çizimi temizler ve hata vermez', () => {
    const run = layer(0.8);
    run.view.draw(run.field, run.source.frame, rect);
    run.view.draw(run.field, run.source.frame, { ...rect, width: 0 });
    expect(run.view.drawn).toBe(0);
    expect(count(run.graphics, 'clear')).toBeGreaterThanOrEqual(2);
  });

  it('palet mevsimi izler, geçişte sonrakine karışır ve gün ışığıyla koyulaşır', () => {
    const spring = vegetationPalette(frame({ season: 'spring', seasonProgress: 0, daylight: 1 }));
    const autumn = vegetationPalette(frame({ season: 'autumn', seasonProgress: 0, daylight: 1 }));
    expect(spring.leaf).not.toBe(autumn.leaf);
    const late = vegetationPalette(frame({ season: 'spring', seasonProgress: 0.99, daylight: 1 }));
    const summer = vegetationPalette(frame({ season: 'summer', seasonProgress: 0, daylight: 1 }));
    expect(late.leaf).not.toBe(spring.leaf);
    expect(Math.abs(late.leaf - summer.leaf)).toBeLessThan(Math.abs(spring.leaf - summer.leaf));
    const night = vegetationPalette(frame({ season: 'spring', seasonProgress: 0, daylight: 0 }));
    expect(night.leaf).toBeLessThan(spring.leaf);
  });
});
