import { describe, it, expect, vi } from 'vitest';
import type Phaser from 'phaser';
import { Vector2 } from '../../src/math/Vector2';
import { InputManager } from '../../src/input/InputManager';
import type { InputProvider } from '../../src/input/InputProvider';
import type { InputState } from '../../src/input/InputState';
import type { PCActionBinding } from '../../src/input/PCInputState';

/**
 * Testin KENDİ eylem sözlüğü — VOL.HELL'in kümesinden bilinçli olarak farklı.
 * `InputManager` eylem adlarını bilmez; kümeyi `options.actions` ile alır.
 */
type TestAction = 'engage' | 'boost';

const TEST_ACTIONS: readonly TestAction[] = ['engage', 'boost'];

const PC_BINDINGS: Readonly<Record<TestAction, PCActionBinding>> = {
  engage: { source: 'pointerButton', button: 'left' },
  boost: { source: 'key', keyCode: 32 },
};

function makeProvider(isActive: boolean, state: InputState<TestAction>): InputProvider<TestAction> {
  return {
    get isActive() {
      return isActive;
    },
    getState: vi.fn(() => state),
    update: vi.fn(),
    destroy: vi.fn(),
  };
}

/** Enjekte edilmiş provider'larla manager kurar — gerçek Phaser'a dokunmaz. */
function makeManager(providers: InputProvider<TestAction>[]): InputManager<TestAction> {
  return new InputManager(fakeScene, {
    actions: TEST_ACTIONS,
    pcActionBindings: PC_BINDINGS,
    providers,
  });
}

/** `actions` kaydını kısa yazmak için. */
function acts(engage = false, boost = false): Record<TestAction, boolean> {
  return { engage, boost };
}

// InputManager'in Phaser.Scene parametresi yalnızca `providers` verilmediği
// durumda (gerçek TouchController/PCController kurulurken) kullanılır.
// Test için `providers` enjekte edildiğinde hiç dokunulmaz.
const fakeScene = {} as unknown as Phaser.Scene;

describe('InputManager provider seçim önceliği', () => {
  it('touch (providers[0]) aktifken diğer provider aktif olsa bile touch kazanır', () => {
    const touchState: InputState<TestAction> = {
      move: new Vector2(1, 0),
      aim: Vector2.zero(),
      actions: acts(false, false),
    };
    const pcState: InputState<TestAction> = {
      move: new Vector2(0, 1),
      aim: Vector2.zero(),
      actions: acts(true, false),
    };

    const touch = makeProvider(true, touchState);
    const pc = makeProvider(true, pcState);
    const manager = makeManager([touch, pc]);

    expect(manager.getState(Vector2.zero())).toBe(touchState);
  });

  it('touch aktif değilse ilk aktif provider (ör. PC) kazanır', () => {
    const touchState: InputState<TestAction> = {
      move: new Vector2(1, 0),
      aim: Vector2.zero(),
      actions: acts(false, false),
    };
    const pcState: InputState<TestAction> = {
      move: new Vector2(0, 1),
      aim: Vector2.zero(),
      actions: acts(true, false),
    };

    const touch = makeProvider(false, touchState);
    const pc = makeProvider(true, pcState);
    const manager = makeManager([touch, pc]);

    expect(manager.getState(Vector2.zero())).toBe(pcState);
  });

  it('hiçbir provider aktif değilse sıfır InputState döner', () => {
    const touch = makeProvider(false, {
      move: new Vector2(9, 9),
      aim: Vector2.zero(),
      actions: acts(true, false),
    });
    const pc = makeProvider(false, {
      move: new Vector2(9, 9),
      aim: Vector2.zero(),
      actions: acts(true, false),
    });
    const manager = makeManager([touch, pc]);

    const result = manager.getState(Vector2.zero());
    expect(result.move.x).toBe(0);
    expect(result.move.y).toBe(0);
    expect(result.actions).toEqual({ engage: false, boost: false });
  });

  it("update tüm provider'ların update'ini çağırır", () => {
    const touch = makeProvider(false, {
      move: Vector2.zero(),
      aim: Vector2.zero(),
      actions: acts(false, false),
    });
    const pc = makeProvider(false, {
      move: Vector2.zero(),
      aim: Vector2.zero(),
      actions: acts(false, false),
    });
    const manager = makeManager([touch, pc]);

    manager.update(16);
    expect(touch.update).toHaveBeenCalledWith(16);
    expect(pc.update).toHaveBeenCalledWith(16);
  });

  it("destroy tüm provider'ların destroy'unu çağırır", () => {
    const touch = makeProvider(false, {
      move: Vector2.zero(),
      aim: Vector2.zero(),
      actions: acts(false, false),
    });
    const pc = makeProvider(false, {
      move: Vector2.zero(),
      aim: Vector2.zero(),
      actions: acts(false, false),
    });
    const manager = makeManager([touch, pc]);

    manager.destroy();
    expect(touch.destroy).toHaveBeenCalledTimes(1);
    expect(pc.destroy).toHaveBeenCalledTimes(1);
  });
});
