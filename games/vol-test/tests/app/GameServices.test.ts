import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Platform from '@volstudio/tauri-v2';
import { GameServices } from '@/app/GameServices';

const bridge = vi.hoisted(() => ({
  platform: 'web',
  session: 'web',
  measure: false,
  orientationError: false,
  suspend: null as (() => Promise<void>) | null,
  shutdown: null as (() => Promise<void>) | null,
  resume: null as (() => void) | null,
  overlay: null as ((active: boolean) => void) | null,
  stops: 0,
  reports: [] as unknown[],
  steamReady: false,
  actionSets: [] as string[],
  env: {},
}));
vi.mock('@volstudio/tauri-v2', async (importOriginal) => {
  const original = await importOriginal<typeof Platform>();
  const stop = () => () => {
    bridge.stops++;
  };
  return {
    ...original,
    getRuntimePlatform: () => bridge.platform,
    getSessionKind: () => Promise.resolve(bridge.session),
    getDiagnosticsEnv: () =>
      Promise.resolve({ ...bridge.env, ...(bridge.measure ? { VOL_DECK_MEASURE: '1' } : {}) }),
    steamVirtualGamepads: () => Promise.resolve([{ vid: 0x054c, type: 'ps5' }]),
    steamworksGlyphContext: () => Promise.resolve({}),
    steamworksStatus: () =>
      Promise.resolve({
        compiled: bridge.steamReady,
        available: bridge.steamReady,
        inputReady: bridge.steamReady,
        deck: bridge.session === 'gamescope',
        bigPicture: false,
        overlayEnabled: bridge.steamReady,
      }),
    activateSteamActionSet: (name: string) => {
      bridge.actionSets.push(name);
      return Promise.resolve(1);
    },
    observeLinuxHaptics: () => stop(),
    observeAndroidHaptics: () => stop(),
    registerSuspendFlush: (hook: () => Promise<void>) => {
      bridge.suspend = hook;
      return stop();
    },
    registerShutdownFlush: (hook: () => Promise<void>) => {
      bridge.shutdown = hook;
      return stop();
    },
    onSystemResume: (hook: () => void) => {
      bridge.resume = hook;
      return stop();
    },
    onSteamOverlay: (hook: (active: boolean) => void) => {
      bridge.overlay = hook;
      return Promise.resolve(stop());
    },
    reportDiagnostics: (value: unknown) => {
      bridge.reports.push(value);
      return Promise.resolve();
    },
    androidScreenOrientation: {
      set: () =>
        bridge.orientationError ? Promise.reject(new Error('yön köprüsü')) : Promise.resolve(),
    },
  };
});
let services: GameServices | null = null;
afterEach(() => {
  services?.dispose();
  services = null;
  vi.restoreAllMocks();
  bridge.env = {};
});

