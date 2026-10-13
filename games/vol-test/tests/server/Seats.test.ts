import { describe, expect, it } from 'vitest';
import { NETWORK } from '../../src/config/network';
import { chooseSeat, seatPoint, seatsFor } from '../../server/Seats';

const center = { x: 2048, y: 2048 };

describe('seatPoint', () => {
  it('yuvaları merkez çevresinde araç gövdesinden uzak tutar', () => {
    const points = Array.from({ length: NETWORK.maxPlayers }, (_, seat) =>
      seatPoint(seat, NETWORK.maxPlayers, center),
    );
    for (const point of points) {
      expect(Math.hypot(point.x - center.x, point.y - center.y)).toBeCloseTo(NETWORK.seatRadius);
    }
    const gaps = points.flatMap((a, i) =>
      points.slice(i + 1).map((b) => Math.hypot(a.x - b.x, a.y - b.y)),
    );
    // Gövde yarıçapı ≈ 33: komşu yuvalar en az iki gövde kadar açıktır.
    expect(Math.min(...gaps)).toBeGreaterThan(66);
  });

  it('araç merkeze bakar', () => {
    for (let seat = 0; seat < NETWORK.maxPlayers; seat++) {
      const point = seatPoint(seat, NETWORK.maxPlayers, center);
      const toCenter = Math.atan2(center.y - point.y, center.x - point.x);
      expect(Math.cos(point.hull)).toBeCloseTo(Math.cos(toCenter));
      expect(Math.sin(point.hull)).toBeCloseTo(Math.sin(toCenter));
    }
  });
});

describe('seatsFor', () => {
  it('takımsız araç bütün halkayı kullanır', () => {
    expect(seatsFor(null, 6, 2)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('takımlar halkanın ayrık eşit yaylarını kullanır', () => {
    expect(seatsFor(0, 12, 2)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(seatsFor(1, 12, 2)).toEqual([6, 7, 8, 9, 10, 11]);
  });
});

describe('chooseSeat', () => {
  it('tehdit yoksa ilk yuvayı verir', () => {
    expect(chooseSeat([3, 4, 5], 12, center, [])).toBe(3);
  });

  it('tehditten en uzak yuvayı seçer', () => {
    const near = seatPoint(0, 12, center);
    expect(chooseSeat([0, 6], 12, center, [near])).toBe(6);
  });

  it('dolu yuvadaki araç o yuvayı elemiş olur', () => {
    const at = seatPoint(1, 12, center);
    expect(chooseSeat([0, 1, 2], 12, center, [at])).not.toBe(1);
  });

  it('eşitlikte küçük numaralı yuvayı verir', () => {
    expect(chooseSeat([2, 5], 12, center, [center])).toBe(2);
  });

  it('boş yuva listesini reddeder', () => {
    expect(() => chooseSeat([], 12, center, [])).toThrow(RangeError);
  });
});
