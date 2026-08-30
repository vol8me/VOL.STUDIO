import { describe, expect, it } from 'vitest';
import { TouchStickState } from '../../src/input/TouchStickState';

/**
 * Dokunmatik sıcak yol — kare başına allocation üretmemeli.
 *
 * `getRaw()` her çağrıda yeni `Vector2` üretiyordu ve kare başına en az dört
 * kez çağrılıyordu; mobilde bu sürekli küçük çöp ve GC duraklaması demek.
 */
describe('TouchStickState allocation davranışı', () => {
  function makeState() {
    return new TouchStickState<'fire'>({ actions: ['fire'], maxRadius: 64 });
  }

  it('parmak hareketi stick TABANINI sürüklemez', () => {
    // Yerinde mutasyona geçerken `base` ve `current` aynı nesne olsaydı
    // joystick parmakla birlikte ekranda kayardı.
    const sticks = makeState();
    sticks.onPointerDown(1, 100, 100, false);
    sticks.onPointerMove(1, 160, 100);

    const clamped = sticks.getClampedPosition(
      (sticks as unknown as { leftStick: { base: { x: number; y: number } } }).leftStick as never,
    );
    const base = (sticks as unknown as { leftStick: { base: { x: number; y: number } } }).leftStick
      .base;

    expect(base.x).toBe(100);
    expect(base.y).toBe(100);
    expect(clamped.x).toBeGreaterThan(base.x);
  });

  it('art arda okumalar aynı tamponu döndürür — yeni nesne üretmez', () => {
    const sticks = makeState();
    sticks.onPointerDown(1, 100, 100, false);
    sticks.onPointerMove(1, 130, 100);

    const stick = (sticks as unknown as { leftStick: never }).leftStick;
    const first = sticks.getClampedPosition(stick);
    const second = sticks.getClampedPosition(stick);

    expect(first).toBe(second);
  });

  it('clamp maxRadius sınırını korur', () => {
    const sticks = makeState();
    sticks.onPointerDown(1, 0, 0, false);
    sticks.onPointerMove(1, 1000, 0);

    const stick = (sticks as unknown as { leftStick: never }).leftStick;
    const clamped = sticks.getClampedPosition(stick);

    expect(clamped.x).toBeCloseTo(64, 6);
    expect(clamped.y).toBeCloseTo(0, 6);
  });

  it('iki stick birbirinin tamponunu EZMEZ', () => {
    const sticks = makeState();
    sticks.onPointerDown(1, 50, 100, false);
    sticks.onPointerDown(2, 500, 100, true);
    sticks.onPointerMove(1, 80, 100);
    sticks.onPointerMove(2, 500, 140);

    const state = sticks.getState();

    // Sol yatay, sağ dikey: tek tampon paylaşılsaydı biri diğerine dönerdi.
    expect(Math.abs(state.move.x)).toBeGreaterThan(Math.abs(state.move.y));
    expect(Math.abs(state.aim.y)).toBeGreaterThan(Math.abs(state.aim.x));
  });
});
