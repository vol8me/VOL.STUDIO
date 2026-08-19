import { describe, it, expect } from 'vitest';
import { findPath } from '../../src/grid/findPath';
import { DIAGONAL_NEIGHBOURS, type GridPoint } from '../../src/grid/Grid';

/** `#` geçilemez, `.` geçilebilir. Satırlar yukarıdan aşağıya. */
function parse(rows: string[]) {
  const cols = rows[0].length;
  const blocked = new Set<string>();
  rows.forEach((line, row) => {
    [...line].forEach((ch, col) => {
      if (ch === '#') blocked.add(`${col},${row}`);
    });
  });
  return {
    size: { cols, rows: rows.length },
    isWalkable: (p: GridPoint) => !blocked.has(`${p.col},${p.row}`),
  };
}

describe('findPath (A*)', () => {
  it('engelsiz ızgarada en kısa yolu bulur', () => {
    const path = findPath({ cols: 5, rows: 1 }, { col: 0, row: 0 }, { col: 4, row: 0 });
    expect(path).toHaveLength(5);
    expect(path?.[0]).toEqual({ col: 0, row: 0 });
    expect(path?.at(-1)).toEqual({ col: 4, row: 0 });
  });

  it('başlangıç hedefe eşitse tek elemanlı yol döner', () => {
    const path = findPath({ cols: 3, rows: 3 }, { col: 1, row: 1 }, { col: 1, row: 1 });
    expect(path).toEqual([{ col: 1, row: 1 }]);
  });

  it('duvarın etrafından dolaşır', () => {
    const { size, isWalkable } = parse(['.....', '.###.', '.....']);
    const path = findPath(size, { col: 0, row: 1 }, { col: 4, row: 1 }, { isWalkable });

    expect(path).not.toBeNull();
    for (const step of path!) {
      expect(isWalkable(step)).toBe(true);
    }
    // Dört yönde en kısa dolaşma: 1 dikey + 4 yatay + 1 dikey = 6 hamle,
    // yani 7 hücre (başlangıç dahil).
    expect(path).toHaveLength(7);
  });

  it('yol yoksa null döner', () => {
    const { size, isWalkable } = parse(['..#..', '..#..', '..#..']);
    expect(findPath(size, { col: 0, row: 0 }, { col: 4, row: 0 }, { isWalkable })).toBeNull();
  });

  it('başlangıç ya da hedef geçilemezse null döner', () => {
    const { size, isWalkable } = parse(['#....', '.....']);
    expect(findPath(size, { col: 0, row: 0 }, { col: 4, row: 0 }, { isWalkable })).toBeNull();
    expect(findPath(size, { col: 1, row: 0 }, { col: 0, row: 0 }, { isWalkable })).toBeNull();
  });

  it('sınır dışı koordinat null döner', () => {
    expect(findPath({ cols: 3, rows: 3 }, { col: -1, row: 0 }, { col: 2, row: 2 })).toBeNull();
    expect(findPath({ cols: 3, rows: 3 }, { col: 0, row: 0 }, { col: 9, row: 0 })).toBeNull();
  });

  it('maliyet fonksiyonu PAHALI hücreden kaçınmayı sağlar', () => {
    // Orta satır geçilebilir ama çok pahalı; algoritma uzun ama ucuz yolu
    // seçmeli.
    const expensive = new Set(['1,1', '2,1', '3,1']);
    const path = findPath(
      { cols: 5, rows: 3 },
      { col: 0, row: 1 },
      { col: 4, row: 1 },
      { cost: (p) => (expensive.has(`${p.col},${p.row}`) ? 50 : 1) },
    );

    expect(path).not.toBeNull();
    for (const step of path!) {
      expect(expensive.has(`${step.col},${step.row}`)).toBe(false);
    }
  });

  it('çapraz komşulukta köşegen yol kullanılır', () => {
    const path = findPath(
      { cols: 4, rows: 4 },
      { col: 0, row: 0 },
      { col: 3, row: 3 },
      { neighbours: DIAGONAL_NEIGHBOURS },
    );

    // Çaprazla 4 hücre; dört yönde 7 olurdu.
    expect(path).toHaveLength(4);
  });

  it('çapraz adım maliyeti √2 sayılır — yol çaprazlara çarpılmaz', () => {
    // Düz gitmek 3 adım (maliyet 3); çapraz+düz de 3 hücre ama maliyeti
    // 1.41+1+1. Aynı hücre sayısında ucuz olanı seçmeli: düz yol.
    const path = findPath(
      { cols: 4, rows: 2 },
      { col: 0, row: 0 },
      { col: 3, row: 0 },
      { neighbours: DIAGONAL_NEIGHBOURS },
    );

    expect(path).toHaveLength(4);
    for (const step of path!) {
      expect(step.row).toBe(0);
    }
  });

  it('maxNodes ulaşılamaz hedefte aramayı sınırlar', () => {
    const { size, isWalkable } = parse(['....#....', '....#....', '....#....', '....#....']);
    const path = findPath(
      size,
      { col: 0, row: 0 },
      { col: 8, row: 3 },
      {
        isWalkable,
        maxNodes: 5,
      },
    );
    expect(path).toBeNull();
  });

  it('geçersiz maliyet (0/negatif/NaN) taşıyan hücre atlanır', () => {
    // Sıfır maliyet sonsuz döngü, negatif maliyet A*'ın garantisini bozardı.
    const path = findPath(
      { cols: 3, rows: 1 },
      { col: 0, row: 0 },
      { col: 2, row: 0 },
      {
        cost: (p) => (p.col === 1 ? 0 : 1),
      },
    );
    expect(path).toBeNull();
  });

  it('yol adımları BİTİŞİKTİR (atlama yok)', () => {
    const { size, isWalkable } = parse(['.....', '.###.', '.....', '.###.', '.....']);
    const path = findPath(size, { col: 0, row: 0 }, { col: 4, row: 4 }, { isWalkable });

    expect(path).not.toBeNull();
    for (let i = 1; i < path!.length; i++) {
      const d =
        Math.abs(path![i].col - path![i - 1].col) + Math.abs(path![i].row - path![i - 1].row);
      expect(d).toBe(1);
    }
  });

  it('aynı girdi aynı yolu üretir (deterministik)', () => {
    const { size, isWalkable } = parse(['.....', '.#.#.', '.....']);
    const a = findPath(size, { col: 0, row: 0 }, { col: 4, row: 2 }, { isWalkable });
    const b = findPath(size, { col: 0, row: 0 }, { col: 4, row: 2 }, { isWalkable });
    expect(a).toEqual(b);
  });
});
