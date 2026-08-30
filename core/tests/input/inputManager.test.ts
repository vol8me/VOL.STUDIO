import { describe, it, expect, vi } from 'vitest';
import type Phaser from 'phaser';
import { Vector2 } from '../../src/math/Vector2';
import { InputManager } from '../../src/input/InputManager';
import type { InputProvider } from '../../src/input/InputProvider';
import type { InputState } from '../../src/input/InputState';
import type { PCActionBinding } from '../../src/input/PCInputState';
import { NO_ACTIVE_PROVIDER, singleProviderSnapshot } from '../../src/input/InputSnapshot';
import { createIdleActions } from '../../src/input/InputState';

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

/** Girdisiz bir InputState — sağlayıcı sahteleri için. */
function idleState(): InputState<TestAction> {
  return {
    move: Vector2.zero(),
    aim: Vector2.zero(),
    actions: createIdleActions(TEST_ACTIONS),
  };
}

function makeProvider(
  isActive: boolean,
  state: InputState<TestAction>,
  id = 'test',
): InputProvider<TestAction> {
  return {
    id,
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

  it('reset providerların geçici input durumunu bırakır', () => {
    const touch = makeProvider(false, idleState());
    const pc = makeProvider(false, idleState());
    touch.reset = vi.fn();
    pc.reset = vi.fn();
    const manager = makeManager([touch, pc]);

    manager.reset();

    expect(touch.reset).toHaveBeenCalledOnce();
    expect(pc.reset).toHaveBeenCalledOnce();
  });

  it("bir provider destroy hatası verse de diğer provider'ları bırakır", () => {
    const touch = makeProvider(false, idleState());
    const pc = makeProvider(false, idleState());
    vi.mocked(pc.destroy).mockImplementation(() => {
      throw new Error('PC cleanup failed');
    });
    const manager = makeManager([touch, pc]);

    expect(() => manager.destroy()).not.toThrow();
    expect(pc.destroy).toHaveBeenCalledOnce();
    expect(touch.destroy).toHaveBeenCalledOnce();
  });

  it('provider dizisinin kurulumdan sonraki dış mutasyonundan etkilenmez', () => {
    const touch = makeProvider(false, idleState());
    const providers = [touch];
    const manager = makeManager(providers);
    const lateProvider = makeProvider(true, idleState(), 'late');

    providers.push(lateProvider);
    manager.update(16);
    manager.destroy();

    expect(touch.update).toHaveBeenCalledOnce();
    expect(touch.destroy).toHaveBeenCalledOnce();
    expect(lateProvider.update).not.toHaveBeenCalled();
    expect(lateProvider.destroy).not.toHaveBeenCalled();
  });
});

describe('Diagnostics snapshot sağlayıcı kümesi AÇIK', () => {
  it("CORE'un tanımadığı bir modality (gamepad) raporlanabilir", () => {
    // Tanıdık olmayan provider id'si de diagnostics snapshot'ına yazılır.
    const gamepad: InputProvider<TestAction> = {
      id: 'gamepad',
      get isActive() {
        return true;
      },
      getState: vi.fn(() => idleState()),
      getDebugSnapshot: () =>
        singleProviderSnapshot('gamepad', {
          leftStick: { x: 0.5, y: -0.25 },
          buttons: { engage: true, boost: false },
        }),
      update: vi.fn(),
      destroy: vi.fn(),
    };

    const manager = new InputManager(fakeScene, {
      actions: TEST_ACTIONS,
      pcActionBindings: PC_BINDINGS,
      providers: [gamepad],
    });

    const snapshot = manager.getDebugSnapshot();
    expect(snapshot.activeProvider).toBe('gamepad');
    expect(snapshot.providers?.gamepad).toEqual({
      leftStick: { x: 0.5, y: -0.25 },
      buttons: { engage: true, boost: false },
    });
  });

  it('hiçbir sağlayıcı aktif değilken kimlik NO_ACTIVE_PROVIDER olur', () => {
    const idle = makeProvider(false, idleState());
    const manager = new InputManager(fakeScene, {
      actions: TEST_ACTIONS,
      pcActionBindings: PC_BINDINGS,
      providers: [idle],
    });

    const snapshot = manager.getDebugSnapshot();
    expect(snapshot.activeProvider).toBe(NO_ACTIVE_PROVIDER);
    expect(snapshot.providers).toBeUndefined();
  });

  describe('durağan nişan sinyali', () => {
    /** Nişanı olan ama "aktif" olmayan bir fare sağlayıcısı. */
    function makeRestingPc(aim: { x: number; y: number }) {
      return {
        id: 'pc',
        isActive: false,
        providesRestingState: true,
        getState: () => ({
          move: Vector2.zero(),
          aim: new Vector2(aim.x, aim.y),
          actions: createIdleActions(TEST_ACTIONS),
        }),
        update: () => {},
        destroy: () => {},
      };
    }

    function makeIdleTouch() {
      return {
        id: 'touch',
        isActive: false,
        getState: () => idleState(),
        update: () => {},
        destroy: () => {},
      };
    }

    it('hiçbir sağlayıcı aktif değilken nişan SIFIRLANMAZ', () => {
      // Regresyon: duran oyuncunun nişanı (0,0) oluyordu; nişana bağlı her
      // mekanik kendi yedeğine düşüyordu (çoklu atış hep sağa, ateş alanı
      // ayağın dibine). Fare durağanken de bir yerdedir.
      const manager = makeManager([
        makeIdleTouch() as never,
        makeRestingPc({ x: -1, y: 0 }) as never,
      ]);

      const state = manager.getState(new Vector2(0, 0));

      expect(state.aim.x).toBe(-1);
      expect(state.aim.y).toBe(0);
      manager.destroy();
    });

    it('durağan sağlayıcı yoksa gerçekten sıfır durum döner', () => {
      // Dokunmatik cihazda parmak yokken nişan diye bir şey YOKTUR; orada
      // bayat bir yön uydurmak yanlış olurdu.
      const manager = makeManager([makeIdleTouch() as never]);

      const state = manager.getState(new Vector2(0, 0));

      expect(state.aim.x).toBe(0);
      expect(state.aim.y).toBe(0);
      manager.destroy();
    });

    it('aktif sağlayıcı durağan olana göre ÖNCELİKLİDİR', () => {
      const active = {
        ...makeRestingPc({ x: 1, y: 0 }),
        id: 'active',
        isActive: true,
        providesRestingState: false,
        getState: () => ({
          move: new Vector2(1, 0),
          aim: new Vector2(0, 1),
          actions: { ...createIdleActions(TEST_ACTIONS), engage: true },
        }),
      };
      const manager = makeManager([active as never, makeRestingPc({ x: -1, y: 0 }) as never]);

      const state = manager.getState(new Vector2(0, 0));

      expect(state.aim.y).toBe(1);
      expect(state.actions.engage).toBe(true);
      manager.destroy();
    });
  });
});
