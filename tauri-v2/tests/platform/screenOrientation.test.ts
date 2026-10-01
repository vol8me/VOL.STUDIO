// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { androidScreenOrientation } from '../../src/platform/screenOrientation';

const fakes = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({ invoke: fakes.invoke, isTauri: () => true }));

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
