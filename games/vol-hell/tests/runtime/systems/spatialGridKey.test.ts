import { describe, it, expect } from 'vitest';
import { SpatialGrid } from '@/runtime/systems/SpatialGrid';

/** Yalnızca konum taşıyan minimal düşman sahtesi. */
function makeEnemy(x: number, y: number): { x: number; y: number; isAlive: boolean } {
  return { x, y, isAlive: true };
}

type EnemyLike = Parameters<SpatialGrid['insert']>[0];

/**
 * O9 regresyonu: hücre anahtarı `(cx + OFFSET) * STRIDE + (cy + OFFSET)`.
 * STRIDE, OFFSET'in iki katı olmazsa cy terimi cx hanesine taşar ve
 * `key(cx, cy) === key(cx + 1, cy - OFFSET)` çakışması oluşur.
 */
describe('SpatialGrid anahtar çakışması', () => {
  const CELL = 50;

  it('uzak hücreler ayrı kovalarda kalır', () => {
    const grid = new SpatialGrid(CELL);

    // Eski formülde çakışan çift: (cx, cy) ve (cx + 1, cy - 1_000_000)
    const a = makeEnemy(0, 0);
    const b = makeEnemy(CELL, -1_000_000 * CELL);

    grid.rebuild([a, b] as unknown as EnemyLike[]);

    // İki farklı hücre olmalı; tek kovaya düşerlerse çakışma var demektir.
    expect(grid.getCellCount()).toBe(2);
  });

  it('negatif koordinatlar pozitiflerle çakışmaz', () => {
    const grid = new SpatialGrid(CELL);

    grid.rebuild([
      makeEnemy(-CELL, -CELL),
      makeEnemy(CELL, CELL),
      makeEnemy(-CELL, CELL),
      makeEnemy(CELL, -CELL),
    ] as unknown as EnemyLike[]);

    expect(grid.getCellCount()).toBe(4);
  });

  it('aynı hücredeki düşmanlar tek kovada toplanır', () => {
    const grid = new SpatialGrid(CELL);

    grid.rebuild([makeEnemy(1, 1), makeEnemy(2, 2), makeEnemy(3, 3)] as unknown as EnemyLike[]);

    expect(grid.getCellCount()).toBe(1);
    expect(grid.queryNearby(1, 1)).toHaveLength(3);
  });

  it('komşu hücre sorgusu 3x3 alanı kapsar', () => {
    const grid = new SpatialGrid(CELL);

    grid.rebuild([
      makeEnemy(0, 0), // merkez
      makeEnemy(CELL, 0), // komşu
      makeEnemy(CELL * 3, 0), // uzak — kapsam dışı
    ] as unknown as EnemyLike[]);

    expect(grid.queryNearby(0, 0)).toHaveLength(2);
  });
});
