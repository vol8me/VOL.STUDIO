// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  androidScreenOrientation,
  observeViewportOrientation,
  readViewportOrientation,
  waitForViewportOrientation,
  type ScreenOrientation,
} from '../../src/platform/screenOrientation';

const fakes = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({ invoke: fakes.invoke, isTauri: () => true }));

function stubViewport(initial: ScreenOrientation) {
  let portrait = initial === 'portrait';
  const listeners = new Set<() => void>();
  const query = {
    get matches() {
      return portrait;
    },
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => query),
  );
  return {
    rotate(to: ScreenOrientation) {
      portrait = to === 'portrait';
      for (const listener of [...listeners]) listener();
    },
    listenerCount: () => listeners.size,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  fakes.invoke.mockReset();
});

describe('androidScreenOrientation', () => {
  it('durumu ve seçimi eklenti komutlarıyla ister', async () => {
    const state = { current: 'portrait', preferred: null, supported: true };
    fakes.invoke.mockResolvedValue(state);

    await expect(androidScreenOrientation.getState()).resolves.toBe(state);
    await androidScreenOrientation.set('landscape');
    await androidScreenOrientation.set('portrait', 'sensor');

    expect(fakes.invoke).toHaveBeenNthCalledWith(1, 'plugin:vol-orientation|get_state');
    expect(fakes.invoke).toHaveBeenNthCalledWith(2, 'plugin:vol-orientation|set_orientation', {
      orientation: 'landscape',
      family: 'user',
    });
    expect(fakes.invoke).toHaveBeenNthCalledWith(3, 'plugin:vol-orientation|set_orientation', {
      orientation: 'portrait',
      family: 'sensor',
    });
  });
});

describe('görüntü alanı yönü', () => {
  it('matchMedia yönünü okur; matchMedia yoksa yatay sayar', () => {
    const viewport = stubViewport('portrait');
    expect(readViewportOrientation()).toBe('portrait');
    viewport.rotate('landscape');
    expect(readViewportOrientation()).toBe('landscape');

    vi.stubGlobal('matchMedia', undefined);
    expect(readViewportOrientation()).toBe('landscape');
    expect(observeViewportOrientation(vi.fn())()).toBeUndefined();
  });

  it('dönüşü bildirir, abonelik kalkınca dinleyici bırakılır', () => {
    const viewport = stubViewport('portrait');
    const listener = vi.fn();
    const stop = observeViewportOrientation(listener);

    viewport.rotate('landscape');
    expect(listener).toHaveBeenCalledExactlyOnceWith('landscape');

    stop();
    expect(viewport.listenerCount()).toBe(0);
  });

  it('zaten beklenen yöndeyse beklemeden döner', async () => {
    stubViewport('landscape');
    await expect(waitForViewportOrientation('landscape', 1000)).resolves.toBe('landscape');
  });

  it('süre içinde dönülürse beklenen yönü döner ve dinleyiciyi bırakır', async () => {
    vi.useFakeTimers();
    const viewport = stubViewport('portrait');
    const waiting = waitForViewportOrientation('landscape', 1000);

    viewport.rotate('landscape');

    await expect(waiting).resolves.toBe('landscape');
    expect(viewport.listenerCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('istek yok sayılırsa süre dolunca GERÇEK yönü döner', async () => {
    vi.useFakeTimers();
    const viewport = stubViewport('portrait');
    const waiting = waitForViewportOrientation('landscape', 1000);

    await vi.advanceTimersByTimeAsync(1000);

    await expect(waiting).resolves.toBe('portrait');
    expect(viewport.listenerCount()).toBe(0);
  });
});
