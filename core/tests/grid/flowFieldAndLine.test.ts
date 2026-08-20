import { describe, it, expect } from 'vitest';
import { FlowField } from '../../src/grid/FlowField';
import { bresenhamLine, hasLineOfSight } from '../../src/grid/line';
import { DIAGONAL_NEIGHBOURS, type GridPoint } from '../../src/grid/Grid';

function walls(rows: string[]) {
  const blocked = new Set<string>();
  rows.forEach((line, row) =>
    [...line].forEach((ch, col) => {
      if (ch === '#') blocked.add(`${col},${row}`);
    }),
  );
  return {
    cols: rows[0].length,
    rows: rows.length,
    isWalkable: (p: GridPoint) => !blocked.has(`${p.col},${p.row}`),
    blocks: (p: GridPoint) => blocked.has(`${p.col},${p.row}`),
  };
}

describe('FlowField', () => {
  it('geçersiz boyut reddedilir', () => {
    expect(() => new FlowField(0, 3)).toThrow(/pozitif tam sayı/);
  });

  it('hedefin maliyeti sıfırdır, uzaklaştıkça artar', () => {
    const field = new FlowField(5, 1);
    field.compute([{ col: 0, row: 0 }]);

    expect(field.getCost(0, 0)).toBe(0);
    expect(field.getCost(1, 0)).toBe(1);
    expect(field.getCost(4, 0)).toBe(4);
  });

  it('getNext hedefe doğru komşuyu verir', () => {
    const field = new FlowField(5, 1);
    field.compute([{ col: 0, row: 0 }]);

    expect(field.getNext(3, 0)).toEqual({ col: 2, row: 0 });
    expect(field.getNext(0, 0)).toBeNull(); // hedefteyiz
  });

  it('ulaşılamayan hücre Infinity ve null döner (sessizce sıfır olmaz)', () => {
    const { cols, rows, isWalkable } = walls(['..#..', '..#..', '..#..']);
    const field = new FlowField(cols, rows);
    field.compute([{ col: 0, row: 0 }], { isWalkable });

    expect(field.getCost(4, 0)).toBe(Infinity);
    expect(field.getNext(4, 0)).toBeNull();
  });

  it('sınır dışı sorgu Infinity/null döner', () => {
    const field = new FlowField(3, 3);
    field.compute([{ col: 0, row: 0 }]);

    expect(field.getCost(-1, 0)).toBe(Infinity);
    expect(field.getNext(9, 9)).toBeNull();
  });

  it('BİRDEN FAZLA hedefte her hücre en yakınına yönelir', () => {
    const field = new FlowField(5, 1);
    field.compute([
      { col: 0, row: 0 },
      { col: 4, row: 0 },
    ]);

    expect(field.getCost(0, 0)).toBe(0);
    expect(field.getCost(4, 0)).toBe(0);
    expect(field.getNext(1, 0)).toEqual({ col: 0, row: 0 });
    expect(field.getNext(3, 0)).toEqual({ col: 4, row: 0 });
  });

  it('maliyet fonksiyonu pahalı bölgeden kaçındırır', () => {
    const expensive = new Set(['1,0', '2,0', '3,0']);
    const field = new FlowField(5, 3);
    field.compute([{ col: 0, row: 0 }], {
      cost: (p) => (expensive.has(`${p.col},${p.row}`) ? 50 : 1),
    });

    const path = field.traceFrom(4, 0);
    for (const step of path) {
      expect(expensive.has(`${step.col},${step.row}`)).toBe(false);
    }
  });

  it('traceFrom hedefe kadar bitişik yol verir', () => {
    const { cols, rows, isWalkable } = walls(['.....', '.###.', '.....']);
    const field = new FlowField(cols, rows);
    field.compute([{ col: 0, row: 0 }], { isWalkable });

    const path = field.traceFrom(4, 0);
    expect(path[0]).toEqual({ col: 4, row: 0 });
    expect(path.at(-1)).toEqual({ col: 0, row: 0 });
    for (let i = 1; i < path.length; i++) {
      const d = Math.abs(path[i].col - path[i - 1].col) + Math.abs(path[i].row - path[i - 1].row);
      expect(d).toBe(1);
    }
  });

  it('ulaşılamayan hücreden traceFrom boş döner', () => {
    const { cols, rows, isWalkable } = walls(['.#.']);
    const field = new FlowField(cols, rows);
    field.compute([{ col: 0, row: 0 }], { isWalkable });

    expect(field.traceFrom(2, 0)).toEqual([]);
  });

  it('yeniden compute eski alanı TAMAMEN siler', () => {
    const field = new FlowField(5, 1);
    field.compute([{ col: 0, row: 0 }]);
    expect(field.getCost(4, 0)).toBe(4);

    field.compute([{ col: 4, row: 0 }]);
    expect(field.getCost(4, 0)).toBe(0);
    expect(field.getCost(0, 0)).toBe(4);
  });

  it('çapraz komşulukta köşegen maliyeti √2', () => {
    const field = new FlowField(3, 3);
    field.compute([{ col: 0, row: 0 }], { neighbours: DIAGONAL_NEIGHBOURS });

    expect(field.getCost(1, 1)).toBeCloseTo(Math.SQRT2, 10);
  });

  it('geçilemez hedef yok sayılır', () => {
    const { cols, rows, isWalkable } = walls(['#..']);
    const field = new FlowField(cols, rows);
    field.compute([{ col: 0, row: 0 }], { isWalkable });

    expect(field.getCost(2, 0)).toBe(Infinity);
  });
});

