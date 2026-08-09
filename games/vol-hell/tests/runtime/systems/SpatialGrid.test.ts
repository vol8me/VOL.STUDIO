import { describe, it, expect } from 'vitest';
import { SpatialGrid } from '@/runtime/systems/SpatialGrid';

/** Düşman yerine geçen basit test mock'u */
function makeEnemy(x: number, y: number, alive = true) {
  return {
    x,
    y,
    radius: 14,
    isAlive: alive,
  } as unknown as Parameters<SpatialGrid['insert']>[0];
}

describe('SpatialGrid', () => {
  it('yakın hücredeki düşmanları bulur', () => {
    const grid = new SpatialGrid(56);
    grid.insert(makeEnemy(100, 100));
    grid.insert(makeEnemy(500, 500));

    const nearby = grid.queryNearby(105, 105);
    expect(nearby).toHaveLength(1);
    expect(nearby[0].x).toBe(100);
  });

  it('uzak hücredeki düşmanları döndürmez', () => {
    const grid = new SpatialGrid(56);
    grid.insert(makeEnemy(100, 100));
    grid.insert(makeEnemy(1000, 1000));

    const nearby = grid.queryNearby(105, 105);
    expect(nearby).toHaveLength(1);
  });

  it('komşu hücre sınırındaki düşmanları bulur', () => {
    const grid = new SpatialGrid(56);
    grid.insert(makeEnemy(55, 55));
    grid.insert(makeEnemy(57, 57));

    const nearby = grid.queryNearby(56, 56);
    expect(nearby).toHaveLength(2);
  });

  it('clear sonrası boş döner', () => {
    const grid = new SpatialGrid(56);
    grid.insert(makeEnemy(100, 100));
    grid.clear();

    const nearby = grid.queryNearby(105, 105);
    expect(nearby).toHaveLength(0);
  });

  it('insertAll ölü düşmanları atlar', () => {
    const grid = new SpatialGrid(56);
    const enemies = [makeEnemy(100, 100, true), makeEnemy(110, 110, false)];
    grid.insertAll(enemies);

    const nearby = grid.queryNearby(105, 105);
    expect(nearby).toHaveLength(1);
  });

  it('aynı hücrede birden fazla düşman', () => {
    const grid = new SpatialGrid(56);
    grid.insert(makeEnemy(10, 10));
    grid.insert(makeEnemy(20, 20));
    grid.insert(makeEnemy(30, 30));

    const nearby = grid.queryNearby(15, 15);
    expect(nearby).toHaveLength(3);
  });

  it("1000 düşmanda grid sorgusu brute-force'tan çok daha az sonuç döndürür", () => {
    const cellSize = 56;
    const grid = new SpatialGrid(cellSize);

    // 1000 düşmanı 2000x2000 alanına dağıt
    const enemies: ReturnType<typeof makeEnemy>[] = [];
    for (let i = 0; i < 1000; i++) {
      const x = (i * 63) % 2000;
      const y = (i * 97) % 2000;
      enemies.push(makeEnemy(x, y));
    }
    grid.insertAll(enemies);

    // (100, 100) civarında sorgula — en fazla 9 hücredekiler döner
    const nearby = grid.queryNearby(100, 100);

    // Brute-force tüm 1000 düşmanı kontrol ederdi; grid yalnızca yakındaki ~9 hücreyi
    expect(nearby.length).toBeLessThan(50);
    expect(nearby.length).toBeGreaterThan(0);

    // Brute-force karşılaştırma: aynı pozisyon için tüm düşmanları filtrele
    const bruteForce = enemies.filter(
      (e) => Math.abs(e.x - 100) <= cellSize && Math.abs(e.y - 100) <= cellSize,
    );
    // Grid en az brute-force kadar doğru — hiçbir yakın düşmanı kaçırmaz
    expect(nearby.length).toBeGreaterThanOrEqual(bruteForce.length);
  });

  it('trim boş hücreleri kaldırır', () => {
    const grid = new SpatialGrid(56);
    grid.insert(makeEnemy(100, 100));
    grid.insert(makeEnemy(500, 500));
    expect(grid.getCellCount()).toBe(2);

    grid.clear();
    grid.insert(makeEnemy(100, 100));
    grid.trim();

    expect(grid.getCellCount()).toBe(1);
    const nearby = grid.queryNearby(105, 105);
    expect(nearby).toHaveLength(1);
  });

  it('cellSize küçüldükçe sorgu sonucu azalır — ölçeklendiğini kanıtlar', () => {
    const enemies: ReturnType<typeof makeEnemy>[] = [];
    for (let i = 0; i < 500; i++) {
      const x = (i * 37) % 1000;
      const y = (i * 53) % 1000;
      enemies.push(makeEnemy(x, y));
    }

    const gridLarge = new SpatialGrid(112);
    gridLarge.insertAll(enemies);
    const resultLarge = gridLarge.queryNearby(500, 500);

    const gridSmall = new SpatialGrid(28);
    gridSmall.insertAll(enemies);
    const resultSmall = gridSmall.queryNearby(500, 500);

    // Daha küçük hücre = daha dar sorgu = daha az sonuç
    expect(resultSmall.length).toBeLessThanOrEqual(resultLarge.length);
  });

  it('negatif koordinatlar çakışma yapmaz', () => {
    const grid = new SpatialGrid(56);
    grid.insert(makeEnemy(-100, -100));
    grid.insert(makeEnemy(100, 100));

    const nearby = grid.queryNearby(-100, -100);
    expect(nearby).toHaveLength(1);
    expect(nearby[0].x).toBe(-100);
  });
});
