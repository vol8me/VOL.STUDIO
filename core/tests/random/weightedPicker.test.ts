import { describe, it, expect } from 'vitest';
import { WeightedPicker } from '../../src/random/WeightedPicker';
import { createRandom } from '../../src/random/random';

describe('WeightedPicker', () => {
  it('boş havuz undefined döner', () => {
    expect(new WeightedPicker<string>([]).pick(createRandom(1))).toBeUndefined();
  });

  it('sıfır ve negatif ağırlıklar havuza GİRMEZ', () => {
    // "Bu seçenek şu an kapalı" demenin doğal yolu ağırlığı sıfırlamaktır;
    // çağıranı ayrıca filtrelemeye zorlamak gereksiz.
    const picker = new WeightedPicker([
      { value: 'a', weight: 0 },
      { value: 'b', weight: -5 },
      { value: 'c', weight: NaN },
      { value: 'd', weight: 1 },
    ]);

    expect(picker.size).toBe(1);
    expect(picker.pick(createRandom(1))).toBe('d');
  });

  it('ağırlıklar dağılıma yansır', () => {
    const picker = new WeightedPicker([
      { value: 'nadir', weight: 1 },
      { value: 'sık', weight: 9 },
    ]);
    const random = createRandom(42);

    let common = 0;
    for (let i = 0; i < 10_000; i++) {
      if (picker.pick(random) === 'sık') common++;
    }

    expect(common / 10_000).toBeGreaterThan(0.86);
    expect(common / 10_000).toBeLessThan(0.94);
  });

  it('aynı tohum aynı seçim dizisini üretir (deterministik)', () => {
    const entries = [
      { value: 'a', weight: 3 },
      { value: 'b', weight: 1 },
      { value: 'c', weight: 2 },
    ];
    const run = (): string[] => {
      const picker = new WeightedPicker(entries);
      const random = createRandom(7);
      return Array.from({ length: 20 }, () => picker.pick(random)!);
    };

    expect(run()).toEqual(run());
  });

  it('tek elemanlı havuz her zaman onu döner', () => {
    const picker = new WeightedPicker([{ value: 'tek', weight: 5 }]);
    const random = createRandom(3);
    for (let i = 0; i < 50; i++) expect(picker.pick(random)).toBe('tek');
  });

  it('pickUnique TEKRARSIZ seçer', () => {
    const picker = new WeightedPicker([
      { value: 'a', weight: 1 },
      { value: 'b', weight: 1 },
      { value: 'c', weight: 1 },
    ]);

    const picked = picker.pickUnique(createRandom(9), 3);
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
  });

  it('pickUnique havuzdan fazlasını isteyince olabildiğince çok döner', () => {
    const picker = new WeightedPicker([
      { value: 'a', weight: 1 },
      { value: 'b', weight: 1 },
    ]);

    expect(picker.pickUnique(createRandom(1), 10)).toHaveLength(2);
  });

  it('pickUnique sıfır/negatif sayıda boş dizi döner', () => {
    const picker = new WeightedPicker([{ value: 'a', weight: 1 }]);
    expect(picker.pickUnique(createRandom(1), 0)).toEqual([]);
    expect(picker.pickUnique(createRandom(1), -3)).toEqual([]);
  });

  it('pickUnique de deterministiktir', () => {
    const entries = [
      { value: 'a', weight: 5 },
      { value: 'b', weight: 3 },
      { value: 'c', weight: 1 },
      { value: 'd', weight: 1 },
    ];
    const run = (): string[] => new WeightedPicker(entries).pickUnique(createRandom(11), 3);

    expect(run()).toEqual(run());
  });

  it('pick havuzu TÜKETMEZ', () => {
    const picker = new WeightedPicker([{ value: 'a', weight: 1 }]);
    picker.pick(createRandom(1));
    expect(picker.size).toBe(1);
  });
});
