import { afterEach, describe, expect, it, vi } from 'vitest';
import Phaser from 'phaser';
import { TouchController, type TouchControllerOptions } from '../../src/input/TouchController';
import { screenToCameraLayer } from '../../src/input/InputUtils';
import { Vector2 } from '../../src/math/Vector2';
import { UI_DEPTH } from '../../src/constants';

type Action = 'fire';

/**
 * Dokunmatik sağlayıcı GERÇEK Phaser `Container`/`Graphics` sınıflarıyla, en
 * küçük sahne yüzeyi üzerinde kurulur. Stick atama/clamp mantığı
 * `TouchStickState`te ayrıca test edilir; burada ölçülen şey Phaser'a bağlanan
 * kısım: bölge yönlendirmesi, kamera uzayı, işaretçi havuzu, çizim ve söküm.
 */
function setup(options: Partial<TouchControllerOptions<Action>> = {}, pointersTotal = 1) {
  const input = new Phaser.Events.EventEmitter() as Phaser.Events.EventEmitter & {
    manager?: { pointersTotal: number };
    addPointer: ReturnType<typeof vi.fn>;
  };
  input.manager = { pointersTotal };
  input.addPointer = vi.fn();
  const camera = { x: 0, y: 0, width: 800, height: 600, zoom: 1 };
  const existing = vi.fn();
  const scene = {
    sys: { queueDepthSort: () => {}, events: new Phaser.Events.EventEmitter() },
    add: { existing },
    input,
    cameras: { main: camera },
    scale: { width: 800, height: 600 },
  };
  const controller = new TouchController<Action>(scene as unknown as Phaser.Scene, {
    actions: ['fire'],
    ...options,
  });
  const graphics = (controller as unknown as { graphics: Phaser.GameObjects.Graphics }).graphics;
  instances.push(controller);
  return { controller, scene, input, camera, existing, graphics };
}

const instances: TouchController<Action>[] = [];

afterEach(() => {
  for (const controller of instances.splice(0)) {
    if (controller.scene) controller.destroy();
  }
});

let nextId = 1;
const touch = (x: number, y: number, wasTouch = true) => ({ id: nextId++, x, y, wasTouch });

describe('TouchController — kurulum', () => {
  it('sahneye kaydolur, kaydırmadan bağımsız ve arayüz derinliğinde durur', () => {
    const { controller, existing, input } = setup();

    expect(existing).toHaveBeenCalledWith(controller);
    expect(controller.scrollFactorX).toBe(0);
    expect(controller.depth).toBe(UI_DEPTH.OVERLAY);
    for (const event of ['pointerdown', 'pointermove', 'pointerup', 'pointerupoutside']) {
      expect(input.listenerCount(event)).toBe(1);
    }
  });

  it('çift joystick için işaretçi havuzunu eksik kadar büyütür, yeterliyse dokunmaz', () => {
    expect(setup({}, 1).input.addPointer).toHaveBeenCalledWith(2);
    expect(setup({}, 3).input.addPointer).not.toHaveBeenCalled();
  });
});

