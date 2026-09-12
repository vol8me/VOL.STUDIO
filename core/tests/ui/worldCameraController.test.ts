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
  const controller = new WorldCameraController(element, camera, { worldSize: 1000 });
  return { element, camera, controller, state };
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
    const { element, state } = harness();
    element.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 }),
    );
    element.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 1, clientX: 180, clientY: 140 }),
    );

    expect(state.centerX).toBeCloseTo(400, 6);
    expect(state.centerY).toBeCloseTo(450, 6);
  });

  it('tekerlek yakınlaştırmasını sınırlar ve işaretçinin altındaki dünyayı korur', () => {
    const { element, camera, controller } = harness();
    const before = controller.screenToWorld(900, 400);
    element.dispatchEvent(new WheelEvent('wheel', { clientX: 900, clientY: 400, deltaY: -300 }));
    const after = controller.screenToWorld(900, 400);

    expect(camera.zoom).toBeGreaterThan(0.8);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
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

  it('resize sonrası merkezi korur ve yeni sığdırma sınırının altına inmez', () => {
    const { element, camera, controller, state } = harness();
    element.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 400, clientY: 400 }),
    );
    element.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 1, clientX: 608, clientY: 192 }),
    );
    camera.width = 600;
    camera.height = 600;

    controller.refreshViewport();

    expect(state).toEqual({ centerX: 240, centerY: 760 });
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
