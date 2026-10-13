import { describe, expect, it } from 'vitest';
import { BELT } from '../../src/config/forge';
import { beltItemPoint, lerp, tileAt, visibleChunks } from '../../src/view/geometry';
import { evictionOrder } from '../../src/view/chunkCache';

describe('visibleChunks', () => {
  it('görünüm dikdörtgenini kapsayan chunk aralığını verir', () => {
    expect(visibleChunks({ x: 300, y: 10, width: 400, height: 300 }, 256, 16, 16)).toEqual({
      x0: 1,
      y0: 0,
      x1: 2,
      y1: 1,
    });
  });

  it('dünya sınırına kırpar', () => {
    expect(visibleChunks({ x: -500, y: -500, width: 99_999, height: 99_999 }, 256, 4, 3)).toEqual({
      x0: 0,
      y0: 0,
      x1: 3,
      y1: 2,
    });
  });

  it('tamamen dünya dışındaki görünümde boş aralık döner', () => {
    const range = visibleChunks({ x: 10_000, y: 0, width: 100, height: 100 }, 256, 4, 4);
    expect(range.x0).toBeGreaterThan(range.x1);
  });
});

describe('tileAt', () => {
  it('dünya pikselini tile kenarına çevirir', () => {
    expect(tileAt(33, 17, 16, 64, 64)).toEqual({ x: 2, y: 1 });
    expect(tileAt(0, 0, 16, 64, 64)).toEqual({ x: 0, y: 0 });
  });

  it('dünya dışı ve sonsuz değerlerde null verir', () => {
    expect(tileAt(-1, 5, 16, 64, 64)).toBeNull();
    expect(tileAt(64 * 16, 5, 16, 64, 64)).toBeNull();
    expect(tileAt(5, 64 * 16, 16, 64, 64)).toBeNull();
    expect(tileAt(Number.NaN, 5, 16, 64, 64)).toBeNull();
    expect(tileAt(Infinity, 5, 16, 64, 64)).toBeNull();
  });
});

describe('beltItemPoint', () => {
  const out = { x: 0, y: 0 };

  it('doğuya akan bantta eşya girişten çıkışa soldan sağa gider', () => {
    beltItemPoint(2, 3, 0, 0, 16, out);
    expect(out).toEqual({ x: 32, y: 56 });
    beltItemPoint(2, 3, 0, BELT.length / 2, 16, out);
    expect(out).toEqual({ x: 40, y: 56 });
  });

  it('güneye akan bantta yukarıdan aşağıya iner', () => {
    beltItemPoint(0, 0, 1, 0, 16, out);
    expect(out).toEqual({ x: 8, y: 0 });
    beltItemPoint(0, 0, 1, BELT.length, 16, out);
    expect(out).toEqual({ x: 8, y: 16 });
  });

  it('batı ve kuzey yönleri tersine akar', () => {
    beltItemPoint(0, 0, 2, 0, 16, out);
    expect(out).toEqual({ x: 16, y: 8 });
    beltItemPoint(0, 0, 3, 0, 16, out);
    expect(out).toEqual({ x: 8, y: 16 });
  });
});

describe('lerp', () => {
  it('uçlarda ve ortada doğrudur', () => {
    expect(lerp(2, 10, 0)).toBe(2);
    expect(lerp(2, 10, 1)).toBe(10);
    expect(lerp(2, 10, 0.5)).toBe(6);
  });
});

describe('evictionOrder', () => {
  const used = (entries: [number, number][]) => new Map(entries);

  it('sınır aşılmadıysa bir şey düşürmez', () => {
    expect(
      evictionOrder(
        used([
          [1, 1],
          [2, 2],
        ]),
        2,
        () => false,
      ),
    ).toEqual([]);
  });

  it('fazlayı en eski kullanılandan başlayarak düşürür', () => {
    const map = used([
      [1, 5],
      [2, 1],
      [3, 3],
      [4, 9],
    ]);
    expect(evictionOrder(map, 2, () => false)).toEqual([2, 3]);
  });

  it('görünür chunk hiçbir zaman düşmez', () => {
    const map = used([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
    expect(evictionOrder(map, 1, (chunk) => chunk !== 3)).toEqual([3]);
    expect(evictionOrder(map, 0, () => true)).toEqual([]);
  });
});
