import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WorldCameraController,
  type WorldCamera,
} from '../../src/ui/controls/WorldCameraController';

function harness() {
  const element = document.createElement('canvas');
  element.width = 1200;
  element.height = 800;
  element.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 1200, height: 800, right: 1200, bottom: 800 }) as DOMRect;
  document.body.appendChild(element);

  const state = { centerX: 0, centerY: 0 };
  const camera: WorldCamera = {
    width: 1200,
    height: 800,
    zoom: 1,
    scrollX: 0,
    scrollY: 0,
    setZoom: vi.fn((zoom: number) => {
      camera.zoom = zoom;
      return camera;
    }),
    centerOn: vi.fn((x: number, y: number) => {
      state.centerX = x;
      state.centerY = y;
      camera.scrollX = x - camera.width / (2 * camera.zoom);
      camera.scrollY = y - camera.height / (2 * camera.zoom);
      return camera;
    }),
  };
  const changes: unknown[] = [];
  const controller = new WorldCameraController(element, camera, {
    bounds: { x: 0, y: 0, width: 1000, height: 1000 },
    onChange: (state) => changes.push(state),
  });
  return { element, camera, controller, state, changes };
}

function pointer(
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  pointerId: number,
  clientX: number,
  clientY: number,
  timeStamp: number,
): PointerEvent {
  const event = new PointerEvent(type, { pointerId, clientX, clientY });
  Object.defineProperty(event, 'timeStamp', { value: timeStamp });
  return event;
}

