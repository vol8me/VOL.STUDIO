import { describe, expect, it, vi } from 'vitest';
import { CanvasViewportController } from '../../src/ui/controls/CanvasViewportController';

function setupViewport(width = 400, height = 300): HTMLElement {
  const element = document.createElement('div');
  document.body.appendChild(element);
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: height });
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    x: 10,
    y: 20,
    left: 10,
    top: 20,
    right: 10 + width,
    bottom: 20 + height,
    width,
    height,
    toJSON: () => ({}),
  });
  return element;
}

describe('CanvasViewportController', () => {
  it('screen/document dönüşümleri birbirinin tersidir ve setter zoomu sınırlar', () => {
    const element = setupViewport();
    const onChange = vi.fn();
    const controller = new CanvasViewportController(element, {
      documentWidth: 100,
      documentHeight: 50,
      minZoom: 0.5,
      maxZoom: 8,
      initialTransform: { offsetX: 30, offsetY: 40, zoom: 2 },
      onChange,
    });
    const screen = controller.documentToScreen({ x: 5, y: 7 });
    expect(controller.screenToDocument(screen)).toEqual({ x: 5, y: 7 });
    controller.setTransform({ offsetX: Number.NaN, offsetY: 12, zoom: 100 });
    expect(controller.getTransform()).toEqual({ offsetX: 30, offsetY: 12, zoom: 8 });
    expect(onChange).toHaveBeenLastCalledWith(controller.getTransform(), 'programmatic');
    controller.setDocumentSize(0, Number.NaN);
    controller.destroy();
    element.remove();
  });

  it('normal sol sürüklemeyi araçlara bırakır, orta tuşla pan yapar', () => {
    const element = setupViewport();
    const onChange = vi.fn();
    const onCommit = vi.fn();
    const controller = new CanvasViewportController(element, {
      documentWidth: 64,
      documentHeight: 64,
      onChange,
      onCommit,
    });
    const toolPointerDown = vi.fn();
    element.addEventListener('pointerdown', toolPointerDown);

    element.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, button: 0, clientX: 20, clientY: 20 }),
    );
    element.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 1, clientX: 80, clientY: 90 }),
    );
    element.dispatchEvent(
      new PointerEvent('pointerup', { pointerId: 1, clientX: 80, clientY: 90 }),
    );
    expect(controller.getTransform()).toEqual({ offsetX: 0, offsetY: 0, zoom: 1 });
    expect(onChange).not.toHaveBeenCalled();
    expect(toolPointerDown).toHaveBeenCalledTimes(1);

    element.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 2, button: 1, clientX: 20, clientY: 30 }),
    );
    expect(controller.isPanning()).toBe(true);
    expect(toolPointerDown).toHaveBeenCalledTimes(1);
    element.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 2, clientX: 70, clientY: 90 }),
    );
    element.dispatchEvent(
      new PointerEvent('pointerup', { pointerId: 2, clientX: 70, clientY: 90 }),
    );
    expect(controller.getTransform()).toEqual({ offsetX: 50, offsetY: 60, zoom: 1 });
    expect(onChange).toHaveBeenCalledWith(controller.getTransform(), 'pan');
    expect(onCommit).toHaveBeenCalledWith(controller.getTransform(), 'pan');
    expect(controller.isPanning()).toBe(false);
    controller.destroy();
    element.remove();
  });

  it('Space+sol sürükleme pan yapar, editable hedefte Space ele geçirilmez', () => {
    const element = setupViewport();
    const controller = new CanvasViewportController(element, {
      documentWidth: 100,
      documentHeight: 100,
    });
    element.dispatchEvent(new PointerEvent('pointerenter'));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', cancelable: true }));
    expect(element.classList.contains('vol-canvas-viewport--pan-ready')).toBe(true);
    element.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 3, button: 0, clientX: 10, clientY: 10 }),
    );
    element.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 3, clientX: 30, clientY: 40 }),
    );
    element.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 3 }));
    expect(controller.getTransform().offsetX).toBe(0);

    element.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 9,
        button: 0,
        clientX: 10,
        clientY: 10,
      }),
    );
    element.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 9, clientX: 50, clientY: 50 }),
    );
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
    expect(controller.getTransform().offsetX).toBe(0);
    expect(controller.isPanning()).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));

    const input = document.createElement('input');
    element.appendChild(input);
    input.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }),
    );
    element.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 4, button: 0 }));
    expect(controller.isPanning()).toBe(false);
    window.dispatchEvent(new Event('blur'));
    controller.destroy();
    element.remove();
  });

  it('wheel zoom imleç altındaki belge noktasını korur ve limitte no-op olur', () => {
    const element = setupViewport();
    const onChange = vi.fn();
    const onCommit = vi.fn();
    const controller = new CanvasViewportController(element, {
      documentWidth: 100,
      documentHeight: 100,
      minZoom: 0.5,
      maxZoom: 2,
      onChange,
      onCommit,
    });
    const point = { x: 110, y: 120 };
    const before = controller.screenToDocument(point);
    element.dispatchEvent(
      new WheelEvent('wheel', {
        clientX: point.x,
        clientY: point.y,
        deltaY: -100,
        cancelable: true,
      }),
    );
    const after = controller.screenToDocument(point);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(controller.getTransform().zoom).toBeGreaterThan(1);
    expect(onChange).toHaveBeenLastCalledWith(controller.getTransform(), 'zoom');
    expect(onCommit).toHaveBeenLastCalledWith(controller.getTransform(), 'zoom');

    controller.zoomAt(point, 999);
    const calls = onChange.mock.calls.length;
    element.dispatchEvent(
      new WheelEvent('wheel', {
        clientX: point.x,
        clientY: point.y,
        deltaY: -100,
        cancelable: true,
      }),
    );
    expect(onChange).toHaveBeenCalledTimes(calls);
    element.dispatchEvent(new WheelEvent('wheel', { deltaY: 0 }));
    controller.destroy();
    element.remove();
  });

  it('fit ve gerçek boyut belgeyi ortalar; destroy bütün girdileri söker', () => {
    const element = setupViewport(200, 100);
    const onChange = vi.fn();
    const controller = new CanvasViewportController(element, {
      documentWidth: 100,
      documentHeight: 50,
      fitPadding: 0,
      onChange,
    });
    controller.fit();
    expect(controller.getTransform()).toEqual({ offsetX: 0, offsetY: 0, zoom: 2 });
    controller.actualSize();
    expect(controller.getTransform()).toEqual({ offsetX: 50, offsetY: 25, zoom: 1 });
    controller.fit(10);
    expect(controller.getTransform().zoom).toBe(1.6);

    const calls = onChange.mock.calls.length;
    controller.destroy();
    element.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(onChange).toHaveBeenCalledTimes(calls);
    expect(element.classList.contains('vol-canvas-viewport')).toBe(false);
    element.remove();
  });
});
