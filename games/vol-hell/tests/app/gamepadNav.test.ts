import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  notifyGamepadOverlayOpen,
  setGamepadNavDelegate,
  startGamepadNavigation,
} from '@/app/gamepadNav';

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('VOL.HELL UI sanal cursor bağlamı', () => {
  it('gameplay AIM ve held A kart açarken korunur; UI kısa A yalnız bir pointer click üretir', () => {
    vi.useFakeTimers();
    const pad = {
      id: 'standard',
      index: 0,
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 1, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    const target = document.createElement('button');
    target.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 800,
        bottom: 800,
        width: 800,
        height: 800,
      }) as DOMRect;
    document.body.appendChild(target);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => target,
    });
    const events: string[] = [];
    for (const type of ['pointerdown', 'pointerup', 'click'])
      target.addEventListener(type, () => events.push(type));
    let active = false;
    const overlay = vi.fn();
    setGamepadNavDelegate({
      isNavigationActive: () => active,
      onMenu: vi.fn(),
      onOverlayOpen: overlay,
      onLeftBumper: vi.fn(),
      onRightBumper: vi.fn(),
    });
    const stop = startGamepadNavigation();
    vi.advanceTimersByTime(32);
    pad.buttons[0] = { pressed: true, value: 1 };
    vi.advanceTimersByTime(32);
    expect(events).toEqual([]);
    active = true;
    vi.advanceTimersByTime(32);
    pad.buttons[0] = { pressed: false, value: 0 };
    vi.advanceTimersByTime(32);
    expect(events).toEqual([]);
    expect(target.classList.contains('vol-gamepad-hover')).toBe(true);
    pad.axes[2] = 0;
    pad.buttons[0] = { pressed: true, value: 1 };
    vi.advanceTimersByTime(32);
    expect(events).toEqual(['pointerdown']);
    pad.buttons[0] = { pressed: false, value: 0 };
    vi.advanceTimersByTime(32);
    expect(events).toEqual(['pointerdown', 'pointerup', 'click']);
    notifyGamepadOverlayOpen();
    expect(overlay).toHaveBeenCalledTimes(1);
    expect(stop).toBeTypeOf('function');
    expect(vi.getTimerCount()).toBe(2);
    stop();
    stop();
    expect(vi.getTimerCount()).toBe(0);
    expect(target.classList.contains('vol-gamepad-hover')).toBe(false);
    pad.buttons[0] = { pressed: true, value: 1 };
    vi.advanceTimersByTime(32);
    notifyGamepadOverlayOpen();
    expect(overlay).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['pointerdown', 'pointerup', 'click']);
  });
});
