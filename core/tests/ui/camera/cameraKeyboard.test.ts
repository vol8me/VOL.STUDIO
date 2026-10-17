import { afterEach, describe, expect, it, vi } from 'vitest';
import { PINCH_ZOOM, UI_SIZE } from '../../../src/constants';
import { CanvasViewportController } from '../../../src/ui/camera/CanvasViewportController';
import { PinchZoomController } from '../../../src/ui/camera/PinchZoomController';
import {
  VIEWPORT_SHORTCUTS,
  isViewportKeyTarget,
  viewportKeyAction,
} from '../../../src/ui/camera/viewportKeys';
import {
  WorldCameraController,
  type WorldCamera,
} from '../../../src/ui/camera/WorldCameraController';

/**
 * Kamera yüzeylerinin klavye/programatik eşdeğeri (UI-10.4): parmak sıkıştırma, tekerlek ve sürükleme tek yol olamaz.
 * Üç denetleyici aynı tuş eşlemesini (`viewportKeys`) paylaşır: `+`/`-` zoom, `0` sıfır, `Home` sığdır, oklar GÖRÜNÜMÜ
 * kaydırma kuralıyla taşır; Ctrl/Meta/Alt'li tuşlar tarayıcıya aittir ve yalnız yüzeyin kendisi odaktayken çalışır.
 */
