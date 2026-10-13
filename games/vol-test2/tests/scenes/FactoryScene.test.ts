import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Scene: class {
      constructor(public readonly sceneKey: string) {}
    },
  },
}));
vi.mock('@volstudio/core/i18n', () => ({ i18next: { t: (key: string) => key } }));

import { FactoryController } from '../../src/app/FactoryController';
import { FactoryHost } from '../../src/app/host';
import { VIEW } from '../../src/config/game';
import { FactoryScene } from '../../src/scenes/FactoryScene';
import { FactorySim } from '../../src/sim/sim';
import { smallSim } from '../helpers/world';

const hostInstance = new FactoryHost();

function pointer(
  type: string,
  init: { x: number; y: number; id?: number; button?: number; pointerType?: string },
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  return Object.assign(event, {
    pointerId: init.id ?? 1,
    clientX: init.x,
    clientY: init.y,
    button: init.button ?? 0,
    pointerType: init.pointerType ?? 'mouse',
  });
}

function setup() {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const camera = {
    width: 1280,
    height: 800,
    zoom: 1,
    scrollX: 0,
    scrollY: 0,
    worldView: { x: 0, y: 0, width: 1280, height: 800 },
    setBackgroundColor: vi.fn(),
    setZoom(zoom: number) {
      this.zoom = zoom;
      return this;
    },
    centerOn() {
      return this;
    },
  };
  const shutdown: (() => void)[] = [];
  const resize: (() => void)[] = [];
  const graphics = () => {
    const g: Record<string, unknown> = {};
    for (const name of [
      'clear',
      'fillStyle',
      'fillRect',
      'fillCircle',
      'lineStyle',
      'lineBetween',
      'strokeRect',
      'fillTriangle',
    ])
      g[name] = () => g;
    g.setDepth = () => g;
    g.destroy = vi.fn();
    return g;
  };
  const scene = new FactoryScene(hostInstance) as unknown as Record<string, unknown> & FactoryScene;
  Object.assign(scene, {
    cameras: { main: camera },
    scale: {
      on: (_event: string, callback: () => void) => resize.push(callback),
      off: vi.fn(),
    },
    events: { once: (_event: string, callback: () => void) => shutdown.push(callback) },
    game: { canvas },
    add: {
      graphics,
      image: () => {
        const image: Record<string, unknown> = {};
        image.setOrigin = () => image;
        image.setDepth = () => image;
        image.destroy = vi.fn();
        return image;
      },
    },
    textures: {
      createCanvas: () => ({
        context: new Proxy({}, { get: () => () => undefined, set: () => true }),
        refresh: vi.fn(),
        setFilter: vi.fn(),
      }),
      remove: vi.fn(),
    },
  });
  return { scene, canvas, camera, shutdown, resize };
}

function controllerWith(sim = smallSim()) {
  const lockstep = { sim, status: 'running', lagTicks: 4, players: 1 };
  const session = {
    lockstep,
    status: 'live',
    rttMs: 0,
    submit: vi.fn(() => new Promise(() => undefined)),
    advance: vi.fn(() => 0),
    resync: vi.fn(),
    nextCommandSeq: 1,
  };
  const controller = new FactoryController(session as never, () => {});
  const tap = vi.spyOn(controller, 'tap');
  const frame = vi.spyOn(controller, 'frame');
  return { controller, lockstep, tap, frame };
}

afterEach(() => {
  hostInstance.detach();
  document.body.replaceChildren();
});

