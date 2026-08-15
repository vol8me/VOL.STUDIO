import { describe, it, expect, vi, afterEach } from 'vitest';
import { Panel } from '../../src/ui/layout/Panel';
import { ScrollView } from '../../src/ui/layout/ScrollView';
import { Joystick } from '../../src/ui/controls/Joystick';
import { PinchZoomController } from '../../src/ui/controls/PinchZoomController';
import { ActionBar } from '../../src/ui/hud/ActionBar';

const tracked: Array<{ destroy(): void }> = [];
const destroyed = new WeakSet<{ destroy(): void }>();

function track<T extends { destroy(): void }>(instance: T): T {
  tracked.push(instance);
  return instance;
}

function destroyAndMark(instance: { destroy(): void }): void {
  if (!destroyed.has(instance)) {
    instance.destroy();
    destroyed.add(instance);
  }
}

afterEach(() => {
  while (tracked.length > 0) {
    destroyAndMark(tracked.pop()!);
  }
});

describe('Panel', () => {
  it('oluşturulur, gösterilir, gizlenir ve yok edilir', () => {
    const panel = track(new Panel());
    expect(panel.element.classList.contains('vol-panel')).toBe(true);
    expect(panel.isVisible()).toBe(false);

    panel.show();
    expect(panel.isVisible()).toBe(true);
    expect(panel.element.classList.contains('vol-panel--visible')).toBe(true);
    expect(panel.element.inert).toBe(false);

    panel.hide();
    expect(panel.isVisible()).toBe(false);
    expect(panel.element.classList.contains('vol-panel--visible')).toBe(false);
    expect(panel.element.inert).toBe(true);
  });

  it('çocuk ekler ve kaldırır', () => {
    const panel = track(new Panel());
    const a = { element: document.createElement('div') };
    const b = { element: document.createElement('div') };

    panel.add(a).add(b);
    expect(panel.element.children.length).toBe(2);
    expect(panel.element.contains(a.element)).toBe(true);
    expect(panel.element.contains(b.element)).toBe(true);

    panel.remove(a);
    expect(panel.element.children.length).toBe(1);
    expect(a.element.isConnected).toBe(false);
    expect(panel.element.contains(b.element)).toBe(true);
  });
});

describe('ScrollView', () => {
  it('oluşturulur, yön sınıfını taşır, çocuk eklenir ve temizlenir', () => {
    const vertical = track(new ScrollView({ direction: 'vertical' }));
    expect(vertical.element.classList.contains('vol-scroll-view--vertical')).toBe(true);

    const horizontal = track(new ScrollView({ direction: 'horizontal' }));
    expect(horizontal.element.classList.contains('vol-scroll-view--horizontal')).toBe(true);

    const child = { element: document.createElement('div') };
    vertical.add(child);
    const content = vertical.element.querySelector<HTMLDivElement>('.vol-scroll-view__content')!;
    expect(content.contains(child.element)).toBe(true);

    vertical.clear();
    expect(content.children.length).toBe(0);
  });

  it('scroll olayı elementten yayılır', () => {
    const scrollView = track(new ScrollView());
    const onScroll = vi.fn();
    scrollView.element.addEventListener('scroll', onScroll);
    scrollView.element.dispatchEvent(new Event('scroll', { bubbles: true }));
    expect(onScroll).toHaveBeenCalledTimes(1);
  });
});