describe('bresenhamLine', () => {
  it('uçları DAHİL eder', () => {
    const line = bresenhamLine({ col: 0, row: 0 }, { col: 3, row: 0 });
    expect(line[0]).toEqual({ col: 0, row: 0 });
    expect(line.at(-1)).toEqual({ col: 3, row: 0 });
    expect(line).toHaveLength(4);
  });

  it('aynı hücrede tek eleman döner', () => {
    expect(bresenhamLine({ col: 2, row: 2 }, { col: 2, row: 2 })).toEqual([{ col: 2, row: 2 }]);
  });

  it('dikey ve çapraz doğrular tutarlı', () => {
    expect(bresenhamLine({ col: 0, row: 0 }, { col: 0, row: 3 })).toHaveLength(4);
    expect(bresenhamLine({ col: 0, row: 0 }, { col: 3, row: 3 })).toHaveLength(4);
  });

  it('adımlar BİTİŞİKTİR (atlama yok)', () => {
    const line = bresenhamLine({ col: 0, row: 0 }, { col: 7, row: 3 });
    for (let i = 1; i < line.length; i++) {
      expect(Math.abs(line[i].col - line[i - 1].col)).toBeLessThanOrEqual(1);
      expect(Math.abs(line[i].row - line[i - 1].row)).toBeLessThanOrEqual(1);
    }
  });

  it('ters yön aynı hücre KÜMESİNDEN geçer', () => {
    // Kayan noktalı adımlarla yürüyen bir uygulamada iki yön farklı
    // hücrelerden geçebilir; tam sayı aritmetiği bunu engeller.
    const forward = bresenhamLine({ col: 0, row: 0 }, { col: 6, row: 4 });
    const backward = bresenhamLine({ col: 6, row: 4 }, { col: 0, row: 0 });

    const key = (p: GridPoint) => `${p.col},${p.row}`;
    expect(new Set(forward.map(key))).toEqual(new Set(backward.map(key)));
  });
});

describe('hasLineOfSight', () => {
  it('açık alanda görüş vardır', () => {
    const { blocks } = walls(['.....']);
    expect(hasLineOfSight({ col: 0, row: 0 }, { col: 4, row: 0 }, { blocks })).toBe(true);
  });

  it('araya giren engel görüşü keser', () => {
    const { blocks } = walls(['..#..']);
    expect(hasLineOfSight({ col: 0, row: 0 }, { col: 4, row: 0 }, { blocks })).toBe(false);
  });

  it('uç hücreler VARSAYILAN olarak engel sayılmaz', () => {
    // Duvarın üstünde duran ya da duvarı hedefleyen birim kör kalmamalı.
    const { blocks } = walls(['#...#']);
    expect(hasLineOfSight({ col: 0, row: 0 }, { col: 4, row: 0 }, { blocks })).toBe(true);
  });

  it('includeEndpoints ile uçlar da sayılır', () => {
    const { blocks } = walls(['#....']);
    expect(
      hasLineOfSight({ col: 0, row: 0 }, { col: 4, row: 0 }, { blocks, includeEndpoints: true }),
    ).toBe(false);
  });

  it('aynı hücrede görüş vardır', () => {
    const { blocks } = walls(['...']);
    expect(hasLineOfSight({ col: 1, row: 0 }, { col: 1, row: 0 }, { blocks })).toBe(true);
  });
});