describe('TouchController — bölge yönlendirmesi', () => {
  it('fare olayı stick başlatmaz', () => {
    const { controller, input } = setup();
    input.emit('pointerdown', touch(100, 300, false));
    expect(controller.isActive).toBe(false);
  });

  it('sol yarı hareket, sağ yarı nişan üretir', () => {
    const { controller, input } = setup();
    const left = touch(200, 300);
    const right = touch(600, 300);

    input.emit('pointerdown', left);
    input.emit('pointerdown', right);
    input.emit('pointermove', { ...left, x: 300 });
    input.emit('pointermove', { ...right, y: 200 });

    const state = controller.getState(new Vector2(0, 0));
    expect(state.move.x).toBeGreaterThan(0);
    expect(state.aim.y).toBeLessThan(0);
    const snapshot = controller.getDebugSnapshot().providers?.touch as {
      left?: object;
      right?: object;
    };
    expect(snapshot.left).toBeDefined();
    expect(snapshot.right).toBeDefined();
  });

  it('kapalı sağ bölge o yarıdaki dokunuşu yok sayar; özel bölge onu sol stick’e verir', () => {
    const closed = setup({ rightStickRegion: null });
    closed.input.emit('pointerdown', touch(600, 300));
    expect(closed.controller.isActive).toBe(false);

    const wide = setup({
      rightStickRegion: null,
      leftStickRegion: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
    });
    wide.input.emit('pointerdown', touch(600, 300));
    expect(wide.controller.isActive).toBe(true);
    const snapshot = wide.controller.getDebugSnapshot().providers?.touch as { left?: object };
    expect(snapshot.left).toBeDefined();
  });

  it('stick tabanı kamera yakınlaştırmasıyla ÇİZİM uzayına çevrilir', () => {
    const { controller, input, camera } = setup();
    camera.zoom = 2;

    input.emit('pointerdown', touch(200, 100));

    const snapshot = controller.getDebugSnapshot().providers?.touch as {
      left: { base: { x: number; y: number } };
    };
    expect(snapshot.left.base.x).toBeCloseTo(screenToCameraLayer(200, 0, 400, 2), 6);
    expect(snapshot.left.base.y).toBeCloseTo(screenToCameraLayer(100, 0, 300, 2), 6);
    expect(snapshot.left.base.x).not.toBeCloseTo(200, 3);
  });

  it('parmak kalkınca stick bırakılır', () => {
    const { controller, input } = setup();
    const finger = touch(200, 300);
    input.emit('pointerdown', finger);
    input.emit('pointerup', finger);
    expect(controller.isActive).toBe(false);
  });
});

describe('TouchController — çizim', () => {
  it('etkin stick için taban ve başparmak çizilir; bırakılınca TEK kez temizlenir', () => {
    const { controller, input, graphics } = setup();
    const fill = vi.spyOn(graphics, 'fillCircle');
    const clear = vi.spyOn(graphics, 'clear');
    const finger = touch(200, 300);

    input.emit('pointerdown', finger);
    controller.update(16);
    expect(fill).toHaveBeenCalledTimes(2);

    input.emit('pointerup', finger);
    clear.mockClear();
    controller.update(16);
    controller.update(16);
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('dokunuşla etkinleşen nişan çubuğu halka çizer, yön verilince yön çizgisi ekler', () => {
    const { controller, input, graphics } = setup({ aimStickActivatesOnTouch: true });
    const ring = vi.spyOn(graphics, 'strokeCircle');
    const line = vi.spyOn(graphics, 'lineBetween');
    const finger = touch(600, 300);

    input.emit('pointerdown', finger);
    controller.update(16);
    expect(ring).toHaveBeenCalledTimes(1);
    expect(line).not.toHaveBeenCalled();

    input.emit('pointermove', { ...finger, x: 700 });
    controller.update(16);
    expect(line).toHaveBeenCalledTimes(1);
  });

  it('reset sticks’i bırakır ve çizimi siler', () => {
    const { controller, input, graphics } = setup();
    const clear = vi.spyOn(graphics, 'clear');
    input.emit('pointerdown', touch(200, 300));

    controller.reset();

    expect(controller.isActive).toBe(false);
    expect(clear).toHaveBeenCalled();
  });
});

describe('TouchController — söküm', () => {
  it('destroy işaretçi dinleyicilerini söker', () => {
    const { controller, input } = setup();
    controller.destroy();
    for (const event of ['pointerdown', 'pointermove', 'pointerup', 'pointerupoutside']) {
      expect(input.listenerCount(event)).toBe(0);
    }
  });

  it('sahne girdisi önceden kalkmışsa destroy fırlatmaz', () => {
    const { controller, scene } = setup();
    (scene as { input?: unknown }).input = undefined;
    expect(() => controller.destroy()).not.toThrow();
  });
});
