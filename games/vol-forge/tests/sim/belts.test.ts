import { describe, expect, it } from 'vitest';
import { BELT, ITEM, KIND, MACHINES } from '../../src/config/forge';
import { insertOnBelt, stepBelts } from '../../src/sim/belts';
import { ForgeState } from '../../src/sim/state';
import { beltViolations, place, smallSim } from '../helpers/world';

function lone(rot: number): { s: ForgeState; tile: number } {
  const s = new ForgeState(64, 64);
  const tile = s.index(10, 10);
  s.kind[tile] = KIND.conveyor;
  s.rot[tile] = rot;
  s.rebuildLists();
  return { s, tile };
}

describe('insertOnBelt', () => {
  it('kafa kafaya girişi reddeder, arkadan başa, yandan ortaya yerleştirir', () => {
    const { s, tile } = lone(0);
    expect(insertOnBelt(s, tile, ITEM.ore, 2)).toBe(false);
    expect(insertOnBelt(s, tile, ITEM.ore, 0)).toBe(true);
    expect(s.beltPos[tile * BELT.slots]).toBe(0);
    expect(insertOnBelt(s, tile, ITEM.plate, 1)).toBe(true);
    expect(s.beltPos[tile * BELT.slots]).toBe(BELT.sidePosition);
    expect(s.beltItem[tile * BELT.slots]).toBe(ITEM.plate);
    expect(s.beltCount[tile]).toBe(2);
  });

  it('aralığı korur: üst üste ikinci eşya reddedilir', () => {
    const { s, tile } = lone(0);
    expect(insertOnBelt(s, tile, ITEM.ore, 0)).toBe(true);
    expect(insertOnBelt(s, tile, ITEM.ore, 0)).toBe(false);
    expect(beltViolations(s)).toEqual([]);
  });

  it('dolu bant eşya kabul etmez', () => {
    const { s, tile } = lone(0);
    s.beltCount[tile] = BELT.slots;
    for (let slot = 0; slot < BELT.slots; slot++)
      s.beltPos[tile * BELT.slots + slot] = BELT.length - 1 - slot * BELT.spacing;
    expect(insertOnBelt(s, tile, ITEM.ore, 0)).toBe(false);
  });
});

describe('stepBelts', () => {
  it('çıkışsız bantta eşyalar sıkışır ve aralık bozulmaz', () => {
    const { s, tile } = lone(0);
    for (let step = 0; step < 400; step++) {
      insertOnBelt(s, tile, ITEM.ore, 0);
      stepBelts(s);
    }
    expect(s.beltCount[tile]).toBe(BELT.slots);
    expect(s.beltPos[tile * BELT.slots]).toBe(BELT.length - 1);
    expect(beltViolations(s)).toEqual([]);
  });

  it('chunk eşya sayısını tick sonunda verir', () => {
    const { s, tile } = lone(0);
    insertOnBelt(s, tile, ITEM.ore, 0);
    stepBelts(s);
    expect(s.chunkItems[s.chunkOfTile[tile]]).toBe(1);
  });
});

describe('matkap → bant → çekirdek', () => {
  function line(sim = smallSim()): ReturnType<typeof smallSim> {
    const s = sim.state;
    const y = 31;
    for (let x = 10; x <= 29; x++) expect(place(sim, x, y, KIND.conveyor, 0)).toBe(0);
    s.ore[s.index(9, y)] = 1;
    expect(place(sim, 9, y, KIND.drill, 0)).toBe(0);
    return sim;
  }

  it('cevheri çekirdeğe taşır; hız matkap periyodunu aşmaz', () => {
    const sim = line();
    sim.run(700);
    const delivered = sim.state.delivered[ITEM.ore];
    const ceiling = Math.floor(700 / MACHINES.drillPeriod);
    expect(delivered).toBeGreaterThan(ceiling - 12);
    expect(delivered).toBeLessThanOrEqual(ceiling);
    expect(beltViolations(sim.state)).toEqual([]);
  });

  it('hat içi işleyici iki cevheri bir levhaya çevirir', () => {
    const sim = smallSim();
    const s = sim.state;
    const y = 31;
    for (let x = 10; x <= 14; x++) place(sim, x, y, KIND.conveyor, 0);
    expect(place(sim, 15, y, KIND.smelter, 0)).toBe(0);
    for (let x = 16; x <= 29; x++) place(sim, x, y, KIND.conveyor, 0);
    s.ore[s.index(9, y)] = 1;
    place(sim, 9, y, KIND.drill, 0);
    sim.run(900);
    expect(s.delivered[ITEM.plate]).toBeGreaterThan(5);
    expect(s.delivered[ITEM.ore]).toBe(0);
    const consumed = s.delivered[ITEM.plate] * MACHINES.smelterInput;
    expect(consumed).toBeLessThanOrEqual(Math.floor(900 / MACHINES.drillPeriod));
  });

  it('aralıkta bırakılan bant çekirdeğe ulaşmaz', () => {
    const sim = smallSim();
    const s = sim.state;
    for (let x = 10; x <= 27; x++) place(sim, x, 31, KIND.conveyor, 0);
    s.ore[s.index(9, 31)] = 1;
    place(sim, 9, 31, KIND.drill, 0);
    sim.run(500);
    expect(s.delivered[ITEM.ore]).toBe(0);
    expect(beltViolations(s)).toEqual([]);
  });
});
