import { describe, expect, it } from 'vitest';
import { FieldSet } from '@/runtime/sim/FieldSet';

describe('FieldSet', () => {
  it('altı alanı nesnesiz paralel Float32Array olarak ayırır', () => {
    const fields = new FieldSet(8);

    expect(fields.length).toBe(64);
    expect(fields.flowX).toBeInstanceOf(Float32Array);
    expect(fields.flowY).toBeInstanceOf(Float32Array);
    expect(fields.nutrient).toBeInstanceOf(Float32Array);
    expect(fields.light).toBeInstanceOf(Float32Array);
    expect(fields.temperature).toBeInstanceOf(Float32Array);
    expect(fields.disturbance).toBeInstanceOf(Float32Array);
  });

  it('yalnız ikinin kuvveti çözünürlüğü kabul eder', () => {
    expect(() => new FieldSet(7)).toThrow(RangeError);
    expect(() => new FieldSet(1)).toThrow(RangeError);
    expect(() => new FieldSet(16)).not.toThrow();
  });

  it('indeksleri iki eksende toroidal sarar', () => {
    const fields = new FieldSet(8);

    expect(fields.index(-1, 0)).toBe(7);
    expect(fields.index(8, 0)).toBe(0);
    expect(fields.index(0, -1)).toBe(56);
    expect(fields.index(0, 8)).toBe(0);
  });

  it('dünya koordinatını hücre merkezleri arasında çift doğrusal örnekler', () => {
    const fields = new FieldSet(4);
    fields.nutrient[fields.index(0, 0)] = 0;
    fields.nutrient[fields.index(1, 0)] = 1;
    fields.nutrient[fields.index(0, 1)] = 0.5;
    fields.nutrient[fields.index(1, 1)] = 0.25;

    expect(fields.sample('nutrient', 256, 128, 1024)).toBeCloseTo(0.5, 6);
    expect(fields.sample('nutrient', 256, 256, 1024)).toBeCloseTo(0.4375, 6);
  });

  it('difüzyon toplam niceliği korur ve karşı kenara ulaşır', () => {
    const fields = new FieldSet(8);
    fields.nutrient[fields.index(0, 0)] = 1;

    fields.diffuse('nutrient', 0.2);

    const sum = fields.nutrient.reduce((total, value) => total + value, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(fields.nutrient[fields.index(7, 0)]).toBeCloseTo(0.2, 6);
    expect(fields.nutrient[fields.index(0, 7)]).toBeCloseTo(0.2, 6);
  });

  it('kademeli difüzyonda yalnız seçili satır aralığını yazar', () => {
    const fields = new FieldSet(8);
    fields.nutrient.fill(0.25);
    fields.nutrient[fields.index(3, 2)] = 1;
    const before = fields.nutrient.slice();

    fields.diffuseRows('nutrient', 0.2, 2, 2);

    expect(fields.nutrient.slice(0, 16)).toEqual(before.slice(0, 16));
    expect(fields.nutrient.slice(32)).toEqual(before.slice(32));
    expect(fields.nutrient.slice(16, 32)).not.toEqual(before.slice(16, 32));
  });
});
