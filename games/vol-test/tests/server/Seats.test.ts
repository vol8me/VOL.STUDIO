import { describe, expect, it } from 'vitest';
import { NETWORK } from '../../src/config/network';
import { SeatPool, seatPoint } from '../../server/Seats';

describe('SeatPool', () => {
  it('en küçük boş yuvayı verir ve serbest bırakılan yuvayı yeniden kullanır', () => {
    const pool = new SeatPool(3);
    expect([pool.acquire(), pool.acquire(), pool.acquire()]).toEqual([0, 1, 2]);
    expect(pool.acquire()).toBeNull();
    pool.release(1);
    expect(pool.used).toBe(2);
    expect(pool.acquire()).toBe(1);
  });

  it('geçersiz yuva bırakmayı ve geçersiz kapasiteyi yok sayar ya da reddeder', () => {
    const pool = new SeatPool(2);
    pool.acquire();
    pool.release(-1);
    pool.release(2);
    pool.release(0.5);
    expect(pool.used).toBe(1);
    for (const capacity of [0, -1, 1.5, Number.NaN]) {
      expect(() => new SeatPool(capacity)).toThrow(RangeError);
    }
  });
});

describe('seatPoint', () => {
  it('yuvaları merkez çevresinde araç gövdesinden uzak tutar', () => {
    const center = { x: 2048, y: 2048 };
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
    expect(Math.min(...gaps)).toBeGreaterThan(2 * 33 * 2);
  });
});