describe('Joystick', () => {
  it('oluşturulur ve yok edilir', () => {
    const joystick = track(new Joystick());
    const base = joystick.element.querySelector<HTMLDivElement>('.vol-joystick__base')!;
    const thumb = joystick.element.querySelector<HTMLDivElement>('.vol-joystick__thumb')!;
    expect(base).not.toBeNull();
    expect(thumb).not.toBeNull();
    expect(base.contains(thumb)).toBe(true);
  });

  it('pointer sürükleme normalize vektör çıktısı verir ve bırakınca sıfırlar', () => {
    const onMove = vi.fn();
    const onRelease = vi.fn();
    const joystick = track(new Joystick({ onMove, onRelease }));
    const base = joystick.element.querySelector<HTMLDivElement>('.vol-joystick__base')!;
    const thumb = joystick.element.querySelector<HTMLDivElement>('.vol-joystick__thumb')!;
    const pointerId = 7;

    base.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId,
        clientX: 0,
        clientY: 0,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(onMove).toHaveBeenCalledWith({ x: 0, y: 0 });

    window.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId,
        clientX: 56,
        clientY: 0,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(onMove).toHaveBeenCalledTimes(2);
    const vector = onMove.mock.calls.at(-1)![0] as { x: number; y: number };
    expect(vector.x).toBeCloseTo(1);
    expect(vector.y).toBeCloseTo(0);
    expect(thumb.style.transform).not.toBe('translate(-50%, -50%)');

    window.dispatchEvent(
      new PointerEvent('pointerup', {
        pointerId,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(onRelease).toHaveBeenCalled();
    expect(thumb.style.transform).toBe('translate(-50%, -50%)');

    onMove.mockClear();
    window.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId,
        clientX: 100,
        clientY: 0,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(onMove).not.toHaveBeenCalled();
  });

  it('ölü bölge içindeki hareketler sıfır vektör döndürür', () => {
    const onMove = vi.fn();
    const joystick = track(new Joystick({ onMove, deadZone: 0.15 }));
    const base = joystick.element.querySelector<HTMLDivElement>('.vol-joystick__base')!;
    const pointerId = 2;

    base.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId,
        clientX: 0,
        clientY: 0,
        bubbles: true,
        cancelable: true,
      }),
    );
    onMove.mockClear();

    window.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId,
        clientX: 4,
        clientY: 0,
        bubbles: true,
        cancelable: true,
      }),
    );
    const vector = onMove.mock.calls.at(-1)![0] as { x: number; y: number };
    expect(vector.x).toBe(0);
    expect(vector.y).toBe(0);
  });

  it('ilk pointer aktifken ikinci pointer dikkate alınmaz', () => {
    const onMove = vi.fn();
    const joystick = track(new Joystick({ onMove }));
    const base = joystick.element.querySelector<HTMLDivElement>('.vol-joystick__base')!;

    const pointerA = 3;
    const pointerB = 4;

    base.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: pointerA,
        clientX: 0,
        clientY: 0,
        bubbles: true,
        cancelable: true,
      }),
    );
    onMove.mockClear();

    base.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: pointerB,
        clientX: 56,
        clientY: 0,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(onMove).not.toHaveBeenCalled();

    window.dispatchEvent(
      new PointerEvent('pointerup', {
        pointerId: pointerA,
        bubbles: true,
        cancelable: true,
      }),
    );

    onMove.mockClear();
    base.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: pointerB,
        clientX: 0,
        clientY: 0,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(onMove).toHaveBeenCalled();
  });

  it('destroy sürükleme ortasında çağrılırsa tüm pointer listenerlarını temizler', () => {
    const joystick = track(new Joystick());
    const base = joystick.element.querySelector<HTMLDivElement>('.vol-joystick__base')!;

    // Global (window) listener'lar yalnızca aktif bir sürükleme sırasında
    // bağlıdır (bkz. "Y6" testleri yukarıda) — destroy()'un onları gerçekten
    // kaldırdığını görmek için önce bir sürükleme başlatılmalı; aksi halde
    // hiç bağlanmamış bir listener'ın "kaldırıldığını" doğrulamak anlamsız.
    base.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 0,
        clientY: 0,
        bubbles: true,
        cancelable: true,
      }),
    );

    const removeBase = vi.spyOn(base, 'removeEventListener');
    const removeWindow = vi.spyOn(window, 'removeEventListener');

    destroyAndMark(joystick);

    expect(removeBase).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(removeWindow).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(removeWindow).toHaveBeenCalledWith('pointerup', expect.any(Function));
    expect(removeWindow).toHaveBeenCalledWith('pointercancel', expect.any(Function));
  });
});

