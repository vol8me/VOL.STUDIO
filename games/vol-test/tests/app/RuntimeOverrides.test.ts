import { describe, expect, it } from 'vitest';
import { parseRuntimeOverrides } from '@/app/RuntimeOverrides';

describe('parseRuntimeOverrides', () => {
  it.each(['', '0', 'true', '01'])(
    'ölçüm bayrağı %s ise bütün geçici tercihleri yok sayar',
    (flag) => {
      expect(
        parseRuntimeOverrides({
          VOL_DECK_MEASURE: flag,
          VOL_DECK_SCENARIO: '40',
          VOL_DECK_SEED: '2',
          VOL_DECK_WEATHER: 'snow',
          VOL_DECK_SEASON: 'winter',
          VOL_DECK_QUALITY: 'low',
        }),
      ).toEqual({});
    },
  );
  it.each([
    ['0', 'empty'],
    ['10', 'slalom'],
    ['20', 'targets'],
    ['30', 'sandbox'],
    ['40', 'multitank'],
  ])('senaryo %s → %s', (value, scenario) => {
    expect(parseRuntimeOverrides({ VOL_DECK_MEASURE: '1', VOL_DECK_SCENARIO: value })).toEqual({
      scenario,
    });
  });
  it.each(['0', '4294967295'])('uint32 tohum sınırını kabul eder: %s', (value) => {
    expect(parseRuntimeOverrides({ VOL_DECK_MEASURE: '1', VOL_DECK_SEED: value })).toEqual({
      seed: Number(value),
    });
  });
  it.each(['-1', '4294967296', '1.5', '1e2', '', '12345678901'])(
    'geçersiz tohumu yok sayar: %s',
    (value) => {
      expect(parseRuntimeOverrides({ VOL_DECK_MEASURE: '1', VOL_DECK_SEED: value })).toEqual({});
    },
  );
  it('hava, mevsim ve kaliteyi birbirinden bağımsız doğrular', () => {
    for (const weather of ['clear', 'dust', 'rain', 'snow'])
      expect(parseRuntimeOverrides({ VOL_DECK_MEASURE: '1', VOL_DECK_WEATHER: weather })).toEqual({
        weather,
      });
    for (const season of ['spring', 'summer', 'autumn', 'winter'])
      expect(parseRuntimeOverrides({ VOL_DECK_MEASURE: '1', VOL_DECK_SEASON: season })).toEqual({
        season,
      });
    for (const quality of ['low', 'high'])
      expect(parseRuntimeOverrides({ VOL_DECK_MEASURE: '1', VOL_DECK_QUALITY: quality })).toEqual({
        quality,
      });
    expect(
      parseRuntimeOverrides({
        VOL_DECK_MEASURE: '1',
        VOL_DECK_SCENARIO: '50',
        VOL_DECK_WEATHER: 'RAIN',
        VOL_DECK_SEASON: 'unknown',
        VOL_DECK_QUALITY: 'low:high',
      }),
    ).toEqual({});
  });
});
