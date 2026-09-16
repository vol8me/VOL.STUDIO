import { describe, expect, it } from 'vitest';
import { habitatConfig } from '@/config/habitat';
import { worldConfig } from '@/config/world';
import { FieldSet } from '@/runtime/sim/FieldSet';
import { createHabitatDomain, rasterizeHabitatMask } from '@/runtime/sim/WorldDomain';

const BOUNDS = worldConfig.boundsUnits;
const RESOLUTION = 64;

function maskedFields(seed = 7): { fields: FieldSet; mask: Uint8Array } {
  const domain = createHabitatDomain(BOUNDS, habitatConfig, seed);
  const mask = rasterizeHabitatMask(domain, RESOLUTION);
  const fields = new FieldSet(RESOLUTION);
  fields.setMask(mask);
  return { fields, mask };
}

function worldAt(gridX: number, gridY: number): { x: number; y: number } {
  const cell = BOUNDS.width / RESOLUTION;
  return { x: BOUNDS.x + (gridX + 0.5) * cell, y: BOUNDS.y + (gridY + 0.5) * cell };
}

describe('FieldSet.sample — maske farkındalığı', () => {
  /*
   * Asıl kusur buydu: kıyıdaki örnek, Void hücresinin sıfırını ağırlığa katıp
   * kaynağı yapay olarak düşürüyordu. Sabit bir alanda habitatın HER örneği
   * tam olarak o sabiti vermelidir — kıyı hücreleri dahil.
   */
  it('sabit alanda habitatın her örneği tam olarak sabiti döner', () => {
    const { fields, mask } = maskedFields();
    const constant = 0.375;
    for (let index = 0; index < fields.length; index++) {
      fields.nutrient[index] = mask[index] === 1 ? constant : 0;
    }

    let checked = 0;
    for (let y = 0; y < RESOLUTION; y++) {
      for (let x = 0; x < RESOLUTION; x++) {
        if (mask[y * RESOLUTION + x] === 0) continue;
        const point = worldAt(x, y);
        expect(fields.sample('nutrient', point.x, point.y, BOUNDS)).toBe(constant);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('örnek, şablondaki habitat değerlerinin aralığı dışına çıkmaz', () => {
    const { fields, mask } = maskedFields(11);
    for (let index = 0; index < fields.length; index++) {
      fields.nutrient[index] = mask[index] === 1 ? ((index % 17) + 1) / 20 : 0;
    }
    const cell = BOUNDS.width / RESOLUTION;

    for (let y = 1; y < RESOLUTION - 1; y++) {
      for (let x = 1; x < RESOLUTION - 1; x++) {
        if (mask[y * RESOLUTION + x] === 0) continue;
        const point = { x: BOUNDS.x + (x + 0.9) * cell, y: BOUNDS.y + (y + 0.9) * cell };
        const value = fields.sample('nutrient', point.x, point.y, BOUNDS);
        const template = [
          [x, y],
          [x + 1, y],
          [x, y + 1],
          [x + 1, y + 1],
        ].filter(([tx, ty]) => mask[ty * RESOLUTION + tx] === 1);
        if (template.length === 0) continue;
        const values = template.map(([tx, ty]) => fields.nutrient[ty * RESOLUTION + tx]);
        expect(value).toBeGreaterThanOrEqual(Math.min(...values));
        expect(value).toBeLessThanOrEqual(Math.max(...values));
      }
    }
  });

  it('tamamı habitat olan şablonda sonuç maskesiz bilineerle BAYT düzeyinde aynıdır', () => {
    const masked = new FieldSet(RESOLUTION);
    const plain = new FieldSet(RESOLUTION);
    const mask = new Uint8Array(RESOLUTION * RESOLUTION).fill(1);
    masked.setMask(mask);
    for (let index = 0; index < masked.length; index++) {
      const value = Math.sin(index) * 0.5 + 0.5;
      masked.nutrient[index] = value;
      plain.nutrient[index] = value;
    }
    const cell = BOUNDS.width / RESOLUTION;

    for (let step = 0; step < 500; step++) {
      const point = {
        x: BOUNDS.x + (step % RESOLUTION) * cell + cell * 0.37,
        y: BOUNDS.y + ((step * 7) % RESOLUTION) * cell + cell * 0.61,
      };
      expect(masked.sample('nutrient', point.x, point.y, BOUNDS)).toBe(
        plain.sample('nutrient', point.x, point.y, BOUNDS),
      );
    }
  });

  it('habitattan uzak Void noktası 0 döner', () => {
    const { fields, mask } = maskedFields(3);
    fields.nutrient.fill(0);
    for (let index = 0; index < fields.length; index++) {
      if (mask[index] === 1) fields.nutrient[index] = 0.9;
    }

    const corner = worldAt(0, 0);
    expect(mask[0]).toBe(0);
    expect(fields.sample('nutrient', corner.x, corner.y, BOUNDS)).toBe(0);
  });

  /*
   * Halka yedeği ANLAMLI olmalı: dört köşe de Void olduğunda komşu habitat
   * hücresinin değeri okunur. Sentetik maske kurmak, gerçek habitatta bu
   * durumun nadir olmasından bağımsız olarak kuralı sınar.
   */
  it('dört köşe de Void ise halkadaki en yakın habitat hücresi deterministik okunur', () => {
    const fields = new FieldSet(RESOLUTION);
    const mask = new Uint8Array(RESOLUTION * RESOLUTION);
    const habitatX = 10;
    const habitatY = 12;
    mask[habitatY * RESOLUTION + habitatX] = 1;
    fields.setMask(mask);
    fields.nutrient[habitatY * RESOLUTION + habitatX] = 0.625;

    const cell = BOUNDS.width / RESOLUTION;
    const point = { x: BOUNDS.x + (habitatX + 2) * cell, y: BOUNDS.y + (habitatY + 1) * cell };
    const first = fields.sample('nutrient', point.x, point.y, BOUNDS);

    expect(first).toBe(0.625);
    expect(fields.sample('nutrient', point.x, point.y, BOUNDS)).toBe(first);
  });

  it('sonlu olmayan koordinatı reddeder ve sonlu alanda NaN üretmez', () => {
    const { fields, mask } = maskedFields(5);
    for (let index = 0; index < fields.length; index++) {
      fields.nutrient[index] = mask[index] === 1 ? 0.25 : 0;
    }

    expect(() => fields.sample('nutrient', Number.NaN, 0, BOUNDS)).toThrow(RangeError);
    expect(() => fields.sample('nutrient', 0, Number.POSITIVE_INFINITY, BOUNDS)).toThrow(
      RangeError,
    );

    const cell = BOUNDS.width / RESOLUTION;
    for (let step = 0; step < 2000; step++) {
      const value = fields.sample(
        'nutrient',
        BOUNDS.x + (step % (RESOLUTION * 2)) * cell * 0.5,
        BOUNDS.y + ((step * 3) % (RESOLUTION * 2)) * cell * 0.5,
        BOUNDS,
      );
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});