describe('GameServices', () => {
  it('uyanış aboneliğini mikro görev öncesinde kaldırırsa eski sahneyi çağırmaz', async () => {
    Object.assign(bridge, {
      platform: 'web',
      session: 'web',
      measure: false,
      orientationError: false,
    });
    services = await GameServices.create();
    const listener = vi.fn(() => Promise.resolve());
    const remove = services.onResume(listener);
    bridge.resume?.();
    remove();
    await Promise.resolve();
    expect(listener).not.toHaveBeenCalled();
    services.onResume(listener);
    bridge.resume?.();
    await Promise.resolve();
    expect(listener).toHaveBeenCalledOnce();
    bridge.resume?.();
    services.dispose();
    await Promise.resolve();
    expect(listener).toHaveBeenCalledOnce();
  });
  it('ölçüm tercihlerini kalıcı cihaz ayarlarından ayrı tutar', async () => {
    localStorage.clear();
    Object.assign(bridge, {
      platform: 'web',
      session: 'web',
      measure: true,
      orientationError: false,
      env: {
        VOL_DECK_SCENARIO: '40',
        VOL_DECK_SEED: '4294967295',
        VOL_DECK_WEATHER: 'snow',
        VOL_DECK_SEASON: 'winter',
        VOL_DECK_QUALITY: 'low',
      },
    });
    services = await GameServices.create();
    expect(services.overrides).toEqual({
      scenario: 'multitank',
      seed: 4294967295,
      weather: 'snow',
      season: 'winter',
      quality: 'low',
    });
    expect(services.settings.get()).toMatchObject({
      scenario: 'empty',
      seed: 731,
      quality: 'high',
    });
    await services.flush();
    expect(localStorage.getItem('device.voltest.preferences')).toBeNull();
  });
  it('Steam Input hazırsa oyun ve menü aksiyon setini duraklama sınırında değiştirir', async () => {
    Object.assign(bridge, {
      platform: 'desktop',
      session: 'gamescope',
      measure: false,
      orientationError: false,
      steamReady: true,
      actionSets: [],
    });
    services = await GameServices.create();
    expect(services.steam.available).toBe(true);
    expect(bridge.actionSets).toEqual(['Gameplay']);
    await services.setPaused(true);
    await services.setPaused(false);
    expect(bridge.actionSets).toEqual(['Gameplay', 'Menu', 'Gameplay']);
    bridge.steamReady = false;
  });
  it('uyku ve kapanış son cihaz tercihini ve ilerlemeyi iki kapsamda boşaltır', async () => {
    localStorage.clear();
    Object.assign(bridge, {
      platform: 'desktop',
      session: 'desktop',
      measure: false,
      orientationError: false,
      stops: 0,
    });
    services = await GameServices.create();
    const pause = vi.fn();
    const remove = services.onPause(pause);
    await services.settings.update({ volume: 0.25, haptics: false });
    services.progress.travel(2);
    await bridge.suspend?.();
    expect(pause).toHaveBeenCalledOnce();
    expect(JSON.parse(localStorage.getItem('synced.voltest.progress')!)).toEqual({
      distance: 2,
      shots: 0,
    });
    services.progress.fired();
    await bridge.shutdown?.();
    expect(JSON.parse(localStorage.getItem('synced.voltest.progress')!)).toEqual({
      distance: 2,
      shots: 1,
    });
    bridge.overlay?.(false);
    bridge.overlay?.(true);
    bridge.resume?.();
    expect(pause).toHaveBeenCalledTimes(3);
    remove();
    bridge.resume?.();
    expect(pause).toHaveBeenCalledTimes(3);
    services.dispose();
    services.dispose();
    expect(bridge.stops).toBe(6);
  });
  it('gamescope pencere kontrolü sunmaz, tanı kaydı gerçek ölçüm köprüsüne gider', async () => {
    Object.assign(bridge, {
      platform: 'desktop',
      session: 'gamescope',
      measure: true,
      reports: [],
      stops: 0,
    });
    services = await GameServices.create();
    expect(services.displayAvailable).toBe(false);
    expect(services.display).toBeNull();
    expect(services.glyphContext.virtualPad?.vid).toBe(0x054c);
    for (let i = 0; i < 60; i++) {
      services.diagnostics?.beginFrame();
      services.diagnostics?.endFrame();
    }
    await Promise.resolve();
    expect(bridge.reports).toHaveLength(2);
    expect(bridge.reports[0]).toMatchObject({ type: 'info' });
    services.measurements?.frame(0, false, 'low', 0);
    services.measurements?.frame(16, false, 'low', 1);
    bridge.resume?.();
    await services.flush();
    expect(bridge.reports[2]).toMatchObject({ type: 'perf', phase: 'gameplay', p95: 16 });
  });
  it('Android yön köprüsü açılışta düşerse kurulan abonelikler sökülür', async () => {
    Object.assign(bridge, {
      platform: 'android',
      session: 'desktop',
      measure: false,
      orientationError: true,
      stops: 0,
    });
    await expect(GameServices.create()).rejects.toThrow('yön köprüsü');
    expect(bridge.stops).toBe(6);
  });
});
