import { describe, expect, it } from 'vitest';
import { Vector2 } from '@volstudio/core';
import {
  keepDeckScenarioAlive,
  launchDeckScenario,
  parseDeckScenario,
  sampleDeckScenarioInput,
} from '@/app/DeckScenario';

const enabled = { VOL_DECK_MEASURE: '1', VOL_DECK_SCENARIO: '10' };
const bounds = { left: 100, right: 500, top: 200, bottom: 600 };
const center = { x: 300, y: 400 };

describe('DeckScenario diagnostic opt-in ayarı', () => {
  it('ölüm yalnız ölçüm senaryosunda canı geri getirir', () => {
    const calls: number[] = [];
    const player = {
      isAlive: () => false,
      getMaxHealth: () => 100,
      heal: (n: number) => calls.push(n),
    };
    expect(keepDeckScenarioAlive(null, player)).toBe(false);
    expect(calls).toEqual([]);
    expect(keepDeckScenarioAlive({ enemyCount: 20, seed: 17 }, player)).toBe(true);
    expect(calls).toEqual([100]);
    expect(
      keepDeckScenarioAlive({ enemyCount: 20, seed: 17 }, { ...player, isAlive: () => true }),
    ).toBe(false);
    expect(calls).toEqual([100]);
  });
  it('oyunu açmadan menü sahnesini kapatır; menü DOMu oyunun üstünde kalmaz', () => {
    const calls: unknown[][] = [];
    const config = { enemyCount: 10, seed: 17 };
    launchDeckScenario(
      {
        stop: (...args) => calls.push(['stop', ...args]),
        start: (...args) => calls.push(['start', ...args]),
      },
      config,
    );
    expect(calls).toEqual([
      ['stop', 'MainMenu'],
      ['start', 'Game', { deckScenario: config }],
    ]);
  });
  it('yalnız ölçüm bayrağı ve tam scenario sayısı varsa açılır', () => {
    for (const flag of [undefined, '', '0', 'true', ' 1', '01']) {
      expect(
        parseDeckScenario({ ...enabled, VOL_DECK_MEASURE: flag } as Record<string, string>),
      ).toBeNull();
    }
    for (const count of [undefined, '', '1', '15', '50', '10.0', '010', ' 10', '10 ']) {
      expect(
        parseDeckScenario({ ...enabled, VOL_DECK_SCENARIO: count } as Record<string, string>),
      ).toBeNull();
    }
  });

  it.each([0, 10, 20, 30, 40])('scenario %i ve yoksa kanonik seed kabul edilir', (enemyCount) => {
    expect(parseDeckScenario({ ...enabled, VOL_DECK_SCENARIO: String(enemyCount) })).toEqual({
      enemyCount,
      seed: 20260927,
    });
  });

  it.each(['0', '1', '20260927', '4294967295'])('uint32 seed %s kabul edilir', (seed) => {
    expect(parseDeckScenario({ ...enabled, VOL_DECK_SEED: seed })).toEqual({
      enemyCount: 10,
      seed: Number(seed),
    });
  });

  it.each([
    '',
    '-1',
    '+1',
    '1.0',
    '1e2',
    '0x10',
    'Infinity',
    'NaN',
    ' 1',
    '1 ',
    '4294967296',
    '99999999999999999999',
  ])('bozuk seed %s hiçbir scenario açmaz', (seed) => {
    expect(parseDeckScenario({ ...enabled, VOL_DECK_SEED: seed })).toBeNull();
  });
});

describe('DeckScenario simülasyon anından saf patrol girdisi', () => {
  it.each([
    [0, -1, -1],
    [5999, -1, -1],
    [6000, 1, -1],
    [12000, 1, 1],
    [18000, -1, 1],
    [24000, -1, -1],
  ])('%ims anında %20/%80 hedef köşesine normalize hareket eder', (elapsed, x, y) => {
    const state = sampleDeckScenarioInput(elapsed, bounds, center);
    expect(state.move).toBeInstanceOf(Vector2);
    expect(state.aim).toBeInstanceOf(Vector2);
    expect(state.move.x).toBeCloseTo(x * Math.SQRT1_2);
    expect(state.move.y).toBeCloseTo(y * Math.SQRT1_2);
    expect(state.move.length()).toBeCloseTo(1);
    expect(state.aim).toEqual(Vector2.zero());
    expect(state.actions).toEqual({ fire: true, dash: false });
  });

  it('aynı an farklı örnekleme geçmişinden bağımsızdır', () => {
    const expected = sampleDeckScenarioInput(12500, bounds, center);
    for (const elapsed of [100000, 0, 7000, 33, 12500, 999])
      sampleDeckScenarioInput(elapsed, bounds, { x: 200, y: 300 });
    expect(sampleDeckScenarioInput(12500, bounds, center)).toEqual(expected);
  });

  it('köşede durur; yeni 6s hedefiyle tekrar hareket eder', () => {
    const corner = { x: 180, y: 280 };
    expect(sampleDeckScenarioInput(0, bounds, corner).move).toEqual(Vector2.zero());
    expect(sampleDeckScenarioInput(0, bounds, corner).actions.fire).toBe(true);
    expect(sampleDeckScenarioInput(6000, bounds, corner).move).toEqual(new Vector2(1, 0));
  });

  it('dıştaki finite konumu bounds içine clamp eder', () => {
    expect(sampleDeckScenarioInput(6000, bounds, { x: -100, y: 400 })).toEqual(
      sampleDeckScenarioInput(6000, bounds, { x: bounds.left, y: 400 }),
    );
    expect(sampleDeckScenarioInput(12000, bounds, { x: 999, y: 999 })).toEqual(
      sampleDeckScenarioInput(12000, bounds, { x: bounds.right, y: bounds.bottom }),
    );
  });

  it('bozuk elapsed/bounds/konum bütün eylemleri güvenli idle yapar', () => {
    const cases = [
      { elapsed: NaN, rect: bounds, position: center },
      { elapsed: Infinity, rect: bounds, position: center },
      { elapsed: -1, rect: bounds, position: center },
      { elapsed: 0, rect: { ...bounds, left: NaN }, position: center },
      { elapsed: 0, rect: { ...bounds, top: Infinity }, position: center },
      { elapsed: 0, rect: { ...bounds, right: bounds.left }, position: center },
      { elapsed: 0, rect: { ...bounds, bottom: bounds.top - 1 }, position: center },
      {
        elapsed: 0,
        rect: { ...bounds, left: -Number.MAX_VALUE, right: Number.MAX_VALUE },
        position: center,
      },
      { elapsed: 0, rect: bounds, position: { x: Infinity, y: 1 } },
      { elapsed: 0, rect: bounds, position: { x: 1, y: NaN } },
    ];
    for (const test of cases) {
      expect(sampleDeckScenarioInput(test.elapsed, test.rect, test.position)).toEqual({
        move: Vector2.zero(),
        aim: Vector2.zero(),
        actions: { fire: false, dash: false },
      });
    }
  });

  it('döndürdüğü Vector2 başka örnekleri değiştirmez', () => {
    const first = sampleDeckScenarioInput(0, bounds, center);
    first.move.set(0, 0);
    first.aim.set(5, 5);
    const second = sampleDeckScenarioInput(0, bounds, center);
    expect(second.move.length()).toBeCloseTo(1);
    expect(second.aim).toEqual(Vector2.zero());
  });
});
