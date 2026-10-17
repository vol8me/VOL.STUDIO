import { describe, expect, it } from 'vitest';
import { InputStepBuffer } from '../../src/input/InputStepBuffer';
import { Vector2 } from '../../src/math/Vector2';
import type { InputState } from '../../src/input/InputState';

type Action = 'fire' | 'boost';
function state(held: boolean, pressed = false): InputState<Action> {
  return {
    move: new Vector2(1, 0),
    aim: new Vector2(0, 1),
    actions: { fire: held || pressed, boost: false },
    heldActions: { fire: held, boost: false },
    pressedActions: { fire: pressed, boost: false },
  };
}

describe('InputStepBuffer', () => {
  it('sıfır tick karelerinin basışını sonraki ticke taşır ve catch-up içinde tek tüketir', () => {
    const buffer = new InputStepBuffer<Action>(['fire', 'boost']);
    buffer.sample(state(false, true));
    buffer.sample(state(false));
    expect(buffer.consume().actions.fire).toBe(true);
    expect(buffer.consume().actions.fire).toBe(false);
  });

  it('basılı düzey catch-up boyunca kalır, basış tek tick yaşar', () => {
    const buffer = new InputStepBuffer<Action>(['fire', 'boost']);
    buffer.sample(state(true, true));
    expect(buffer.consume().pressedActions?.fire).toBe(true);
    const next = buffer.consume();
    expect(next.actions.fire).toBe(true);
    expect(next.pressedActions?.fire).toBe(false);
    buffer.sample(state(false));
    expect(buffer.consume().actions.fire).toBe(false);
  });

  it('sağlayıcı tamponlarını ve tüketilen kayıtları paylaşmaz', () => {
    const buffer = new InputStepBuffer<Action>(['fire', 'boost']);
    const raw = state(true);
    buffer.sample(raw);
    raw.move.x = 0;
    const first = buffer.consume();
    first.move.x = 7;
    expect(buffer.consume().move.x).toBe(1);
  });

  it('sıfıra düşen vektör kanalının son değerini ilk ticke taşır', () => {
    const buffer = new InputStepBuffer<Action>(['fire', 'boost']);
    buffer.sample({
      move: Vector2.zero(),
      aim: new Vector2(1, 0),
      actions: { fire: true, boost: false },
    });
    buffer.sample({
      move: Vector2.zero(),
      aim: Vector2.zero(),
      actions: { fire: false, boost: false },
    });
    const first = buffer.consume();
    expect({ x: first.aim.x, y: first.aim.y }).toEqual({ x: 1, y: 0 });
    const second = buffer.consume();
    expect({ x: second.aim.x, y: second.aim.y }).toEqual({ x: 0, y: 0 });
  });

  it('düşen vektör kanalının darbası kare başına bir kez üretilir', () => {
    const buffer = new InputStepBuffer<Action>(['fire', 'boost']);
    buffer.sample({
      move: new Vector2(1, 0),
      aim: Vector2.zero(),
      actions: { fire: false, boost: false },
    });
    for (let frame = 0; frame < 5; frame++)
      buffer.sample({
        move: Vector2.zero(),
        aim: Vector2.zero(),
        actions: { fire: false, boost: false },
      });
    expect(buffer.consume().move.length()).toBe(1);
    expect(buffer.consume().move.length()).toBe(0);
  });

  it('basılı vektör kanalı darbasız her tickte güncel değeri taşır', () => {
    const buffer = new InputStepBuffer<Action>(['fire', 'boost']);
    buffer.sample({
      move: Vector2.zero(),
      aim: new Vector2(1, 0),
      actions: { fire: false, boost: false },
    });
    buffer.sample({
      move: Vector2.zero(),
      aim: new Vector2(0, 1),
      actions: { fire: false, boost: false },
    });
    expect(buffer.consume().aim.y).toBe(1);
    expect(buffer.consume().aim.y).toBe(1);
  });

  it('reset bekleyen vektör darbasını da bırakır', () => {
    const buffer = new InputStepBuffer<Action>(['fire', 'boost']);
    buffer.sample({
      move: Vector2.zero(),
      aim: new Vector2(1, 0),
      actions: { fire: false, boost: false },
    });
    buffer.sample({
      move: Vector2.zero(),
      aim: Vector2.zero(),
      actions: { fire: false, boost: false },
    });
    buffer.reset();
    expect(buffer.consume().aim.length()).toBe(0);
  });

  it('metadata taşımayan sağlayıcıda düzeyden basış türetir; reset tüm beklemeyi bırakır', () => {
    const buffer = new InputStepBuffer<Action>(['fire', 'boost']);
    buffer.sample({
      move: Vector2.zero(),
      aim: Vector2.zero(),
      actions: { fire: true, boost: false },
    });
    expect(buffer.consume().pressedActions?.fire).toBe(true);
    buffer.reset();
    expect(buffer.consume().actions).toEqual({ fire: false, boost: false });
  });
});