describe('PinchZoomController', () => {
  it('oluşturulur ve içeriği sarar', () => {
    const content = document.createElement('div');
    content.textContent = 'içerik';
    const controller = track(new PinchZoomController({ content }));
    expect(controller.getZoom()).toBe(1);
    const canvas = controller.element.querySelector<HTMLDivElement>('.vol-pinch-zoom__canvas')!;
    expect(canvas.contains(content)).toBe(true);
  });

  it('tekerlekle zoom değişir', () => {
    const controller = track(new PinchZoomController({ content: document.createElement('div') }));
    const viewport = controller.element.querySelector<HTMLDivElement>('.vol-pinch-zoom__viewport')!;
    expect(controller.getZoom()).toBe(1);

    viewport.dispatchEvent(
      new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }),
    );
    expect(controller.getZoom()).toBe(0.9);

    viewport.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }),
    );
    expect(controller.getZoom()).toBe(1);
  });

  it('tek pointer ile pan hareketi durumu değiştirir', () => {
    const onTransform = vi.fn();
    const controller = track(
      new PinchZoomController({
        content: document.createElement('div'),
        onTransformChange: onTransform,
      }),
    );
    const viewport = controller.element.querySelector<HTMLDivElement>('.vol-pinch-zoom__viewport')!;
    const pointerId = 5;

    viewport.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId,
        clientX: 0,
        clientY: 0,
        bubbles: true,
        cancelable: true,
      }),
    );
    viewport.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId,
        clientX: 7,
        clientY: 3,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(controller.getZoom()).toBe(1);
    expect(onTransform).toHaveBeenLastCalledWith(1, 7, 3);

    viewport.dispatchEvent(
      new PointerEvent('pointerup', {
        pointerId,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(controller.getZoom()).toBe(1);
  });

  it('iki parmak ile pinch zoom yapar', () => {
    const onTransform = vi.fn();
    const controller = track(
      new PinchZoomController({
        content: document.createElement('div'),
        onTransformChange: onTransform,
      }),
    );
    const viewport = controller.element.querySelector<HTMLDivElement>('.vol-pinch-zoom__viewport')!;

    viewport.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 0,
        clientY: 0,
        bubbles: true,
        cancelable: true,
      }),
    );
    viewport.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 2,
        clientX: 10,
        clientY: 0,
        bubbles: true,
        cancelable: true,
      }),
    );
    viewport.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: 2,
        clientX: 20,
        clientY: 0,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(controller.getZoom()).toBe(2);
    expect(onTransform).toHaveBeenLastCalledWith(2, 0, 0);

    viewport.dispatchEvent(
      new PointerEvent('pointerup', {
        pointerId: 2,
        bubbles: true,
        cancelable: true,
      }),
    );
    viewport.dispatchEvent(
      new PointerEvent('pointerup', {
        pointerId: 1,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(controller.getZoom()).toBe(2);
  });

  it('pinch sonrası kalan pointer ile pan devam eder', () => {
    const onTransform = vi.fn();
    const controller = track(
      new PinchZoomController({
        content: document.createElement('div'),
        onTransformChange: onTransform,
      }),
    );
    const viewport = controller.element.querySelector<HTMLDivElement>('.vol-pinch-zoom__viewport')!;

    viewport.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 0,
        clientY: 0,
        bubbles: true,
        cancelable: true,
      }),
    );
    viewport.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 2,
        clientX: 10,
        clientY: 0,
        bubbles: true,
        cancelable: true,
      }),
    );
    viewport.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: 2,
        clientX: 20,
        clientY: 0,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(controller.getZoom()).toBe(2);

    viewport.dispatchEvent(
      new PointerEvent('pointerup', {
        pointerId: 2,
        bubbles: true,
        cancelable: true,
      }),
    );
    viewport.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: 1,
        clientX: 4,
        clientY: -2,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(onTransform).toHaveBeenLastCalledWith(2, 4, -2);
    expect(controller.getZoom()).toBe(2);

    viewport.dispatchEvent(
      new PointerEvent('pointerup', {
        pointerId: 1,
        bubbles: true,
        cancelable: true,
      }),
    );
  });

  it('destroy viewport listenerlarını temizler', () => {
    const controller = track(new PinchZoomController({ content: document.createElement('div') }));
    const viewport = controller.element.querySelector<HTMLDivElement>('.vol-pinch-zoom__viewport')!;
    const removeListener = vi.spyOn(viewport, 'removeEventListener');

    destroyAndMark(controller);

    expect(removeListener).toHaveBeenCalledWith('wheel', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('pointerup', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('pointercancel', expect.any(Function));
  });
});

