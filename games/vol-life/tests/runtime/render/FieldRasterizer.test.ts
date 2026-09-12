import { describe, expect, it } from 'vitest';
import { FieldSet } from '@/runtime/sim/FieldSet';
import { rasterizeFields } from '@/runtime/render/FieldRasterizer';

describe('rasterizeFields', () => {
  it('her alan hücresini opak RGBA pikseline dönüştürür', () => {
    const fields = new FieldSet(2);

    const pixels = rasterizeFields(fields);

    expect(pixels).toBeInstanceOf(Uint8ClampedArray);
    expect(pixels).toHaveLength(16);
    expect([...pixels.filter((_, index) => index % 4 === 3)]).toEqual([255, 255, 255, 255]);
  });

  it('ışık ve besin farkını karanlık zemin üzerinde görünür kılar', () => {
    const fields = new FieldSet(2);
    fields.light[0] = 1;
    fields.nutrient[1] = 1;
    fields.temperature.fill(0.5);

    const pixels = rasterizeFields(fields);
    const darkLuma = pixels[8] + pixels[9] + pixels[10];
    const lightLuma = pixels[0] + pixels[1] + pixels[2];
    const nutrientLuma = pixels[4] + pixels[5] + pixels[6];

    expect(lightLuma).toBeGreaterThan(darkLuma + 35);
    expect(lightLuma).toBeLessThan(darkLuma + 90);
    expect(nutrientLuma).toBeGreaterThan(darkLuma + 25);
    expect(nutrientLuma).toBeLessThan(darkLuma + 75);
    expect(pixels[5]).toBeGreaterThan(pixels[4]);
  });

  it('taşkın alan değerlerini geçerli kanal aralığına sıkıştırır', () => {
    const fields = new FieldSet(2);
    fields.light.fill(99);
    fields.nutrient.fill(-99);
    fields.temperature.fill(Number.POSITIVE_INFINITY);
    fields.disturbance.fill(Number.NaN);

    const pixels = rasterizeFields(fields);

    expect([...pixels].every((channel) => channel >= 0 && channel <= 255)).toBe(true);
  });
});
