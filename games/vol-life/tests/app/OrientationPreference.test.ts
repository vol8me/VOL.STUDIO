import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScreenOrientation, ScreenOrientationState } from '@volstudio/tauri-v2';
import { OrientationPreference, type OrientationBridge } from '@/app/OrientationPreference';
import { stubViewport } from '../support/viewport';

function bridge(supported = true) {
  const state = (current: ScreenOrientation): ScreenOrientationState => ({
    current,
    preferred: null,
    supported,
  });
  return {
    getState: vi.fn(() => Promise.resolve(state('portrait'))),
    set: vi.fn((orientation: ScreenOrientation) => Promise.resolve(state(orientation))),
  } satisfies OrientationBridge;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('OrientationPreference', () => {
  it('köprü yokken etkileşimsizdir ve gerçek yönü okur', async () => {
    const viewport = stubViewport('landscape');
    const preference = new OrientationPreference(null);
    await preference.load();

    expect(preference.isInteractive()).toBe(false);
    expect(preference.current()).toBe('landscape');
    viewport.rotate('portrait');
    expect(preference.current()).toBe('portrait');
  });

  it('köprü desteklediğini söylerse etkileşimli, söylemezse değildir', async () => {
    const supported = new OrientationPreference(bridge(true));
    await supported.load();
    expect(supported.isInteractive()).toBe(true);

    const tv = new OrientationPreference(bridge(false));
    await tv.load();
    expect(tv.isInteractive()).toBe(false);
  });

  it('köprü okunamazsa etkileşimsiz kalır ve uyarır', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = bridge();
    broken.getState.mockRejectedValueOnce(new Error('eklenti yok'));
    const preference = new OrientationPreference(broken);

    await preference.load();

    expect(preference.isInteractive()).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('seçim köprüye gider; ekran dönünce dinleyiciler yeni yönü alır', async () => {
    const viewport = stubViewport('portrait');
    const native = bridge();
    native.set.mockImplementation((orientation) => {
      viewport.rotate(orientation);
      return Promise.resolve({ current: orientation, preferred: orientation, supported: true });
    });
    const preference = new OrientationPreference(native, 1000);
    await preference.load();
    const listener = vi.fn();
    preference.subscribe(listener);

    await preference.select('landscape');

    expect(native.set).toHaveBeenCalledWith('landscape');
    expect(listener).toHaveBeenLastCalledWith('landscape');
  });

  it('istek yok sayılırsa süre dolunca dinleyiciler GERÇEK yönü alır', async () => {
    vi.useFakeTimers();
    stubViewport('portrait');
    const preference = new OrientationPreference(bridge(), 800);
    await preference.load();
    const listener = vi.fn();
    preference.subscribe(listener);

    const selecting = preference.select('landscape');
    await vi.advanceTimersByTimeAsync(800);
    await selecting;

    expect(listener).toHaveBeenLastCalledWith('portrait');
  });

  it('köprü seçimi reddederse uyarır ve gerçek yönü bildirir', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubViewport('portrait');
    const native = bridge();
    native.set.mockRejectedValueOnce(new Error('izin yok'));
    const preference = new OrientationPreference(native, 300);
    await preference.load();
    const listener = vi.fn();
    preference.subscribe(listener);

    const selecting = preference.select('landscape');
    await vi.advanceTimersByTimeAsync(300);
    await selecting;

    expect(warn).toHaveBeenCalled();
    expect(listener).toHaveBeenLastCalledWith('portrait');
  });

  it('etkileşimsizken seçim köprüye gitmez', async () => {
    stubViewport('portrait');
    const native = bridge(false);
    const preference = new OrientationPreference(native, 0);
    await preference.load();

    await preference.select('portrait');

    expect(native.set).not.toHaveBeenCalled();
  });

  it('dinleyiciler tek görüntü gözlemcisini paylaşır; son abone kalkınca bırakılır', () => {
    const viewport = stubViewport('portrait');
    const preference = new OrientationPreference(null);
    const first = vi.fn();
    const second = vi.fn();

    const stopFirst = preference.subscribe(first);
    const stopSecond = preference.subscribe(second);
    expect(viewport.listenerCount()).toBe(1);

    viewport.rotate('landscape');
    expect(first).toHaveBeenCalledWith('landscape');
    expect(second).toHaveBeenCalledWith('landscape');

    stopFirst();
    expect(viewport.listenerCount()).toBe(1);
    stopSecond();
    expect(viewport.listenerCount()).toBe(0);
  });
});