function prepareMomentumGesture(samples: readonly (readonly [number, number])[]) {
  const target = harness();
  target.element.dispatchEvent(
    new WheelEvent('wheel', { clientX: 600, clientY: 400, deltaY: -300 }),
  );
  target.controller.update(1000);
  const [firstX, firstTime] = samples[0];
  target.element.dispatchEvent(pointer('pointerdown', 1, firstX, 400, firstTime));
  for (const [x, time] of samples.slice(1)) {
    target.element.dispatchEvent(pointer('pointermove', 1, x, 400, time));
  }
  target.element.dispatchEvent(
    pointer('pointerup', 1, samples.at(-1)![0], 400, samples.at(-1)![1]),
  );
  return target;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('WorldCameraController', () => {
  it('açılışta dünyayı boşluk bırakmadan görüntü alanına kaplar ve ortalar', () => {
    const { camera, state } = harness();

    expect(camera.zoom).toBe(1.2);
    expect(state).toEqual({ centerX: 500, centerY: 500 });
  });

  it('tek işaretçi sürüklemesini zooma göre dünya hareketine çevirir', () => {
    const { element, camera, controller, state } = harness();
    element.dispatchEvent(new WheelEvent('wheel', { clientX: 600, clientY: 400, deltaY: -300 }));
    controller.update(1000);
    element.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 }),
    );
    element.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 1, clientX: 180, clientY: 140 }),
    );

    expect(state.centerX).toBeCloseTo(500 - 80 / camera.zoom, 6);
    expect(state.centerY).toBeCloseTo(500 - 40 / camera.zoom, 6);
  });

  it('tekerlek yakınlaştırmasını sınırlar ve işaretçinin altındaki dünyayı korur', () => {
    const { element, camera, controller } = harness();
    const before = controller.screenToWorld(900, 400);
    element.dispatchEvent(new WheelEvent('wheel', { clientX: 900, clientY: 400, deltaY: -300 }));
    controller.update(1000);
    const after = controller.screenToWorld(900, 400);

    expect(camera.zoom).toBeGreaterThan(0.8);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('yumuşatma sürerken de imlecin altındaki dünya noktasını sabit tutar', () => {
    const { element, controller } = harness();
    const before = controller.screenToWorld(900, 300);

    element.dispatchEvent(new WheelEvent('wheel', { clientX: 900, clientY: 300, deltaY: -120 }));
    controller.update(16);

    const during = controller.screenToWorld(900, 300);
    expect(during.x).toBeCloseTo(before.x, 6);
    expect(during.y).toBeCloseTo(before.y, 6);
  });

  it('wheel deltaMode değerlerini piksel birimine normalize eder', () => {
    const pixel = harness();
    pixel.element.dispatchEvent(
      new WheelEvent('wheel', { clientX: 600, clientY: 400, deltaY: -48, deltaMode: 0 }),
    );
    pixel.controller.update(1000);
    const pixelZoom = pixel.camera.zoom;
    pixel.controller.destroy();
    pixel.element.remove();

    const line = harness();
    line.element.dispatchEvent(
      new WheelEvent('wheel', { clientX: 600, clientY: 400, deltaY: -3, deltaMode: 1 }),
    );
    line.controller.update(1000);

    expect(line.camera.zoom).toBeCloseTo(pixelZoom, 6);
  });

  it('CSS pikseli ile kamera tamponu farklı ölçekteyken cursor anchorı korur', () => {
    const { element, controller } = harness();
    element.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400 }) as DOMRect;
    const before = controller.screenToWorld(450, 200);

    element.dispatchEvent(new WheelEvent('wheel', { clientX: 450, clientY: 200, deltaY: -120 }));
    controller.update(1000);

    expect(controller.screenToWorld(450, 200)).toEqual(before);
  });

  it('iki işaretçi uzaklaştığında aynı merkez çevresinde yakınlaşır', () => {
    const { element, camera } = harness();
    element.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 400, clientY: 400 }),
    );
    element.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 2, clientX: 800, clientY: 400 }),
    );
    element.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 2, clientX: 1000, clientY: 400 }),
    );

    expect(camera.zoom).toBeCloseTo(1.8, 6);
  });

  it('pinch hareketini olay sırasından bağımsız başlangıç anına göre hesaplar', () => {
    const leftFirst = harness();
    const rightFirst = harness();
    for (const target of [leftFirst, rightFirst]) {
      target.element.dispatchEvent(
        new PointerEvent('pointerdown', { pointerId: 1, clientX: 400, clientY: 400 }),
      );
      target.element.dispatchEvent(
        new PointerEvent('pointerdown', { pointerId: 2, clientX: 800, clientY: 400 }),
      );
    }
    leftFirst.element.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 1, clientX: 300, clientY: 400 }),
    );
    leftFirst.element.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 2, clientX: 900, clientY: 400 }),
    );
    rightFirst.element.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 2, clientX: 900, clientY: 400 }),
    );
    rightFirst.element.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 1, clientX: 300, clientY: 400 }),
    );

    expect(leftFirst.camera.zoom).toBeCloseTo(rightFirst.camera.zoom, 6);
    expect(leftFirst.state).toEqual(rightFirst.state);
  });

  it('parmak kaldırılıp yenisi eklendiğinde pinch başlangıcını sıfırlar ve sıçramaz', () => {
    const { element, camera, state } = harness();
    element.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 400, clientY: 400 }),
    );
    element.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 2, clientX: 800, clientY: 400 }),
    );
    element.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 2, clientX: 900, clientY: 400 }),
    );
    element.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2 }));
    const before = { zoom: camera.zoom, ...state };
    element.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 3, clientX: 900, clientY: 400 }),
    );
    element.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 3, clientX: 900, clientY: 400 }),
    );

    expect({ zoom: camera.zoom, ...state }).toEqual(before);
  });

  it('kamera merkezini fiziksel dünya sınırının dışına çıkarmaz', () => {
    const { element, camera, controller } = harness();
    element.dispatchEvent(new WheelEvent('wheel', { clientX: 600, clientY: 400, deltaY: -300 }));
    controller.update(1000);
    element.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 600, clientY: 400 }),
    );
    for (let x = 600; x <= 1800; x += 100) {
      element.dispatchEvent(
        new PointerEvent('pointermove', { pointerId: 1, clientX: x, clientY: 400 }),
      );
    }

    const visibleHalfWidth = camera.width / (2 * camera.zoom);
    expect(controller.getState().centerX).toBeGreaterThanOrEqual(visibleHalfWidth);
  });

  it('momentumu sınırın son bölümünde sert çarpma yerine kademeli sönümler', () => {
    const { element, controller } = harness();
    element.dispatchEvent(new WheelEvent('wheel', { clientX: 600, clientY: 400, deltaY: -600 }));
    controller.update(1000);
    element.dispatchEvent(pointer('pointerdown', 1, 500, 400, 0));
    element.dispatchEvent(pointer('pointermove', 1, 430, 400, 40));
    element.dispatchEvent(pointer('pointerup', 1, 420, 400, 44));

    const movements: number[] = [];
    for (let frame = 0; frame < 12; frame++) {
      const before = controller.getState().centerX;
      controller.update(16);
      movements.push(Math.abs(controller.getState().centerX - before));
    }

    expect(controller.getState().centerX).toBeLessThanOrEqual(1000);
    expect(movements.at(-1)!).toBeLessThan(movements[0]);
  });

  it('en uzak görünümde kaplanan ekseni kilitler, diğer ekseni sınırlar', () => {
    const { element, state } = harness();
    element.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 }),
    );
    element.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 1, clientX: 500, clientY: 500 }),
    );

    expect(state.centerX).toBe(500);
    expect(state.centerY).toBeGreaterThanOrEqual(800 / (2 * 1.2));
    expect(state.centerY).toBeLessThanOrEqual(1000 - 800 / (2 * 1.2));
  });

  it('parmak bırakıldığında kısa momentumu sürdürür ve sönümler', () => {
    const { element, controller } = harness();
    element.dispatchEvent(new WheelEvent('wheel', { clientX: 600, clientY: 400, deltaY: -300 }));
    controller.update(1000);
    element.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 400, clientY: 400 }),
    );
    element.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 1, clientX: 430, clientY: 400 }),
    );
    const releasedAt = controller.getState().centerX;
    element.dispatchEvent(pointer('pointerup', 1, 430, 400, 32));

    controller.update(16);
    const afterRelease = controller.getState().centerX;
    for (let index = 0; index < 60; index++) controller.update(16);

    expect(afterRelease).toBeLessThan(releasedAt);
    expect(controller.getState().centerX).toBeLessThanOrEqual(afterRelease);
  });

  it('pointerup olayındaki son koordinatı pan ve momentum örneğine dahil eder', () => {
    const { element, controller } = harness();
    element.dispatchEvent(new WheelEvent('wheel', { clientX: 600, clientY: 400, deltaY: -300 }));
    controller.update(1000);
    element.dispatchEvent(pointer('pointerdown', 1, 400, 400, 0));
    element.dispatchEvent(pointer('pointermove', 1, 430, 400, 20));
    const beforeRelease = controller.getState().centerX;

    element.dispatchEvent(pointer('pointerup', 1, 470, 400, 40));
    const released = controller.getState().centerX;
    controller.update(16);

    expect(released).toBeLessThan(beforeRelease);
    expect(controller.getState().centerX).toBeLessThan(released);
  });

  it('wheel easing sürerken pointerdown eski zoom hedefini iptal eder', () => {
    const { element, camera, controller } = harness();
    element.dispatchEvent(new WheelEvent('wheel', { clientX: 900, clientY: 300, deltaY: -200 }));
    controller.update(16);
    const zoomAtPointerDown = camera.zoom;

    element.dispatchEvent(pointer('pointerdown', 1, 400, 400, 20));
    controller.update(500);

    expect(camera.zoom).toBe(zoomAtPointerDown);
  });

  it('aynı hareketi 8 ms ve 16 ms örnek aralıklarında aynı bırakma hızıyla sürdürür', () => {
    const fastSamples = Array.from(
      { length: 9 },
      (_, index) => [400 + index * 8, index * 8] as const,
    );
    const regularSamples = Array.from(
      { length: 5 },
      (_, index) => [400 + index * 16, index * 16] as const,
    );
    const fast = prepareMomentumGesture(fastSamples);
    const regular = prepareMomentumGesture(regularSamples);

    const fastBefore = fast.controller.getState().centerX;
    const regularBefore = regular.controller.getState().centerX;
    fast.controller.update(16);
    regular.controller.update(16);

    expect(fastBefore - fast.controller.getState().centerX).toBeCloseTo(
      regularBefore - regular.controller.getState().centerX,
      4,
    );
  });

  it('bırakmadan önceki mikro titreşimi tek başına momentum hızı saymaz', () => {
    const { controller } = prepareMomentumGesture([
      [400, 0],
      [440, 20],
      [480, 40],
      [520, 60],
      [521, 75],
    ]);
    const releasedAt = controller.getState().centerX;

    controller.update(16);

    expect(releasedAt - controller.getState().centerX).toBeGreaterThan(8);
  });

  it('momentumun toplam seyahatini 30, 60 ve 120 FPS arasında korur', () => {
    const coastDistance = (fps: number): number => {
      const { controller } = prepareMomentumGesture([
        [400, 0],
        [420, 20],
        [440, 40],
        [450, 50],
      ]);
      const releasedAt = controller.getState().centerX;
      const delta = 1000 / fps;
      for (let frame = 0; frame < fps; frame++) controller.update(delta);
      return releasedAt - controller.getState().centerX;
    };

    const at30 = coastDistance(30);
    const at60 = coastDistance(60);
    const at120 = coastDistance(120);

    expect(at30).toBeCloseTo(at60, 4);
    expect(at60).toBeCloseTo(at120, 4);
  });

  it('resize sonrası merkezi korur ve yeni sığdırma sınırının altına inmez', () => {
    const { element, camera, controller, state } = harness();
    element.dispatchEvent(new WheelEvent('wheel', { clientX: 600, clientY: 400, deltaY: -300 }));
    controller.update(1000);
    element.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 400, clientY: 400 }),
    );
    element.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 1, clientX: 608, clientY: 192 }),
    );
    camera.width = 600;
    camera.height = 600;

    controller.refreshViewport();

    expect(state.centerX).not.toBe(500);
    expect(state.centerY).not.toBe(500);
    expect(camera.zoom).toBeGreaterThanOrEqual(0.6);
  });

  it('destroy bütün DOM dinleyicilerini bırakır', () => {
    const { element, camera, controller } = harness();
    controller.destroy();
    const zoom = camera.zoom;

    element.dispatchEvent(new WheelEvent('wheel', { clientX: 600, clientY: 400, deltaY: -300 }));

    expect(camera.zoom).toBe(zoom);
  });
});
