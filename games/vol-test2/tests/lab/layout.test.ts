import { describe, expect, it } from 'vitest';
import { layoutFactory, type Layout } from '../../src/lab/layout';
import { PROPS, type PropKind } from '../../src/art/props';
import { seeded } from '../../src/lab/random';

const make = (cols: number, rows: number, seed = 7, fill = 0.3): Layout =>
  layoutFactory({ cols, rows, random: seeded(seed), fill });

function occupancy(layout: Layout): { overlaps: number; outside: number; used: number } {
  const taken = new Map<string, number>();
  let outside = 0;
  for (const placement of layout.placements) {
    const [w, h] = PROPS[placement.kind].tiles;
    for (let y = placement.row; y < placement.row + h; y++)
      for (let x = placement.col; x < placement.col + w; x++) {
        if (x < 0 || y < 0 || x >= layout.cols || y >= layout.rows) outside++;
        taken.set(`${x},${y}`, (taken.get(`${x},${y}`) ?? 0) + 1);
      }
  }
  let overlaps = 0;
  for (const count of taken.values()) if (count > 1) overlaps++;
  return { overlaps, outside, used: taken.size };
}

describe('layoutFactory', () => {
  it('tohumludur: aynı girdi aynı yerleşimi, farklı tohum farklı yerleşimi verir', () => {
    expect(make(40, 24, 7)).toEqual(make(40, 24, 7));
    expect(make(40, 24, 7).placements).not.toEqual(make(40, 24, 8).placements);
  });

  it.each([
    [40, 24],
    [64, 40],
    [9, 9],
    [13, 11],
    [100, 60],
  ])('%ix%i: hiçbir yapı çakışmaz ya da alan dışına taşmaz', (cols, rows) => {
    for (const seed of [1, 2, 3]) {
      const layout = make(cols, rows, seed);
      const { overlaps, outside } = occupancy(layout);
      expect(overlaps, `tohum ${seed}`).toBe(0);
      expect(outside, `tohum ${seed}`).toBe(0);
    }
  });

  it('çekirdek ortadadır; küçük alanda çekirdek konmaz', () => {
    const layout = make(40, 24);
    const core = layout.placements.find((placement) => placement.kind === 'core');
    expect(core).toMatchObject({ col: Math.floor((40 - 3) / 2), row: Math.floor((24 - 3) / 2) });
    expect(make(8, 8).placements.some((placement) => placement.kind === 'core')).toBe(false);
  });

  it('sayımlar yerleşimle ve boş oran kullanılan karoyla uyumludur', () => {
    const layout = make(40, 24);
    const counted: Record<string, number> = {};
    for (const placement of layout.placements)
      counted[placement.kind] = (counted[placement.kind] ?? 0) + 1;
    expect(layout.counts).toEqual(counted);
    const { used } = occupancy(layout);
    expect(layout.emptyRatio).toBeCloseTo(1 - used / (40 * 24), 10);
    expect(layout.emptyRatio).toBeGreaterThanOrEqual(0);
    expect(layout.emptyRatio).toBeLessThan(1);
  });

  it('konveyör hatları doğuya (0) ya da batıya (2 çeyrek tur) bakar ve her hat tek yönlüdür', () => {
    const layout = make(40, 24);
    const lanes = new Map<number, Set<number>>();
    for (const placement of layout.placements) {
      if (placement.kind !== 'conveyor') continue;
      expect([0, 2]).toContain(placement.turns);
      const turns = lanes.get(placement.row) ?? new Set<number>();
      turns.add(placement.turns);
      lanes.set(placement.row, turns);
    }
    expect(lanes.size).toBeGreaterThanOrEqual(4);
    for (const turns of lanes.values()) expect(turns.size).toBe(1);
  });

  it('her yapı türü gerçek bir tariftir ve fazlar 0..3 sn aralığındadır', () => {
    const layout = make(64, 40);
    for (const placement of layout.placements) {
      expect(PROPS[placement.kind]).toBeDefined();
      expect(placement.phase).toBeGreaterThanOrEqual(0);
      expect(placement.phase).toBeLessThan(3);
    }
    const kinds = new Set(layout.placements.map((placement) => placement.kind));
    for (const kind of ['core', 'conveyor', 'drill', 'smelter', 'turret', 'wall', 'ore-a'])
      expect(kinds.has(kind as PropKind), kind).toBe(true);
  });

  it('doluluk oranı boş zemindeki cevher ve duvar sayısını ölçekler', () => {
    const sparse = make(64, 40, 5, 0).placements.length;
    const dense = make(64, 40, 5, 0.9).placements.length;
    expect(dense).toBeGreaterThan(sparse);
  });
});
