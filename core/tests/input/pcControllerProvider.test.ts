import { afterEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import {
  DEFAULT_MOVE_KEYS,
  PCController,
  type PCControllerOptions,
} from '../../src/input/PCController';
import { Vector2 } from '../../src/math/Vector2';

type Action = 'fire' | 'dash' | 'shield';

const SPACE = 32;

/**
 * Klavye/fare sağlayıcısı, Phaser'ın klavye eklentisi ve işaretçisi yerine
 * aynı yüzeyi taşıyan sahtelerle sürülür. Saf hesap (`computePCInputState`)
 * ayrıca test edilir; burada ölçülen şey sağlayıcının Phaser nesnelerini
 * doğru okuyup yazması ve yaşam döngüsü.
 */
function setup(options: Partial<PCControllerOptions<Action>> = {}) {
  const keys = new Map<number, { isDown: boolean; reset: ReturnType<typeof vi.fn> }>();
  const addKey = vi.fn((code: number) => {
    const key = {
      isDown: false,
      reset: vi.fn(() => {
        key.isDown = false;
      }),
    };
    keys.set(code, key);
    return key;
  });
  const pointer = {
    x: 400,
    y: 300,
    isDown: false,
    wasTouch: false,
    left: false,
    leftButtonDown() {
      return pointer.left;
    },
  };
  const getWorldPoint = vi.fn((x: number, y: number) => ({ x: x + 1000, y: y + 2000 }));
  const scene = {
    input: { keyboard: { addKey }, activePointer: pointer },
    cameras: { main: { getWorldPoint } },
  };
  const controller = new PCController<Action>(scene as unknown as Phaser.Scene, {
    actionBindings: {
      fire: { source: 'pointerButton', button: 'left' },
      dash: { source: 'key', keyCode: SPACE },
      shield: { source: 'key', keyCode: SPACE },
    },
    ...options,
  });
  instances.push(controller);
  return { controller, keys, addKey, pointer, getWorldPoint, scene };
}

const instances: PCController<Action>[] = [];

afterEach(() => {
  for (const controller of instances.splice(0)) controller.destroy();
});

describe('PCController — kurulum', () => {
  it('klavye eklentisi yoksa açık bir hatayla durur', () => {
    const scene = { input: { keyboard: null } } as unknown as Phaser.Scene;
    expect(
      () =>
        new PCController<Action>(scene, {
          actionBindings: { fire: { source: 'key', keyCode: 1 } } as never,
        }),
    ).toThrow(/Keyboard plugin/);
  });

  it('hareket tuşları varsayılan WASD ile, özel eşleme verilirse onunla kurulur', () => {
    const wasd = setup();
    expect(wasd.addKey.mock.calls.slice(0, 4).map(([code]) => code)).toEqual(
      Object.values(DEFAULT_MOVE_KEYS),
    );

    const arrows = setup({ moveKeys: { up: 38, down: 40, left: 37, right: 39 } });
    expect(arrows.addKey.mock.calls.slice(0, 4).map(([code]) => code)).toEqual([38, 40, 37, 39]);
  });

  it('aynı tuşa bağlı iki eylem tek Key nesnesini paylaşır', () => {
    const { controller, addKey, keys } = setup();

    expect(addKey.mock.calls.filter(([code]) => code === SPACE)).toHaveLength(1);
    keys.get(SPACE)!.isDown = true;

    const { actions } = controller.getState(new Vector2(0, 0));
    expect(actions.dash).toBe(true);
    expect(actions.shield).toBe(true);
  });
});

describe('PCController — durum', () => {
  it('çapraz hareket normalize edilir', () => {
    const { controller, keys } = setup();
    keys.get(DEFAULT_MOVE_KEYS.up)!.isDown = true;
    keys.get(DEFAULT_MOVE_KEYS.right)!.isDown = true;

    const { move } = controller.getState(new Vector2(0, 0));

    expect(move.x).toBeCloseTo(Math.SQRT1_2, 6);
    expect(move.y).toBeCloseTo(-Math.SQRT1_2, 6);
  });

  it('nişan, kameranın DÜNYA uzayındaki işaretçiye oyuncudan doğru hesaplanır', () => {
    const { controller, getWorldPoint } = setup();

    const { aim } = controller.getState(new Vector2(1000, 2000));

    expect(getWorldPoint).toHaveBeenCalledWith(400, 300);
    expect(aim.x).toBeCloseTo(0.8, 6);
    expect(aim.y).toBeCloseTo(0.6, 6);
  });

  it('birincil düğme eylemi fareyle basılı sayılır, miras kalan dokunuşla sayılmaz', () => {
    const { controller, pointer } = setup();
    pointer.left = true;
    expect(controller.getState(new Vector2(0, 0)).actions.fire).toBe(true);

    pointer.wasTouch = true;
    expect(controller.getState(new Vector2(0, 0)).actions.fire).toBe(false);
  });

  it('isActive tuş ya da fare basılıyken doğrudur; dokunuş basılısı sayılmaz', () => {
    const { controller, pointer, keys } = setup();
    expect(controller.isActive).toBe(false);

    pointer.isDown = true;
    pointer.wasTouch = true;
    expect(controller.isActive).toBe(false);

    pointer.wasTouch = false;
    expect(controller.isActive).toBe(true);

    pointer.isDown = false;
    keys.get(DEFAULT_MOVE_KEYS.left)!.isDown = true;
    expect(controller.isActive).toBe(true);
  });

  it('son işaretçi olayı dokunuşsa durağan nişan sinyali vermez', () => {
    const { controller, pointer } = setup();
    expect(controller.providesRestingState).toBe(true);

    pointer.wasTouch = true;
    expect(controller.providesRestingState).toBe(false);
  });

  it('tanı görüntüsü sağlayıcı kimliğini ve durumun KOPYASINI taşır', () => {
    const custom = setup({ id: 'p2' });
    custom.keys.get(DEFAULT_MOVE_KEYS.down)!.isDown = true;

    const snapshot = custom.controller.getDebugSnapshot();

    expect(snapshot.activeProvider).toBe('p2');
    const body = snapshot.providers?.p2 as { move: { down: boolean }; actions: object };
    expect(body.move.down).toBe(true);
    body.move.down = false;
    expect(custom.keys.get(DEFAULT_MOVE_KEYS.down)!.isDown).toBe(true);
    expect(setup().controller.getDebugSnapshot().activeProvider).toBe('pc');
  });
});

describe('PCController — yaşam döngüsü', () => {
  it('pencere odağı kaybolunca basılı tuşlar bırakılır', () => {
    const { keys } = setup();
    for (const key of keys.values()) key.isDown = true;

    window.dispatchEvent(new Event('blur'));

    expect([...keys.values()].every((key) => !key.isDown)).toBe(true);
    expect([...keys.values()].every((key) => key.reset.mock.calls.length === 1)).toBe(true);
  });

  it('reset tüm tuşları bırakır; update bir şey yapmaz', () => {
    const { controller, keys } = setup();
    keys.get(SPACE)!.isDown = true;

    controller.update(16);
    controller.reset();

    expect(keys.get(SPACE)!.isDown).toBe(false);
  });

  it('destroy odak dinleyicisini söker', () => {
    const { controller, keys } = setup();
    controller.destroy();
    keys.get(SPACE)!.isDown = true;

    window.dispatchEvent(new Event('blur'));

    expect(keys.get(SPACE)!.isDown).toBe(true);
  });
});
