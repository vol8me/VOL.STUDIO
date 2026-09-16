import { describe, expect, it } from 'vitest';
import {
  RANDOM_STREAM_IDS,
  WorldRandomStreams,
  deriveStreamSeed,
  validateRandomStreamStates,
  type RandomStreamId,
} from '@/runtime/sim/RandomStreams';

/*
 * ALTIN TABLO. Türetme sessizce değişirse bütün dünyalar başka bir diziye
 * kayar ve hiçbir kayıt, hiçbir korpus, hiçbir araştırma artefaktı eski
 * sonucunu yeniden üretemez. Değerler `deriveStreamSeed`den ÖNCE değil, bu
 * tablo yazıldıktan sonra kilitlidir: tabloyu değiştirmek bilinçli bir karardır.
 */
const GOLDEN_STREAM_SEEDS: Readonly<Record<number, Readonly<Record<RandomStreamId, number>>>> = {
  0: {
    habitat: 1180251217,
    fields: 3134002055,
    'matter-seeding': 1193409027,
    lifecycle: 466856009,
    behavior: 3621380059,
    evolution: 3217084191,
  },
  1: {
    habitat: 1783984196,
    fields: 3092816701,
    'matter-seeding': 1489406472,
    lifecycle: 2714627213,
    behavior: 3030328418,
    evolution: 3053345032,
  },
  42: {
    habitat: 1489450868,
    fields: 3215930367,
    'matter-seeding': 2314809769,
    lifecycle: 1378323716,
    behavior: 1648352188,
    evolution: 87019275,
  },
  4242: {
    habitat: 3290460763,
    fields: 4139677120,
    'matter-seeding': 1341408592,
    lifecycle: 2284680992,
    behavior: 3567991954,
    evolution: 1088543322,
  },
  4294967295: {
    habitat: 210082517,
    fields: 2461538851,
    'matter-seeding': 1916568028,
    lifecycle: 3457347243,
    behavior: 4069678241,
    evolution: 2427590152,
  },
};

describe('deriveStreamSeed', () => {
  it('akış adları ve sırası dondurulmuştur', () => {
    expect([...RANDOM_STREAM_IDS]).toEqual([
      'habitat',
      'fields',
      'matter-seeding',
      'lifecycle',
      'behavior',
      'evolution',
    ]);
  });

  it('altın tabloyu birebir üretir', () => {
    for (const [seed, expected] of Object.entries(GOLDEN_STREAM_SEEDS)) {
      const derived = Object.fromEntries(
        RANDOM_STREAM_IDS.map((id) => [id, deriveStreamSeed(Number(seed), id)]),
      );
      expect(derived, `seed ${seed}`).toEqual(expected);
    }
  });

  it('aynı dünyada iki akış aynı tohumu almaz', () => {
    for (const seed of [0, 1, 42, 4242, 0xffffffff, 123456789]) {
      const seeds = RANDOM_STREAM_IDS.map((id) => deriveStreamSeed(seed, id));
      expect(new Set(seeds).size, `seed ${seed}`).toBe(RANDOM_STREAM_IDS.length);
    }
  });

  it('türetilmiş tohum uint32 aralığındadır', () => {
    for (const seed of [0, 7, 0xffffffff]) {
      for (const id of RANDOM_STREAM_IDS) {
        const derived = deriveStreamSeed(seed, id);
        expect(Number.isInteger(derived)).toBe(true);
        expect(derived).toBeGreaterThanOrEqual(0);
        expect(derived).toBeLessThanOrEqual(0xffffffff);
      }
    }
  });

  it('uint32 olmayan tohumu ve tanınmayan akışı reddeder', () => {
    expect(() => deriveStreamSeed(-1, 'habitat')).toThrow(RangeError);
    expect(() => deriveStreamSeed(1.5, 'habitat')).toThrow(RangeError);
    expect(() => deriveStreamSeed(0x1_0000_0000, 'habitat')).toThrow(RangeError);
    expect(() => deriveStreamSeed(Number.NaN, 'habitat')).toThrow(RangeError);
    expect(() => deriveStreamSeed(1, 'organizma' as RandomStreamId)).toThrow(RangeError);
  });
});

describe('WorldRandomStreams', () => {
  it('her akış ayrı bir dizidir: ilk değerler çakışmaz', () => {
    const streams = new WorldRandomStreams(42);
    const sequences = RANDOM_STREAM_IDS.map((id) =>
      Array.from({ length: 8 }, () => streams.stream(id).next()),
    );
    for (let left = 0; left < sequences.length; left++) {
      for (let right = left + 1; right < sequences.length; right++) {
        expect(
          sequences[left],
          `${RANDOM_STREAM_IDS[left]} vs ${RANDOM_STREAM_IDS[right]}`,
        ).not.toEqual(sequences[right]);
      }
    }
  });

  it('aynı dünya tohumu aynı akışları verir, farklı tohum farklı akış', () => {
    const left = new WorldRandomStreams(7);
    const right = new WorldRandomStreams(7);
    const other = new WorldRandomStreams(8);

    expect([...left.snapshot()]).toEqual([...right.snapshot()]);
    expect([...other.snapshot()]).not.toEqual([...left.snapshot()]);
    expect(left.stream('fields').next()).toBe(right.stream('fields').next());
  });

  it('snapshot akış sırasını korur ve restore diziyi kayıt anından sürdürür', () => {
    const streams = new WorldRandomStreams(99);
    for (let index = 0; index < 5; index++) streams.stream('lifecycle').next();
    const saved = streams.snapshot();

    expect([...saved]).toEqual(RANDOM_STREAM_IDS.map((id) => streams.stream(id).getState()));

    const expected = Array.from({ length: 6 }, () => streams.stream('lifecycle').next());
    for (let index = 0; index < 3; index++) streams.stream('behavior').next();
    streams.restore(saved);

    expect(Array.from({ length: 6 }, () => streams.stream('lifecycle').next())).toEqual(expected);
    expect([...streams.snapshot()]).not.toEqual([...saved]);
  });

  it('tanınmayan akış ve bozuk durum tablosu reddedilir', () => {
    const streams = new WorldRandomStreams(1);
    expect(() => streams.stream('nucleus' as RandomStreamId)).toThrow(RangeError);
    expect(() => streams.restore(new Int32Array(RANDOM_STREAM_IDS.length - 1))).toThrow(RangeError);
    expect(() => validateRandomStreamStates(new Int32Array(0))).toThrow(RangeError);
    expect(() =>
      validateRandomStreamStates(new Float64Array(RANDOM_STREAM_IDS.length) as never),
    ).toThrow(RangeError);
  });
});
