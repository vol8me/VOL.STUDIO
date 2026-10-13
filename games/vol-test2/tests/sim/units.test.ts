import { describe, expect, it } from 'vitest';
import {
  BUILDING,
  FLOW_RECOMPUTE_MIN_TICKS,
  ITEM,
  KIND,
  UNIT,
  UNIT_KIND,
  UNIT_POOL,
  WAVES,
} from '../../src/config/factory';
import { FactoryState } from '../../src/sim/state';
import { place, smallSim } from '../helpers/world';

const CORE_HP = BUILDING[KIND.core].hp;

describe('birim havuzu', () => {
  it('doluyken null verir, serbest yuvayı yeniden kullanır ve nesil sayar', () => {
    const s = new FactoryState(64, 64);
    const units = Array.from({ length: UNIT_POOL }, () =>
      s.allocateUnit(UNIT_KIND.crawler, 1, 1, 10),
    );
    expect(units.every((unit) => unit !== null)).toBe(true);
    expect(s.allocateUnit(UNIT_KIND.crawler, 1, 1, 10)).toBeNull();
    const victim = units[7]!;
    const generation = s.unitGen[victim.slot];
    s.releaseUnit(victim);
    s.releaseUnit(victim);
    expect(s.aliveUnits).toBe(UNIT_POOL - 1);
    const reused = s.allocateUnit(UNIT_KIND.brute, 2, 2, 5)!;
    expect(reused.slot).toBe(victim.slot);
    expect(s.unitGen[reused.slot]).toBe((generation + 1) & 0xff);
  });
});

describe('dalgalar', () => {
  it('ilk dalga gecikmeden sonra gelir ve takvim ilerler', () => {
    const sim = smallSim();
    sim.run(WAVES.firstDelay);
    expect(sim.state.wave).toBe(0);
    sim.step();
    expect(sim.state.wave).toBe(1);
    expect(sim.state.aliveUnits).toBe(WAVES.baseCount);
    expect(sim.state.nextWaveTick).toBe(WAVES.firstDelay + WAVES.period);
  });

  it('savunmasız çekirdek hasar alır; bütün birimler çekirdekte biter', () => {
    const sim = smallSim();
    sim.run(WAVES.firstDelay + 900);
    expect(sim.state.aliveUnits).toBe(0);
    expect(sim.state.coreHp).toBe(CORE_HP - WAVES.baseCount * UNIT.crawler.coreDamage);
    expect(sim.state.defeats).toBe(0);
  });

  it('çekirdek besleme yarıçapındaki taretler dalgayı durdurur', () => {
    const sim = smallSim();
    const s = sim.state;
    s.inventory[ITEM.plate] = 400;
    for (const [x, y] of [
      [26, 26],
      [36, 26],
      [26, 36],
      [36, 36],
      [31, 24],
      [31, 38],
    ] as const)
      expect(place(sim, x, y, KIND.turret, 0)).toBe(0);
    let shots = 0;
    for (let step = 0; step < WAVES.firstDelay + 900; step++) {
      sim.step();
      shots += sim.shots.length;
    }
    expect(shots).toBeGreaterThan(0);
    expect(s.coreHp).toBe(CORE_HP);
    expect(s.aliveUnits).toBe(0);
  });
});

describe('sustainUnits', () => {
  it('canlı birim sayısını hedefte tutar', () => {
    const sim = smallSim({ sustainUnits: 120 });
    sim.run(10);
    expect(sim.state.aliveUnits).toBe(120);
  });
});

describe('yenilgi', () => {
  it('çekirdek yıkılınca birimleri siler, kaynağı yarılar ve takvimi başa alır', () => {
    const sim = smallSim();
    const s = sim.state;
    s.inventory[ITEM.ore] = 101;
    s.coreHp = 10;
    s.wave = 3;
    s.allocateUnit(UNIT_KIND.crawler, 29.5, 31.5, UNIT.crawler.hp);
    s.allocateUnit(UNIT_KIND.crawler, 5.5, 5.5, UNIT.crawler.hp);
    sim.step();
    expect(s.defeats).toBe(1);
    expect(s.coreHp).toBe(CORE_HP);
    expect(s.wave).toBe(0);
    expect(s.aliveUnits).toBe(0);
    expect(s.inventory[ITEM.ore]).toBe(50);
    expect(s.nextWaveTick).toBe(0 + WAVES.firstDelay);
  });
});

describe('yol alanı', () => {
  it('katı bina sonrası yeniden hesap bekleme süresine uyar', () => {
    const sim = smallSim();
    const s = sim.state;
    sim.step();
    expect(s.flowDirty).toBe(false);
    const computedAt = s.flowTick;
    place(sim, 20, 20, KIND.wall);
    expect(s.flowDirty).toBe(true);
    sim.step();
    expect(s.flowTick).toBe(computedAt);
    sim.run(FLOW_RECOMPUTE_MIN_TICKS);
    expect(s.flowDirty).toBe(false);
    expect(s.flowTick).toBeGreaterThan(computedAt);
  });

  it('duvarın arkasında kalan bölge ulaşılamaz işaretlenir', () => {
    const sim = smallSim();
    const s = sim.state;
    s.inventory[ITEM.plate] = 1000;
    for (let y = 0; y < 64; y++) place(sim, 20, y, KIND.wall);
    sim.step();
    expect(s.flowDir[s.index(25, 31)]).toBeGreaterThanOrEqual(0);
    expect(s.flowDir[s.index(10, 31)]).toBe(-1);
  });

  it('kuşatılmış birimler duvarı kırar', () => {
    const sim = smallSim();
    const s = sim.state;
    s.inventory[ITEM.plate] = 1000;
    for (let y = 0; y < 64; y++) place(sim, 20, y, KIND.wall);
    const wall = s.index(20, 31);
    const before = s.hp[wall];
    s.allocateUnit(UNIT_KIND.brute, 19.5, 31.5, UNIT.brute.hp);
    sim.run(20);
    expect(s.hp[wall]).toBeLessThan(before);
  });
});
