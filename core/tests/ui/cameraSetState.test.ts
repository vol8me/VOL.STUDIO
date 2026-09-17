import { describe, expect, it, vi } from 'vitest';
import {
  WorldCameraController,
  type WorldCamera,
  type WorldCameraControllerOptions,
} from '../../src/ui/controls/WorldCameraController';

/* D2: `setState` açılış odağı gibi ANLIK geçişler içindir. */
function harness(options: Partial<WorldCameraControllerOptions> = {}) {
  const element = document.createElement('canvas');
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
      return camera;
    }),
  };
  const changes: number[] = [];
  const controller = new WorldCameraController(element, camera, {
    bounds: { x: 0, y: 0, width: 4000, height: 4000 },
    onChange: (next) => changes.push(next.zoom),
    ...options,
  });
  return { element, controller, camera, state, changes };
}

describe('D2 — WorldCameraController.setState', () => {
  it('merkez ve zoom’u uygular ve onChange çağırır', () => {
    const target = harness();
    const before = target.changes.length;

    target.controller.setState({ centerX: 1200, centerY: 900, zoom: 1.5 });

    expect(target.controller.getState().centerX).toBeCloseTo(1200, 6);
    expect(target.controller.getState().centerY).toBeCloseTo(900, 6);
    expect(target.camera.zoom).toBeCloseTo(1.5, 6);
    expect(target.changes.length).toBeGreaterThan(before);
  });

  it('NaN ve sonsuz sessizce geçmez', () => {
    const target = harness();

    expect(() => target.controller.setState({ centerX: Number.NaN })).toThrow(RangeError);
    expect(() => target.controller.setState({ zoom: Number.POSITIVE_INFINITY })).toThrow(
      RangeError,
    );
  });

  it('zoom en küçük ve en büyük sınırına kıstırılır', () => {
    const target = harness();

    target.controller.setState({ zoom: 0.000001 });
    const min = target.camera.zoom;
    target.controller.setState({ zoom: 1000 });
    const max = target.camera.zoom;

    expect(min).toBeGreaterThan(0);
    expect(max).toBeGreaterThan(min);
    expect(max).toBeLessThan(1000);
  });

  it('merkez görünür alanı dünya sınırının dışına çıkarmaz', () => {
    const target = harness();

    target.controller.setState({ centerX: -5000, centerY: 99999, zoom: 1.2 });

    const half = target.camera.width / (2 * target.camera.zoom);
    const halfY = target.camera.height / (2 * target.camera.zoom);
    expect(target.controller.getState().centerX).toBeGreaterThanOrEqual(half - 1e-6);
    expect(target.controller.getState().centerY).toBeLessThanOrEqual(4000 - halfY + 1e-6);
  });

  /* Yarım kalmış bir jest yeni durumu bozmamalı. */
  it('momentumu, pinch’i ve wheel yumuşatmasını sıfırlar', () => {
    const target = harness();
    const make = (type: string, x: number, time: number): PointerEvent => {
      const event = new PointerEvent(type, { pointerId: 1, clientX: x, clientY: 400 });
      Object.defineProperty(event, 'timeStamp', { value: time });
      return event;
    };
    target.element.dispatchEvent(
      new WheelEvent('wheel', { clientX: 600, clientY: 400, deltaY: -300 }),
    );
    target.element.dispatchEvent(make('pointerdown', 700, 0));
    target.element.dispatchEvent(make('pointermove', 600, 16));
    target.element.dispatchEvent(make('pointerup', 500, 32));

    target.controller.setState({ centerX: 2000, centerY: 2000, zoom: 1.2 });
    const settled = target.controller.getState();
    for (let frame = 0; frame < 20; frame++) target.controller.update(16);

    expect(target.controller.getState().centerX).toBeCloseTo(settled.centerX, 6);
    expect(target.controller.getState().centerY).toBeCloseTo(settled.centerY, 6);
    expect(target.camera.zoom).toBeCloseTo(settled.zoom, 6);
  });
});
