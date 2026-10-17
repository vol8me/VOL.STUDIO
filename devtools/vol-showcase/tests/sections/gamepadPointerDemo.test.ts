import { afterEach, describe, expect, it, vi } from 'vitest';
import { DisposableScope } from '@volstudio/core/lifecycle';
import { FocusNavController } from '@volstudio/core/ui';
import { buildGamepadDemo } from '../../src/sections/touchGamepadDemo';

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('TOUCH sanal kol cursor tüketicisi', () => {
  it('sağ stick hover, kısa A tek seçim ve native pointer önceliği gösterir', () => {
    vi.useFakeTimers();
    const Original = PointerEvent;
    vi.stubGlobal(
      'PointerEvent',
      class extends Original {
        override readonly pointerType: string;
        constructor(type: string, options: PointerEventInit = {}) {
          super(type, options);
          this.pointerType = options.pointerType ?? '';
        }
      },
    );
    const pad = {
      id: 'standard',
      index: 0,
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    const scope = new DisposableScope();
    const nav = new FocusNavController();
    nav.start();
    const root = buildGamepadDemo(scope);
    document.body.appendChild(root);
    const rect = {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
    } as DOMRect;
    root.getBoundingClientRect = () => rect;
    const button = root.querySelector<HTMLButtonElement>('button[aria-pressed]');
    expect(button).not.toBeNull();
    button!.getBoundingClientRect = () => rect;
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => button,
    });
    const click = vi.fn();
    button!.addEventListener('click', click);
    try {
      vi.advanceTimersByTime(32);
      pad.axes[2] = 1;
      vi.advanceTimersByTime(32);
      const cursor = root.querySelector<HTMLElement>('.vol-showcase-gamepad-cursor');
      expect(button!.classList.contains('vol-gamepad-hover')).toBe(true);
      expect(cursor?.hidden).toBe(false);
      pad.axes[2] = 0;
      pad.buttons[0] = { pressed: true, value: 1 };
      vi.advanceTimersByTime(32);
      expect(click).not.toHaveBeenCalled();
      expect(button!.getAttribute('aria-pressed')).toBe('false');
      pad.buttons[0] = { pressed: false, value: 0 };
      vi.advanceTimersByTime(32);
      expect(click).toHaveBeenCalledTimes(1);
      expect(button!.getAttribute('aria-pressed')).toBe('true');
      Object.defineProperty(root, 'offsetWidth', { configurable: true, value: 100 });
      Object.defineProperty(root, 'offsetHeight', { configurable: true, value: 100 });
      button!.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerId: -1,
          pointerType: 'gamepad',
          clientX: 40,
          clientY: 60,
          bubbles: true,
        }),
      );
      expect(cursor?.style.left).toBe('20px');
      expect(cursor?.style.top).toBe('30px');
      document.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerId: 1,
          pointerType: 'mouse',
          clientX: 40,
          clientY: 40,
          bubbles: true,
        }),
      );
      vi.advanceTimersByTime(32);
      expect(cursor?.hidden).toBe(true);
      expect(button!.classList.contains('vol-gamepad-hover')).toBe(false);
    } finally {
      scope.dispose();
      nav.destroy();
    }
    expect(root.querySelector('.vol-gamepad-hover')).toBeNull();
  });
});
