import { describe, expect, it } from 'vitest';
import {
  circleHitsBlocked,
  moveCircle,
  type BlockedTile,
  type MovedPosition,
} from '../../src/sim/playerMove';

/** Yalnız verilen tile kareleri engeldir; dünya dışı engel değildir (çağıranın tanımı). */
const walls =
  (...tiles: [number, number][]): BlockedTile =>
  (x, y) =>
    tiles.some(([wx, wy]) => wx === x && wy === y);

describe('circleHitsBlocked', () => {
  it('daire engel karesine değmiyorsa çarpmaz, giriyorsa çarpar', () => {
    const blocked = walls([5, 5]);
    expect(circleHitsBlocked(blocked, 3.5, 5.5, 0.38)).toBe(false);
    expect(circleHitsBlocked(blocked, 4.7, 5.5, 0.38)).toBe(true);
    expect(circleHitsBlocked(blocked, 4.61, 5.5, 0.38)).toBe(false);
  });

  it('köşeye en yakın nokta yarıçap içindeyse çarpar (kare değil daire)', () => {
    const blocked = walls([5, 5]);
    // Köşe (5,5); merkez köşeden 0.5 uzakta çapraz: 0.35 + 0.35 → mesafe ≈ 0.495 > 0.38.
    expect(circleHitsBlocked(blocked, 4.65, 4.65, 0.38)).toBe(false);
    expect(circleHitsBlocked(blocked, 4.8, 4.8, 0.38)).toBe(true);
  });

  it('negatif koordinatlı tile karelerini de sorar', () => {
    const blocked: BlockedTile = (x, y) => x < 0 || y < 0;
    expect(circleHitsBlocked(blocked, 0.2, 5, 0.38)).toBe(true);
    expect(circleHitsBlocked(blocked, 0.5, 5, 0.38)).toBe(false);
  });
});

describe('moveCircle', () => {
  const out: MovedPosition = { x: 0, y: 0 };

  it('serbest alanda tam adımı atar', () => {
    moveCircle(walls(), 2.5, 2.5, 0.2, -0.1, 0.38, out);
    expect(out).toEqual({ x: 2.7, y: 2.4 });
  });

  it('duvara çarpan eksende durur, diğer eksende kayar', () => {
    const blocked = walls([5, 2], [5, 3], [5, 4], [5, 5], [5, 6], [5, 7], [5, 8]);
    let x = 4.5;
    let y = 3.5;
    for (let step = 0; step < 40; step++) {
      moveCircle(blocked, x, y, 0.1, 0.05, 0.38, out);
      x = out.x;
      y = out.y;
    }
    expect(x).toBeLessThanOrEqual(5 - 0.38 + 1e-9);
    expect(x).toBeGreaterThan(4.5);
    // Duvar boyunca (y) akmaya devam etmiştir: yarıçap payıyla 40 adımın tamamı alınır.
    expect(y).toBeCloseTo(3.5 + 40 * 0.05, 9);
  });

  it('tek eksen engelliyse yalnız o eksen yerinde kalır; ikisi de engelliyse tümü', () => {
    const below = walls([4, 4], [5, 4]);
    moveCircle(below, 4.5, 3.5, 0.2, 0.2, 0.38, out);
    expect(out.x).toBeCloseTo(4.7, 10);
    expect(out.y).toBe(3.5);
    const both = walls([5, 3], [4, 4], [5, 4]);
    moveCircle(both, 4.5, 3.5, 0.2, 0.2, 0.38, out);
    expect(out).toEqual({ x: 4.5, y: 3.5 });
  });

  it('aynı girdiyle her seferinde bit özdeş sonuç verir', () => {
    const blocked = walls([7, 7], [8, 7]);
    const first: MovedPosition = { x: 0, y: 0 };
    const second: MovedPosition = { x: 0, y: 0 };
    moveCircle(blocked, 6.3, 6.8, 0.17333333333333334, 0.07, 0.38, first);
    moveCircle(blocked, 6.3, 6.8, 0.17333333333333334, 0.07, 0.38, second);
    expect(Object.is(first.x, second.x) && Object.is(first.y, second.y)).toBe(true);
  });
});
