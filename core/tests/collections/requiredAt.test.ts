import { describe, expect, it } from 'vitest';
import { requiredAt, requiredNumberAt } from '../../src/collections/requiredAt';

describe('dolu hücre invariantı', () => {
  it('iç sayısal tampon yolu sıfır/negatif değeri korur ve eksik hücrede durur', () => {
    for (const values of [[0, -2], new Float64Array([0, -2]), new Int32Array([0, -2])]) {
      expect(requiredNumberAt(values, 0)).toBe(0);
      expect(requiredNumberAt(values, 1)).toBe(-2);
      for (const index of [-1, 2, 0.5, NaN, Infinity]) {
        expect(() => requiredNumberAt(values, index)).toThrow(RangeError);
      }
    }
    expect(() => requiredNumberAt(new Array<number>(1), 0)).toThrow(RangeError);
  });

  it('algoritma sınırındaki ilk/son hücreyi diziden ve tipli tampondan okur', () => {
    for (const values of [[0, -2], new Float64Array([0, -2])]) {
      expect(requiredAt(values, 0)).toBe(0);
      expect(requiredAt(values, 1)).toBe(-2);
    }
  });

  it('taşan, kesirli ve sonlu olmayan indeks sessiz undefined üretmez', () => {
    for (const index of [-1, 2, 0.5, NaN, Infinity, -Infinity]) {
      expect(() => requiredAt([1, 2], index)).toThrow(RangeError);
    }
    expect(() => requiredAt([], 0)).toThrow(RangeError);
  });

  it('seyrek hücreyi, prototipten gelen hücreyi ve açık undefined değerini ayırır', () => {
    const sparse: (number | undefined)[] = new Array<number>(2);
    Object.setPrototypeOf(sparse, { 0: 12 });
    expect(() => requiredAt(sparse, 0)).toThrow(RangeError);
    expect(() => requiredAt(sparse, 1)).toThrow(RangeError);
    sparse[1] = undefined;
    expect(requiredAt(sparse, 1)).toBeUndefined();
  });
});
