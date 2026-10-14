import { describe, expect, it } from 'vitest';
import { PARTS } from '@/config/parts';
import { SPIDER_LOOKS } from '@/config/spiders';
import { ARACHNID, STRIKER } from '@/config/vehicles';
import {
  LEGS_PER_SIDE,
  TRACK_LEFT,
  TRACK_RIGHT,
  bitIndex,
  legBit,
  lostLegs,
  partAnchor,
  partSide,
} from '@/sim/chassis/parts';

describe('parça bit maskesi', () => {
  it('bacak bitleri sol 0-3, sağ 4-7 sırasıyla dizilir', () => {
    expect(legBit(0, 0)).toBe(1);
    expect(legBit(0, 3)).toBe(0b1000);
    expect(legBit(1, 0)).toBe(0b1_0000);
    expect(legBit(1, 3)).toBe(0b1000_0000);
  });

  it('yan başına kayıp bacak sayılır', () => {
    expect(lostLegs(0, 0)).toBe(0);
    expect(lostLegs(0b0000_0111, 0)).toBe(3);
    expect(lostLegs(0b0000_0111, 1)).toBe(0);
    expect(lostLegs(0b1010_0001, 0)).toBe(1);
    expect(lostLegs(0b1010_0001, 1)).toBe(2);
    expect(lostLegs(0xff, 1)).toBe(LEGS_PER_SIDE);
  });

  it('bit sırası ve taraf: tankta sol/sağ palet, yürüyücüde ilk dört sol', () => {
    expect(bitIndex(TRACK_LEFT)).toBe(0);
    expect(bitIndex(TRACK_RIGHT)).toBe(1);
    expect(partSide('tank', 0)).toBe(-1);
    expect(partSide('tank', 1)).toBe(1);
    expect(partSide('walker', 3)).toBe(-1);
    expect(partSide('walker', 4)).toBe(1);
  });

  it('bacak istasyonları görünümün kalça konumlarıyla aynıdır (sunum ve fizik aynı bacağı kırar)', () => {
    for (const id of ['arachnid', 'widow'] as const) {
      const hips = SPIDER_LOOKS[id].hips.map((hip) => hip.x);
      expect([...PARTS.walker.stations[id]], id).toEqual(hips);
    }
  });
});

describe('partAnchor', () => {
  it('tankta yan paletin ortasında, yürüyücüde bacak istasyonunda kenardadır', () => {
    const out = { forward: 0, right: 0 };
    expect(partAnchor(STRIKER, 0, out)).toEqual({
      forward: 0,
      right: -STRIKER.tank.trackOffset,
    });
    expect(partAnchor(STRIKER, 1, out).right).toBe(STRIKER.tank.trackOffset);
    const front = partAnchor(ARACHNID, 4, out);
    expect(front.forward).toBe(PARTS.walker.stations.arachnid[0]);
    expect(front.right).toBeGreaterThan(ARACHNID.walker.halfWidth);
    const rearLeft = partAnchor(ARACHNID, 3, out);
    expect(rearLeft.forward).toBe(PARTS.walker.stations.arachnid[3]);
    expect(rearLeft.right).toBeLessThan(-ARACHNID.walker.halfWidth);
  });
});