const key = (target: Element, k: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

const rect = (width: number, height: number): DOMRect => ({
  x: 0,
  y: 0,
  left: 0,
  top: 0,
  right: width,
  bottom: height,
  width,
  height,
  toJSON: () => ({}),
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('viewportKeyAction', () => {
  const action = (k: string, init: KeyboardEventInit = {}) =>
    viewportKeyAction(new KeyboardEvent('keydown', { key: k, ...init }));

  it('tuş eşlemesi: zoom, sıfır, sığdır ve görünüm yönünde kaydırma', () => {
    expect(action('+')).toEqual({ kind: 'zoom', direction: 1 });
    expect(action('=')).toEqual({ kind: 'zoom', direction: 1 });
    expect(action('-')).toEqual({ kind: 'zoom', direction: -1 });
    expect(action('_')).toEqual({ kind: 'zoom', direction: -1 });
    expect(action('0')).toEqual({ kind: 'reset' });
    expect(action('Home')).toEqual({ kind: 'fit' });
    expect(action('ArrowLeft')).toEqual({ kind: 'pan', x: -1, y: 0 });
    expect(action('ArrowRight')).toEqual({ kind: 'pan', x: 1, y: 0 });
    expect(action('ArrowUp')).toEqual({ kind: 'pan', x: 0, y: -1 });
    expect(action('ArrowDown')).toEqual({ kind: 'pan', x: 0, y: 1 });
    expect(action('a')).toBeNull();
    expect(action('Enter')).toBeNull();
  });

  it("Ctrl/Meta/Alt tarayıcı kısayoludur ve IME bileşimi IME'nindir: ikisi de işlenmez", () => {
    expect(action('+', { ctrlKey: true })).toBeNull();
    expect(action('-', { metaKey: true })).toBeNull();
    expect(action('0', { altKey: true })).toBeNull();
    expect(action('+', { isComposing: true })).toBeNull();
    expect(action('ArrowLeft', { keyCode: 229 })).toBeNull();
    // Shift engel değildir: `+` çoğu düzende Shift ile yazılır.
    expect(action('+', { shiftKey: true })).toEqual({ kind: 'zoom', direction: 1 });
  });

  it('yalnız yüzeyin kendisi hedefken ve olay iptal edilmemişken işlenir', () => {
    const surface = document.createElement('div');
    const inner = document.createElement('input');
    surface.append(inner);
    document.body.append(surface);
    const seen: boolean[] = [];
    surface.addEventListener('keydown', (event) => seen.push(isViewportKeyTarget(event, surface)));
    key(surface, '+');
    key(inner, '+');
    const prevented = new KeyboardEvent('keydown', { key: '+', bubbles: true, cancelable: true });
    prevented.preventDefault();
    surface.dispatchEvent(prevented);
    expect(seen).toEqual([true, false, false]);
  });

  it('kısayol listesi ARIA adlarıyla yazılır', () => {
    expect(VIEWPORT_SHORTCUTS).toContain('Plus');
    expect(VIEWPORT_SHORTCUTS).toContain('Minus');
    expect(VIEWPORT_SHORTCUTS).not.toMatch(/[+-]/);
  });
});

describe('PinchZoomController klavye eşdeğeri', () => {
  const build = (options: ConstructorParameters<typeof PinchZoomController>[0] | null = null) => {
    const content = document.createElement('div');
    const onTransformChange = vi.fn();
    const controller = new PinchZoomController({
      content,
      onTransformChange,
      ...(options ?? {}),
    });
    document.body.append(controller.element);
    const viewport = controller.element.querySelector<HTMLElement>('.vol-pinch-zoom__viewport')!;
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(rect(400, 300));
    const status = controller.element.querySelector<HTMLElement>('[role="status"]')!;
    return { controller, viewport, status, onTransformChange };
  };

  it('odaklanabilir, adlıdır, kısayollarını bildirir; ad verilmezse çevrilmiş varsayılan kullanılır', () => {
    const { controller, viewport } = build({ content: document.createElement('div') });
    expect(controller).toBeInstanceOf(PinchZoomController);
    expect(viewport.tabIndex).toBe(0);
    expect(viewport.getAttribute('role')).toBe('group');
    expect(viewport.getAttribute('aria-label')).toBeTruthy();
    expect(viewport.getAttribute('aria-keyshortcuts')).toBe(VIEWPORT_SHORTCUTS);
    controller.destroy();

    const named = build({ content: document.createElement('div'), label: 'Harita' });
    expect(named.viewport.getAttribute('aria-label')).toBe('Harita');
    named.controller.destroy();
  });

  it('keyboard: false yüzeyi odağa sokmaz ve tuşlara tepki vermez; programatik yol çalışır', () => {
    const { controller, viewport } = build({
      content: document.createElement('div'),
      keyboard: false,
    });
    expect(viewport.hasAttribute('tabindex')).toBe(false);
    expect(viewport.hasAttribute('aria-keyshortcuts')).toBe(false);
    key(viewport, '+');
    expect(controller.getZoom()).toBe(1);
    controller.zoomBy(0.5);
    expect(controller.getZoom()).toBe(1.5);
    controller.destroy();
  });

  it('+ ve - zoom adımı kadar değiştirir, görünüm ortası sabit kalır, sınırda durur', () => {
    const { controller, viewport } = build({ content: document.createElement('div') });
    const prevented = key(viewport, '+');
    expect(prevented.defaultPrevented).toBe(true);
    expect(controller.getZoom()).toBeCloseTo(1 + PINCH_ZOOM.KEY_STEP, 10);
    // Görünüm (400×300) ortasındaki nokta zoom boyunca aynı ekranda kalır: pan = merkez × (1 − oran).
    const [panX, panY] = controller.getPan();
    expect(panX).toBeCloseTo(200 * (1 - 1.25), 5);
    expect(panY).toBeCloseTo(150 * (1 - 1.25), 5);

    key(viewport, '-');
    key(viewport, '-');
    expect(controller.getZoom()).toBeCloseTo(1 - PINCH_ZOOM.KEY_STEP, 10);
    for (let i = 0; i < 20; i += 1) key(viewport, '-');
    expect(controller.getZoom()).toBe(PINCH_ZOOM.MIN);
    for (let i = 0; i < 40; i += 1) key(viewport, '+');
    expect(controller.getZoom()).toBe(PINCH_ZOOM.MAX);
    controller.destroy();
  });

  it('oklar görünümü taşır: içerik ters yöne gider; 0 ve Home sıfırlar', () => {
    const { controller, viewport } = build({ content: document.createElement('div') });
    key(viewport, 'ArrowRight');
    expect(controller.getPan()).toEqual([-UI_SIZE.VIEWPORT_KEY_PAN_PX, 0]);
    key(viewport, 'ArrowDown');
    expect(controller.getPan()).toEqual([
      -UI_SIZE.VIEWPORT_KEY_PAN_PX,
      -UI_SIZE.VIEWPORT_KEY_PAN_PX,
    ]);
    key(viewport, 'ArrowLeft');
    key(viewport, 'ArrowUp');
    expect(controller.getPan()).toEqual([0, 0]);

    key(viewport, '+');
    key(viewport, 'ArrowRight');
    key(viewport, '0');
    expect(controller.getZoom()).toBe(1);
    expect(controller.getPan()).toEqual([0, 0]);
    key(viewport, '+');
    key(viewport, 'Home');
    expect(controller.getZoom()).toBe(1);
    controller.destroy();
  });

  it('panBy sürüklemeyle aynı yönde çalışır (pozitif dx içeriği sağa taşır)', () => {
    const { controller } = build({ content: document.createElement('div') });
    controller.panBy(30, -10, false);
    expect(controller.getPan()).toEqual([30, -10]);
    controller.destroy();
  });

  it('Ctrl+tuşlar ve içerideki odak tuşu çalmaz; olay iptal edilmez', () => {
    const { controller, viewport } = build({ content: document.createElement('div') });
    const browserZoom = key(viewport, '+', { ctrlKey: true });
    expect(browserZoom.defaultPrevented).toBe(false);
    expect(controller.getZoom()).toBe(1);

    const input = document.createElement('input');
    viewport.append(input);
    key(input, '-');
    expect(controller.getZoom()).toBe(1);
    controller.destroy();
  });

  it('klavye/programatik değişiklik duyurulur; sınırda da düzey söylenir; sürükleme duyurmaz', () => {
    const { controller, viewport, status } = build({ content: document.createElement('div') });
    expect(status.textContent).toBe('');
    key(viewport, '+');
    expect(status.textContent).toMatch(/125/);
    controller.zoomBy(-0.25);
    expect(status.textContent).toMatch(/100/);
    for (let i = 0; i < 40; i += 1) key(viewport, '+');
    expect(status.textContent).toMatch(/300/);
    controller.reset();
    expect(status.textContent).toMatch(/100/);

    status.textContent = '';
    controller.panBy(10, 10);
    expect(status.textContent).toBe('');
    controller.destroy();
  });

  it('yok edilince dinleyici kalmaz', () => {
    const { controller, viewport, onTransformChange } = build({
      content: document.createElement('div'),
    });
    controller.destroy();
    onTransformChange.mockClear();
    key(viewport, '+');
    expect(onTransformChange).not.toHaveBeenCalled();
  });
});

describe('CanvasViewportController klavye eşdeğeri', () => {
  const build = (keyboard: boolean | undefined) => {
    const element = document.createElement('div');
    document.body.append(element);
    Object.defineProperty(element, 'clientWidth', { configurable: true, value: 400 });
    Object.defineProperty(element, 'clientHeight', { configurable: true, value: 300 });
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(rect(400, 300));
    const onChange = vi.fn();
    const onCommit = vi.fn();
    const controller = new CanvasViewportController(element, {
      documentWidth: 800,
      documentHeight: 600,
      initialTransform: { offsetX: 0, offsetY: 0, zoom: 1 },
      keyboard,
      label: 'Tuval',
      onChange,
      onCommit,
    });
    return { element, controller, onChange, onCommit };
  };

  it('varsayılan kapalı: tuşlara tepki vermez, odak istemez (editör kısayolları sahibine aittir)', () => {
    const { element, controller } = build(undefined);
    expect(element.hasAttribute('tabindex')).toBe(false);
    expect(element.hasAttribute('aria-keyshortcuts')).toBe(false);
    key(element, '+');
    expect(controller.getTransform().zoom).toBe(1);
    controller.destroy();
  });

  it('açıkken odaklanır, adlanır; var olan tabindex ve role korunur', () => {
    const { element, controller } = build(true);
    expect(element.tabIndex).toBe(0);
    expect(element.getAttribute('aria-label')).toBe('Tuval');
    expect(element.getAttribute('role')).toBe('group');
    controller.destroy();

    const host = document.createElement('div');
    host.setAttribute('tabindex', '-1');
    host.setAttribute('role', 'application');
    const kept = new CanvasViewportController(host, {
      documentWidth: 10,
      documentHeight: 10,
      keyboard: true,
    });
    expect(host.getAttribute('tabindex')).toBe('-1');
    expect(host.getAttribute('role')).toBe('application');
    kept.destroy();
  });

  it('+ ve - görünüm ortasında yakınlaştırır ve kullanıcı eylemi olarak commit eder', () => {
    const { element, controller, onChange, onCommit } = build(true);
    key(element, '+');
    const zoomed = controller.getTransform();
    expect(zoomed.zoom).toBeCloseTo(1.25, 10);
    // Ortadaki belge noktası (200, 150) ekranda sabit kalır.
    expect(controller.documentToScreen({ x: 200, y: 150 })).toEqual({ x: 200, y: 150 });
    expect(onChange).toHaveBeenLastCalledWith(zoomed, 'zoom');
    expect(onCommit).toHaveBeenLastCalledWith(zoomed, 'zoom');

    key(element, '-');
    expect(controller.getTransform().zoom).toBeCloseTo(1, 10);
    controller.destroy();
  });

  it('sınırda zoom değişmez ve sahte commit üretilmez', () => {
    const { element, controller, onCommit } = build(true);
    for (let i = 0; i < 60; i += 1) key(element, '+');
    const commits = onCommit.mock.calls.length;
    expect(controller.getTransform().zoom).toBe(64);
    key(element, '+');
    expect(onCommit.mock.calls.length).toBe(commits);
    controller.destroy();
  });

  it('oklar görünümü taşır, 0 gerçek boyut, Home sığdır', () => {
    const { element, controller, onCommit } = build(true);
    key(element, 'ArrowRight');
    expect(controller.getTransform().offsetX).toBe(-UI_SIZE.VIEWPORT_KEY_PAN_PX);
    expect(onCommit).toHaveBeenLastCalledWith(controller.getTransform(), 'pan');
    key(element, 'ArrowUp');
    expect(controller.getTransform().offsetY).toBe(UI_SIZE.VIEWPORT_KEY_PAN_PX);

    key(element, 'Home');
    // 400×300 görünüm, 800×600 belge, 32 dolgu: sığdırınca zoom < 1.
    expect(controller.getTransform().zoom).toBeLessThan(1);
    key(element, '0');
    expect(controller.getTransform().zoom).toBe(1);
    controller.destroy();
  });

  it('Ctrl+tuş, içerideki alan ve yok edilmiş denetleyici tuşu işlemez', () => {
    const { element, controller } = build(true);
    expect(key(element, '+', { ctrlKey: true }).defaultPrevented).toBe(false);
    const input = document.createElement('input');
    element.append(input);
    key(input, '+');
    expect(controller.getTransform().zoom).toBe(1);
    controller.destroy();
    key(element, '+');
    expect(controller.getTransform().zoom).toBe(1);
  });

  it('panBy/zoomBy programatiktir: onChange programmatic, commit yok', () => {
    const { controller, onChange, onCommit } = build(false);
    controller.panBy(25, -5);
    expect(controller.getTransform()).toMatchObject({ offsetX: 25, offsetY: -5 });
    expect(onChange).toHaveBeenLastCalledWith(controller.getTransform(), 'programmatic');
    controller.zoomBy(2);
    expect(controller.getTransform().zoom).toBe(2);
    controller.zoomBy(Number.NaN);
    expect(controller.getTransform().zoom).toBe(2);
    expect(onCommit).not.toHaveBeenCalled();
    controller.destroy();
  });
});

describe('WorldCameraController klavye eşdeğeri', () => {
  const build = (keyboard: boolean | undefined) => {
    const element = document.createElement('canvas');
    document.body.append(element);
    element.getBoundingClientRect = () => rect(1200, 800);
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
      centerOn: vi.fn(() => camera),
    };
    const controller = new WorldCameraController(element, camera, {
      bounds: { x: 0, y: 0, width: 2400, height: 1600 },
      initialZoomFactor: 1,
      keyboard,
      label: 'Dünya',
    });
    return { element, camera, controller };
  };

  /** Yumuşatma asimptotiktir; bir kare bütün süreyi aşarsa (alpha = 1) hedefe tam oturur. */
  const settle = (controller: WorldCameraController): void => controller.update(1000);

  it('varsayılan kapalı: odak istemez, tuşa tepki vermez', () => {
    const { element, controller } = build(undefined);
    expect(element.hasAttribute('tabindex')).toBe(false);
    key(element, '+');
    settle(controller);
    expect(controller.getState().zoom).toBe(controller.getState().minZoom);
    controller.destroy();
  });

  it('açıkken odaklanır ve adlanır', () => {
    const { element, controller } = build(true);
    expect(element.tabIndex).toBe(0);
    expect(element.getAttribute('aria-label')).toBe('Dünya');
    expect(element.getAttribute('role')).toBe('group');
    expect(element.getAttribute('aria-keyshortcuts')).toBe(VIEWPORT_SHORTCUTS);
    controller.destroy();
  });

  it("+ ve - hedef zoom'u çarpar; kareler yumuşatır; sınırlar aşılmaz", () => {
    const { element, controller } = build(true);
    const min = controller.getState().minZoom;
    key(element, '+');
    settle(controller);
    expect(controller.getState().zoom).toBeCloseTo(min * 1.25, 5);
    key(element, '-');
    settle(controller);
    expect(controller.getState().zoom).toBeCloseTo(min, 5);
    key(element, '-');
    settle(controller);
    expect(controller.getState().zoom).toBeCloseTo(min, 5);
    for (let i = 0; i < 40; i += 1) key(element, '+');
    settle(controller);
    expect(controller.getState().zoom).toBeCloseTo(min * 8, 5);
    controller.destroy();
  });

  it('oklar görünümü taşır (merkez ok yönünde), 0 ve Home dünyayı sığdırır', () => {
    const { element, controller } = build(true);
    key(element, '+');
    key(element, '+');
    settle(controller);
    const before = controller.getState();
    key(element, 'ArrowRight');
    const after = controller.getState();
    expect(after.centerX).toBeGreaterThan(before.centerX);
    expect(after.centerX - before.centerX).toBeCloseTo(
      UI_SIZE.VIEWPORT_KEY_PAN_PX / before.zoom,
      5,
    );
    key(element, 'ArrowUp');
    expect(controller.getState().centerY).toBeLessThan(before.centerY);

    key(element, '0');
    expect(controller.getState().zoom).toBe(controller.getState().minZoom);
    key(element, '+');
    settle(controller);
    key(element, 'Home');
    expect(controller.getState().zoom).toBe(controller.getState().minZoom);
    controller.destroy();
  });

  it('panByScreen sürükleme yönündedir ve zoomBy geçersiz çarpanı yok sayar', () => {
    const { controller } = build(false);
    controller.zoomBy(2);
    settle(controller);
    const start = controller.getState();
    controller.panByScreen(60, 0);
    expect(controller.getState().centerX).toBeLessThan(start.centerX);
    controller.panByScreen(Number.NaN, 0);
    controller.zoomBy(0);
    controller.zoomBy(-3);
    settle(controller);
    expect(controller.getState().zoom).toBeCloseTo(start.zoom, 5);
    controller.destroy();
  });

  it('Ctrl+tuş, içerideki odak ve yok edilmiş denetleyici tuşu işlemez', () => {
    const { element, controller } = build(true);
    expect(key(element, '+', { ctrlKey: true }).defaultPrevented).toBe(false);
    settle(controller);
    expect(controller.getState().zoom).toBe(controller.getState().minZoom);
    controller.destroy();
    expect(key(element, '+').defaultPrevented).toBe(false);
  });
});
