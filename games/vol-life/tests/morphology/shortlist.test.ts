import { describe, expect, it } from 'vitest';
import {
  defaultShortlistConfig,
  selectShortlist,
  type ShortlistEntry,
} from '@/../scripts/morphology/shortlist';

/*
 * F5: kısa liste yalnız skorla seçilmez. En yüksek skorlu sekiz aday
 * birbirinin kopyası olabilir ve insan ön-elemesi o listeden hiçbir şey
 * öğrenmez.
 */
function entry(
  index: number,
  score: number,
  primary: ShortlistEntry['primary'],
  metrics: number[],
): ShortlistEntry {
  return { index, digest: String(index).padStart(16, '0'), primary, score, metrics };
}

describe('F5 — audition kısa listesi', () => {
  it('faz çeşitliliği skordan önce gelir', () => {
    const candidates = [
      entry(1, 0.99, 'DYNAMIC_STRUCTURED', [1, 1]),
      entry(2, 0.98, 'DYNAMIC_STRUCTURED', [1, 1.01]),
      entry(3, 0.97, 'DYNAMIC_STRUCTURED', [1, 1.02]),
      entry(4, 0.2, 'GAS', [0, 0]),
      entry(5, 0.1, 'SINGLE_COLLAPSE', [5, 5]),
    ];

    const result = selectShortlist(candidates, { minSize: 3, maxSize: 3 });

    expect(result.phaseCoverage).toHaveLength(3);
    expect(result.selected.map((item) => item.primary)).toContain('GAS');
    expect(result.selected.map((item) => item.primary)).toContain('SINGLE_COLLAPSE');
  });

  /* Kalan yerler birbirine en UZAK adaylarla dolar, en yüksek skorlularla değil. */
  it('kalan yerleri metrik uzayında uzak adaylarla doldurur', () => {
    const candidates = [
      entry(1, 0.99, 'DYNAMIC_STRUCTURED', [0, 0]),
      entry(2, 0.98, 'DYNAMIC_STRUCTURED', [0.01, 0]),
      entry(3, 0.97, 'DYNAMIC_STRUCTURED', [0.02, 0]),
      entry(4, 0.5, 'DYNAMIC_STRUCTURED', [10, 10]),
    ];

    const result = selectShortlist(candidates, { minSize: 2, maxSize: 2 });

    expect(result.selected.map((item) => item.index)).toEqual([1, 4]);
    expect(result.minPairwiseDistance).toBeGreaterThan(10);
  });

  it('liste en fazla sekiz adaydır', () => {
    const candidates = Array.from({ length: 30 }, (_, index) =>
      entry(index, 1 - index / 100, 'DYNAMIC_STRUCTURED', [index, index * 2]),
    );

    const result = selectShortlist(candidates);

    expect(result.selected.length).toBeLessThanOrEqual(defaultShortlistConfig.maxSize);
    expect(result.selected.length).toBeGreaterThanOrEqual(defaultShortlistConfig.minSize);
  });

  it('aday havuzu kısa listeden küçükse taşmaz', () => {
    const result = selectShortlist([entry(1, 1, 'GAS', [0, 0])]);

    expect(result.selected).toHaveLength(1);
    expect(result.minPairwiseDistance).toBe(0);
  });

  it('boş havuz ve tutarsız sınır reddedilir', () => {
    expect(() => selectShortlist([])).toThrow(RangeError);
    expect(() => selectShortlist([entry(1, 1, 'GAS', [0, 0])], { minSize: 5, maxSize: 2 })).toThrow(
      RangeError,
    );
  });
});
