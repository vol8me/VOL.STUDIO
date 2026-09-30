import { describe, expect, it } from 'vitest';
import { INPUT } from '../../src/constants';
import { Vector2 } from '../../src/math/Vector2';
import { TouchStickState } from '../../src/input/TouchStickState';
import { VirtualStickSource } from '../../src/input/VirtualStickSource';

type Action = 'fire' | 'boost';
const ACTIONS: readonly Action[] = ['fire', 'boost'];

function state(options: { activatesOnTouch?: boolean } = {}) {
  const source = new VirtualStickSource();
  const sticks = new TouchStickState<Action>({
    actions: ACTIONS,
    aimStickAction: 'fire',
    aimStickActivatesOnTouch: options.activatesOnTouch,
    stickSource: source,
  });
  return { source, sticks };
}

describe('VirtualStickSource', () => {
  it('değerleri -1..1 aralığına kelepçeler, sonlu olmayanı sıfır okur', () => {
    const source = new VirtualStickSource();
    source.set('move', 2, Number.NaN);
    expect(source.write('move', Vector2.zero())).toMatchObject({ x: 1, y: 0 });
    expect(source.isHeld('move')).toBe(true);
    expect(source.hasInput).toBe(true);
    source.release('move');
    expect(source.write('move', Vector2.zero())).toMatchObject({ x: 0, y: 0 });
    expect(source.hasInput).toBe(false);
  });

  it('sabit hareket çubuğu dokunmatik sağlayıcıyı etkinleştirir ve hareket üretir', () => {
    const { source, sticks } = state();
    expect(sticks.isActive).toBe(false);
    source.set('move', 1, 0);
    expect(sticks.isActive).toBe(true);
    const move = sticks.getState().move;
    expect(move.x).toBeCloseTo(1);
    expect(move.y).toBeCloseTo(0);
  });

  it('serbest çubukla aynı ölü bölge uygulanır', () => {
    const { source, sticks } = state();
    source.set('move', INPUT.DEAD_ZONE_RATIO * 0.5, 0);
    expect(sticks.getState().move.length()).toBe(0);
  });

  it('nişan çubuğu yön ve ölü bölge ötesinde nişan eylemi (ateş) üretir', () => {
    const { source, sticks } = state();
    source.set('aim', 0, 0.05);
    expect(sticks.getState().actions.fire).toBe(false);
    source.set('aim', 0, -0.9);
    const result = sticks.getState();
    expect(result.aim.y).toBeCloseTo(-1);
    expect(result.actions.fire).toBe(true);
  });

  it('dokununca etkinleşen nişan kipinde basılı tutmak yeter', () => {
    const { source, sticks } = state({ activatesOnTouch: true });
    source.set('aim', 0, 0);
    expect(sticks.getState().actions.fire).toBe(true);
  });

  it('serbest çubuk o yarıda varken önceliklidir', () => {
    const { source, sticks } = state();
    source.set('move', 0, 1);
    sticks.onPointerDown(1, 100, 100, false);
    sticks.onPointerMove(1, 100 + INPUT.STICK_MAX_RADIUS_PX, 100);
    const move = sticks.getState().move;
    expect(move.x).toBeCloseTo(1);
    expect(move.y).toBeCloseTo(0);
  });

  it('sıfırlama sabit çubukları da bırakır', () => {
    const { source, sticks } = state();
    source.set('aim', 1, 0);
    sticks.reset();
    expect(source.hasInput).toBe(false);
    expect(sticks.isActive).toBe(false);
  });
});
