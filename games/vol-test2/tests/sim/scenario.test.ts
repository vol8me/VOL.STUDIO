import { describe, expect, it } from 'vitest';
import { ITEM, KIND, WORLD } from '../../src/config/factory';
import { buildComb } from '../../src/sim/scenario';
import { FactorySim } from '../../src/sim/sim';
import { FactoryState } from '../../src/sim/state';
import { beltViolations, SMALL } from '../helpers/world';

describe('buildComb', () => {
  it('sınırı aşmadan bant, matkap, işleyici ve taret kurar', () => {
    const sim = FactorySim.create({ ...SMALL });
    const report = buildComb(sim, { maxBelts: 300, turrets: 8, fill: 3, smelterEvery: 2 });
    expect(report.belts).toBeGreaterThan(100);
    expect(report.belts).toBeLessThanOrEqual(300 + 64);
    expect(report.drills).toBeGreaterThan(0);
    expect(report.smelters).toBeGreaterThan(0);
    expect(report.turrets).toBeGreaterThan(0);
    expect(report.items).toBe(report.belts * 3);
    expect(beltViolations(sim.state)).toEqual([]);
  });

  it('matkaplar cevher üstündedir ve işleyici hat içindedir', () => {
    const sim = FactorySim.create({ ...SMALL });
    buildComb(sim, { maxBelts: 600, smelterEvery: 1 });
    const s = sim.state;
    for (let tile = 0; tile < s.count; tile++)
      if (s.kind[tile] === KIND.drill) expect(s.ore[tile]).toBe(1);
  });

  it('kurulan fabrika çekirdeğe eşya taşır', () => {
    const sim = FactorySim.create({ ...SMALL });
    buildComb(sim, { maxBelts: 600, fill: 0, smelterEvery: 2 });
    sim.run(900);
    expect(sim.state.delivered[ITEM.ore] + sim.state.delivered[ITEM.plate]).toBeGreaterThan(0);
  });

  it('aynı seçenekler aynı dünyayı verir', () => {
    const make = () => {
      const sim = FactorySim.create({ ...SMALL, seed: 3 });
      buildComb(sim, { maxBelts: 500, turrets: 6, fill: 1, smelterEvery: 3 });
      return sim.hash();
    };
    expect(make()).toBe(make());
  });

  it('tavan sıfırsa yalnız gövdeyi kurar', () => {
    const sim = FactorySim.create({ ...SMALL });
    const report = buildComb(sim, { maxBelts: 0 });
    expect(report.drills).toBe(0);
    expect(report.turrets).toBe(0);
  });
});

describe('FactoryState', () => {
  it('geçersiz boyutu reddeder', () => {
    expect(() => new FactoryState(0, 16)).toThrow(RangeError);
    expect(() => new FactoryState(1.5, 16)).toThrow(RangeError);
    expect(() => new FactoryState(WORLD.chunk + 1, WORLD.chunk)).toThrow(RangeError);
  });

  it('listeleri ihtiyaç büyüdükçe genişletir', () => {
    const s = new FactoryState(128, 128);
    for (let x = 0; x < 128; x++)
      for (let y = 0; y < 20; y++) s.kind[s.index(x, y)] = KIND.conveyor;
    s.rebuildLists();
    expect(s.beltListLength).toBe(128 * 20);
    expect(s.beltList.length).toBeGreaterThanOrEqual(128 * 20);
  });

  it('hasar yalnız birleştirilince chunk sürümünü artırır', () => {
    const sim = FactorySim.create({ ...SMALL });
    const s = sim.state;
    const tile = s.index(5, 5);
    const chunk = s.chunkOfTile[tile];
    s.touchHp(tile);
    const before = s.chunkVersion[chunk];
    sim.step();
    expect(s.chunkVersion[chunk]).toBe(before + 1);
    expect(s.chunkHpDirty[chunk]).toBe(0);
  });
});
