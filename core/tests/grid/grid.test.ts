import { describe, it, expect, vi } from 'vitest';
import { Grid, ORTHOGONAL_NEIGHBOURS, DIAGONAL_NEIGHBOURS } from '../../src/grid/Grid';

describe('Grid', () => {
  it('boyut pozitif tam sayı olmalı', () => {
    expect(() => new Grid<number>(0, 5)).toThrow(/pozitif tam sayı/);
    expect(() => new Grid<number>(3.5, 5)).toThrow(/pozitif tam sayı/);
    expect(() => new Grid<number>(-1, 5)).toThrow(/pozitif tam sayı/);
  });

  it('fill ile başlangıç değeri üretilir', () => {
    const grid = new Grid<string>(2, 2, ({ col, row }) => `${col},${row}`);
    expect(grid.get(0, 0)).toBe('0,0');
    expect(grid.get(1, 1)).toBe('1,1');
    expect(grid.filledCount).toBe(4);
  });

  it('fill verilmezse hücreler boş başlar', () => {
    const grid = new Grid<number>(3, 3);
    expect(grid.get(1, 1)).toBeUndefined();
    expect(grid.filledCount).toBe(0);
  });

  it('sınır dışı okuma İSTİSNA ATMAZ, undefined döner', () => {
    // Kenarda komşu taramak çok yaygın; her çağrıyı inBounds ile sarmak
    // çağıranı gürültüye boğardı.
    const grid = new Grid<number>(2, 2, () => 1);
    expect(grid.get(-1, 0)).toBeUndefined();
    expect(grid.get(0, 5)).toBeUndefined();
  });

  it('sınır dışı yazma SESSİZCE geçmez, false döner', () => {
    const grid = new Grid<number>(2, 2);
    expect(grid.set(5, 5, 9)).toBe(false);
    expect(grid.set(1, 1, 9)).toBe(true);
    expect(grid.get(1, 1)).toBe(9);
  });

  it('satır/sütun düz dizide doğru eşlenir (satır-sütun karışmaz)', () => {
    // Klasik hata: index = col * rows + row. 2x3 gibi kare OLMAYAN bir
    // ızgarada bu, hücreleri birbirine karıştırır.
    const grid = new Grid<string>(2, 3);
    grid.set(1, 2, 'hedef');

    expect(grid.get(1, 2)).toBe('hedef');
    expect(grid.get(0, 0)).toBeUndefined();
    expect(grid.get(1, 0)).toBeUndefined();
  });

  it('inBounds sınırları doğru kapsar', () => {
    const grid = new Grid<number>(3, 2);
    expect(grid.inBounds(0, 0)).toBe(true);
    expect(grid.inBounds(2, 1)).toBe(true);
    expect(grid.inBounds(3, 1)).toBe(false);
    expect(grid.inBounds(2, 2)).toBe(false);
  });

  it('forEach tüm hücreleri satır satır gezer', () => {
    const grid = new Grid<number>(2, 2);
    const visited: string[] = [];
    grid.forEach((_, { col, row }) => visited.push(`${col},${row}`));

    expect(visited).toEqual(['0,0', '1,0', '0,1', '1,1']);
  });

  it('forEachFilled yalnızca dolu hücreleri gezer', () => {
    const grid = new Grid<number>(2, 2);
    grid.set(1, 0, 7);
    const visit = vi.fn();
    grid.forEachFilled(visit);

    expect(visit).toHaveBeenCalledTimes(1);
    expect(visit).toHaveBeenCalledWith(7, { col: 1, row: 0 });
  });

  it('neighbours sınır dışını ELER', () => {
    const grid = new Grid<number>(3, 3);
    expect(grid.neighbours(0, 0)).toHaveLength(2); // sağ + aşağı
    expect(grid.neighbours(1, 1)).toHaveLength(4);
    expect(grid.neighbours(1, 1, DIAGONAL_NEIGHBOURS)).toHaveLength(8);
    expect(grid.neighbours(0, 0, DIAGONAL_NEIGHBOURS)).toHaveLength(3);
  });

  it('ORTHOGONAL/DIAGONAL komşuluk tanımları tutarlı', () => {
    expect(ORTHOGONAL_NEIGHBOURS).toHaveLength(4);
    expect(DIAGONAL_NEIGHBOURS).toHaveLength(8);
    for (const offset of ORTHOGONAL_NEIGHBOURS) {
      expect(DIAGONAL_NEIGHBOURS).toContainEqual(offset);
    }
  });

  it('clear tüm hücreleri boşaltır', () => {
    const grid = new Grid<number>(2, 2, () => 1);
    grid.clear();
    expect(grid.filledCount).toBe(0);
  });

  it('dünya ↔ hücre dönüşümü karşılıklı tutarlı', () => {
    const grid = new Grid<number>(4, 4);
    const world = grid.toWorld(2, 3, 32);
    expect(world).toEqual({ x: 80, y: 112 }); // merkez

    expect(grid.toCell(world.x, world.y, 32)).toEqual({ col: 2, row: 3 });
  });

  it('origin ofseti dönüşümlere uygulanır', () => {
    const grid = new Grid<number>(4, 4);
    expect(grid.toCell(105, 205, 10, 100, 200)).toEqual({ col: 0, row: 0 });
    expect(grid.toWorld(0, 0, 10, 100, 200)).toEqual({ x: 105, y: 205 });
  });

  it('negatif dünya koordinatı negatif hücreye düşer (sessizce 0a kırpılmaz)', () => {
    const grid = new Grid<number>(4, 4);
    expect(grid.toCell(-5, -5, 10)).toEqual({ col: -1, row: -1 });
  });
});
