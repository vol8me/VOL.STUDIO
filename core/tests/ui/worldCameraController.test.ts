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
    worldSize: 1000,
    onChange: (state) => changes.push(state),
  });
  return { element, camera, controller, state, changes };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('WorldCameraController', () => {
  it('açılışta kare dünyayı görüntü alanına sığdırıp ortalar', () => {
    const { camera, state } = harness();

    expect(camera.zoom).toBe(0.8);
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

    expect(camera.zoom).toBeCloseTo(1.2, 6);
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

  it('kamera merkezini seam boyunca sarıp sıçratmadan sürekli tutar', () => {
    const { element, controller } = harness();
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

    expect(controller.getState().centerX).toBeLessThan(0);
  });

  it('en uzak görünümde tek kanonik dünyayı ortalar ve panı kilitler', () => {
    const { element, controller, state } = harness();
    element.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 }),
    );
    element.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 1, clientX: 500, clientY: 500 }),
    );

    expect(state).toEqual({ centerX: 500, centerY: 500 });
    expect(controller.getState().overview).toBe(true);
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