describe('FactoryScene', () => {
  it('denetleyici yokken hiçbir şey kurmaz', () => {
    const { scene } = setup();
    scene.create();
    expect(() => scene.update(0, 16)).not.toThrow();
  });

  it('create arka plan rengini ayarlar', () => {
    const { scene, camera } = setup();
    scene.create();
    expect(camera.setBackgroundColor).toHaveBeenCalledWith('#0d1218');
  });

  it('denetleyici bağlanıp anlık görüntü gelince kareyi koşturur ve görünümü kurar', () => {
    const { scene } = setup();
    const { controller, frame } = controllerWith();
    scene.create();
    hostInstance.attach(controller);
    scene.update(0, 16);
    expect(frame).toHaveBeenCalledWith(16);
    expect((scene as unknown as { view: unknown }).view).not.toBeNull();
  });

  it('anlık görüntü gelene kadar görünüm kurmaz', () => {
    const { scene } = setup();
    const { controller, lockstep } = controllerWith();
    lockstep.sim = null as never;
    scene.create();
    hostInstance.attach(controller);
    scene.update(0, 16);
    expect((scene as unknown as { view: unknown }).view).toBeNull();
  });

  it('ekranın ortasına dokunmak dünya ortasındaki tile için komut yollar', () => {
    const { scene, canvas } = setup();
    const { controller, tap } = controllerWith();
    scene.create();
    hostInstance.attach(controller);
    scene.update(0, 16);
    canvas.dispatchEvent(pointer('pointerdown', { x: 640, y: 400 }));
    canvas.dispatchEvent(pointer('pointerup', { x: 640, y: 400 }));
    expect(tap).toHaveBeenCalledWith(32, 32, false);
  });

  it('sağ tuş ikincil dokunuş olarak iletilir', () => {
    const { scene, canvas } = setup();
    const { controller, tap } = controllerWith();
    scene.create();
    hostInstance.attach(controller);
    scene.update(0, 16);
    canvas.dispatchEvent(pointer('pointerdown', { x: 640, y: 400, button: 2 }));
    canvas.dispatchEvent(pointer('pointerup', { x: 640, y: 400, button: 2 }));
    expect(tap).toHaveBeenCalledWith(32, 32, true);
  });

  it('sürükleme dokunma sayılmaz', () => {
    const { scene, canvas } = setup();
    const { controller, tap } = controllerWith();
    scene.create();
    hostInstance.attach(controller);
    scene.update(0, 16);
    canvas.dispatchEvent(pointer('pointerdown', { x: 640, y: 400 }));
    canvas.dispatchEvent(pointer('pointermove', { x: 700, y: 400 }));
    canvas.dispatchEvent(pointer('pointerup', { x: 700, y: 400 }));
    expect(tap).not.toHaveBeenCalled();
  });

  it('fare imleci tile üzerine gelince önizleme konumunu günceller, ayrılınca temizler', () => {
    const { scene, canvas } = setup();
    const { controller } = controllerWith();
    scene.create();
    hostInstance.attach(controller);
    scene.update(0, 16);
    const view = (scene as unknown as { view: { hover: unknown } }).view;
    canvas.dispatchEvent(pointer('pointermove', { x: 640, y: 400, id: 9 }));
    expect(view.hover).toEqual({ x: 32, y: 32 });
    canvas.dispatchEvent(pointer('pointerleave', { x: 0, y: 0, id: 9 }));
    expect(view.hover).toBeNull();
  });

  it('denetleyici ayrılınca dinleyicileri ve görünümü söker; sonraki dokunma yok sayılır', () => {
    const { scene, canvas } = setup();
    const { controller, tap } = controllerWith();
    scene.create();
    hostInstance.attach(controller);
    scene.update(0, 16);
    hostInstance.detach();
    scene.update(0, 16);
    expect((scene as unknown as { view: unknown }).view).toBeNull();
    canvas.dispatchEvent(pointer('pointerdown', { x: 640, y: 400 }));
    canvas.dispatchEvent(pointer('pointerup', { x: 640, y: 400 }));
    expect(tap).not.toHaveBeenCalled();
  });

  it('dünya boyutu değişince kamera ve görünüm yeniden kurulur', () => {
    const { scene } = setup();
    const { controller, lockstep } = controllerWith();
    scene.create();
    hostInstance.attach(controller);
    scene.update(0, 16);
    const first = (scene as unknown as { view: unknown }).view;
    lockstep.sim = smallSim();
    // Aynı boyutta yeni sim: görünüm korunur (dokular yeniden çizilir, nesne değişmez).
    scene.update(0, 16);
    expect((scene as unknown as { view: unknown }).view).toBe(first);
    lockstep.sim = FactorySim.create({ width: 32, height: 32 });
    scene.update(0, 16);
    expect((scene as unknown as { view: unknown }).view).not.toBe(first);
    expect((scene as unknown as { view: unknown }).view).not.toBeNull();
  });

  it('shutdown olayı her şeyi sökər ve yeniden boyutlandırma kamerayı tazeler', () => {
    const { scene, shutdown, resize } = setup();
    const { controller } = controllerWith();
    scene.create();
    hostInstance.attach(controller);
    scene.update(0, 16);
    expect(() => resize.forEach((callback) => callback())).not.toThrow();
    shutdown.forEach((callback) => callback());
    expect((scene as unknown as { view: unknown }).view).toBeNull();
    expect((scene.scale as unknown as { off: ReturnType<typeof vi.fn> }).off).toHaveBeenCalled();
  });

  it('dokunma ayarları yapılandırmadan gelir', () => {
    expect(VIEW.tapSlopPx).toBeGreaterThan(0);
    expect(VIEW.tapMaxMs).toBeLessThan(VIEW.longPressMs);
  });
});