describe('ActionBar', () => {
  it('slotları oluşturur ve tıklama onActivate çağırır', () => {
    const onActivate = vi.fn();
    const slots = [
      { id: 'jump', label: 'Zıpla', shortcut: 'Space', icon: 'J' },
      { id: 'attack', label: 'Saldır', disabled: true },
    ];
    const actionBar = track(new ActionBar({ slots, onActivate, showLabels: true }));

    const buttons = actionBar.element.querySelectorAll<HTMLButtonElement>('.vol-action-bar__slot');
    expect(buttons.length).toBe(2);
    expect(buttons[0].getAttribute('aria-label')).toBe('Zıpla');
    expect(buttons[0].textContent).toContain('Zıpla');
    expect(buttons[1].disabled).toBe(true);

    buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onActivate).toHaveBeenCalledWith('jump');
  });

  it('setCooldown overlay oranını ve kalan süre metnini günceller', () => {
    const actionBar = track(
      new ActionBar({
        slots: [{ id: 'spell', label: 'Büyü', cooldownProgress: 0.5 }],
        onActivate: vi.fn(),
      }),
    );

    const overlay = actionBar.element.querySelector<HTMLDivElement>('.vol-action-bar__cooldown')!;
    expect(overlay.style.getPropertyValue('--vol-action-bar-cooldown')).toBe('0.5');
    expect(overlay.classList.contains('vol-action-bar__cooldown--active')).toBe(true);

    actionBar.setCooldown('spell', 0.25, 20);
    expect(overlay.style.getPropertyValue('--vol-action-bar-cooldown')).toBe('0.25');
    const textEl = overlay.querySelector<HTMLSpanElement>('.vol-action-bar__cooldown-text')!;
    expect(textEl.textContent).toBe('5');

    actionBar.setCooldown('spell', 0, 20);
    expect(overlay.classList.contains('vol-action-bar__cooldown--active')).toBe(false);
    expect(textEl.textContent).toBe('');
  });

  it('setDisabled durumunu değiştirir', () => {
    const actionBar = track(
      new ActionBar({
        slots: [{ id: 'a', label: 'A' }],
        onActivate: vi.fn(),
      }),
    );

    const button = actionBar.element.querySelector<HTMLButtonElement>('.vol-action-bar__slot')!;
    expect(button.disabled).toBe(false);

    actionBar.setDisabled('a', true);
    expect(button.disabled).toBe(true);

    actionBar.setDisabled('a', false);
    expect(button.disabled).toBe(false);
  });

  it('destroy slot click listenerlarını temizler', () => {
    const onActivate = vi.fn();
    const actionBar = track(
      new ActionBar({
        slots: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
        onActivate,
      }),
    );

    const buttons = actionBar.element.querySelectorAll<HTMLButtonElement>('.vol-action-bar__slot');
    const removeSpies = Array.from(buttons).map((button) =>
      vi.spyOn(button, 'removeEventListener'),
    );

    destroyAndMark(actionBar);

    for (const spy of removeSpies) {
      expect(spy).toHaveBeenCalledWith('click', expect.any(Function));
    }
  });
});
