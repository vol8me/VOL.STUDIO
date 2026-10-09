import { afterEach, describe, expect, it, vi } from 'vitest';
import { DisplayModeController } from '@volstudio/tauri-v2';
import type * as Platform from '@volstudio/tauri-v2';
import { resolveGlyphFamily, type GlyphFamilyContext } from '@volstudio/core/ui';
import { GameServices } from '@/app/GameServices';

const bridge = vi.hoisted(() => {
  // Zayıf tip: her alan isteğe bağlıdır; boş bağlam anlamlı bir değerdir ve
  // açık tip burada yazım hatasını (ör. `steamworksTyp`) erken yakalar.
  const glyphContext: GlyphFamilyContext = {};
  return {
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
    reportError: null as Error | null,
    steamReady: false,
    actionSets: [] as string[],
    env: {},
    glyphContext,
    glyphLookup: null as (() => Promise<GlyphFamilyContext>) | null,
    pads: [{ slot: 0, name: 'pad', vid: 0x054c, pid: 0, type: 'ps5' }],
  };
});
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
    steamVirtualGamepads: () => Promise.resolve(bridge.pads),
    steamworksGlyphContext: () => bridge.glyphLookup?.() ?? Promise.resolve(bridge.glyphContext),
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
      return bridge.reportError ? Promise.reject(bridge.reportError) : Promise.resolve();
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
  bridge.reportError = null;
  bridge.glyphContext = {};
  bridge.glyphLookup = null;
  bridge.pads = [{ slot: 0, name: 'pad', vid: 0x054c, pid: 0, type: 'ps5' }];
});

describe('GameServices', () => {
  it('kol değişiminde eski Steam ailesini bırakır ve güncel menü aksiyonunu yeni kola uygular', async () => {
    localStorage.clear();
    Object.assign(bridge, {
      platform: 'desktop',
      session: 'desktop',
      measure: false,
      steamReady: true,
      orientationError: false,
      actionSets: [],
      glyphContext: { steamworksType: 'ps5' },
    });
    services = await GameServices.create();
    await services.setPaused(true);
    expect(resolveGlyphFamily('gamepad', services.glyphContext)).toBe('playstation');
    bridge.glyphContext = { steamworksType: 'xboxone' };
    bridge.pads = [{ slot: 0, name: 'pad', vid: 0x045e, pid: 0, type: 'xboxone' }];
    window.dispatchEvent(new Event('gamepadconnected'));
    await vi.waitFor(() =>
      expect(resolveGlyphFamily('gamepad', services!.glyphContext)).toBe('xbox'),
    );
    expect(services.glyphContext.virtualPad?.vid).toBe(0x045e);
    expect(bridge.actionSets).toEqual(['Gameplay', 'Menu', 'Menu']);
    // Kol ayrılınca native ipucu da silinir; sıradaki Gamepad.id gerçeği kazanır.
    bridge.glyphContext = {};
    bridge.pads = [];
    window.dispatchEvent(new Event('gamepaddisconnected'));
    await vi.waitFor(() => expect(services!.glyphContext.virtualPad).toBeUndefined());
    expect(
      resolveGlyphFamily('gamepad', {
        ...services.glyphContext,
        gamepadId: 'Xbox Controller',
      }),
    ).toBe('xbox');
    bridge.steamReady = false;
  });

  it('Steam açılışta yokken odak dönüşünde yeniden bağlanır ve duraklama son durumu kullanır', async () => {
    localStorage.clear();
    Object.assign(bridge, {
      platform: 'desktop',
      session: 'desktop',
      measure: false,
      steamReady: false,
      orientationError: false,
      actionSets: [],
    });
    services = await GameServices.create();
    expect(services.steam.available).toBe(false);
    bridge.steamReady = true;
    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(services!.steam.available).toBe(true));
    expect(bridge.actionSets).toEqual(['Gameplay']);
    await services.setPaused(true);
    expect(bridge.actionSets).toEqual(['Gameplay', 'Menu']);
    bridge.steamReady = false;
  });

  it('kapanıştan sonra dönen native kol sorgusu bağlamı değiştirmez ve aksiyon kurmaz', async () => {
    localStorage.clear();
    Object.assign(bridge, {
      platform: 'desktop',
      session: 'desktop',
      measure: false,
      steamReady: true,
      orientationError: false,
      actionSets: [],
      glyphContext: { steamworksType: 'ps5' },
    });
    services = await GameServices.create();
    let finish!: (context: GlyphFamilyContext) => void;
    bridge.glyphLookup = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    window.dispatchEvent(new Event('gamepadconnected'));
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    services.dispose();
    finish({ steamworksType: 'xboxone' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(resolveGlyphFamily('gamepad', services.glyphContext)).toBe('playstation');
    expect(bridge.actionSets).toEqual(['Gameplay']);
    bridge.glyphLookup = () => {
      throw new Error('Sökülen dinleyici çağrıldı.');
    };
    window.dispatchEvent(new Event('gamepadconnected'));
    window.dispatchEvent(new Event('focus'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    bridge.steamReady = false;
  });

  it('pending F11 son tercihi kalıcı olmadan kapanış ACK vermez', async () => {
    localStorage.clear();
    Object.assign(bridge, { platform: 'web', session: 'web', measure: false });
    services = await GameServices.create();
    services.display?.destroy();
    let active = false;
    let release!: (active: boolean) => void;
    let pendingRead = false;
    const adapter: NonNullable<
      ConstructorParameters<typeof DisplayModeController>[0]['windowAdapter']
    > = {
      isAvailable: () => true,
      isFullscreen: () =>
        pendingRead
          ? new Promise((resolve) => {
              release = resolve;
            })
          : Promise.resolve(active),
      setFullscreen: (value) => {
        active = value;
        return Promise.resolve();
      },
      setResolution: () => Promise.resolve(),
      onFullscreenChange: () => Promise.resolve(() => undefined),
    };
    const display = new DisplayModeController({
      getMode: () => services!.settings.get().display,
      setMode: (value) => services!.settings.update({ display: value }),
      subscribe: (listener) => services!.settings.subscribe(listener),
      windowAdapter: adapter,
    });
    Object.defineProperty(services, 'display', { value: display });
    try {
      await display.start();
      pendingRead = true;
      const toggle = display.toggle();
      let ack = false;
      const shutdown = bridge.shutdown!().then(() => {
        ack = true;
      });
      await vi.waitFor(() => expect(release).toBeTypeOf('function'));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(ack).toBe(false);
      pendingRead = false;
      release(false);
      await Promise.all([toggle, shutdown]);
      expect(ack).toBe(true);
      const stored: unknown = JSON.parse(localStorage.getItem('device.voltest.preferences')!);
      expect(stored).toMatchObject({ display: 'fullscreen' });
      expect(active).toBe(true);
    } finally {
      display.destroy();
    }
  });

  it('başlangıç raporu reddedilse de oyun açılır ve kayıp güvenli gözlenir', async () => {
    Object.assign(bridge, { platform: 'web', session: 'web', measure: true });
    const error = new Error('başlangıç tanısı');
    bridge.reportError = error;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    services = await GameServices.create();
    expect(services.measurements).toBeDefined();
    expect(warn).toHaveBeenCalledWith('[VOL.TEST] Ölçüm ortamı kaydedilemedi:', error);
  });

  it('CORE tanı transport reddini oyun hata sınırında gözler', async () => {
    Object.assign(bridge, { platform: 'web', session: 'web', measure: true });
    services = await GameServices.create();
    const error = new Error('tanı teslimi');
    bridge.reportError = error;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (let frame = 0; frame < 60; frame++) {
      services.diagnostics!.beginFrame();
      services.diagnostics!.endFrame();
    }
    await Promise.resolve();
    expect(warn).toHaveBeenCalledWith('[VOL.TEST] Tanı kaydı teslim edilemedi:', error);
  });

  it('kapanış snapshotından önce oyun girdisini duraklatır; listener hatası kayıt kancasını kesmez', async () => {
    localStorage.clear();
    Object.assign(bridge, {
      platform: 'web',
      session: 'web',
      measure: false,
      orientationError: false,
    });
    services = await GameServices.create();
    const error = new Error('duraklatma dinleyicisi');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    services.onPause(() => {
      throw error;
    });
    services.onPause(() => {
      services!.progress.fired();
    });
    await expect(bridge.shutdown?.()).resolves.toBeUndefined();
    expect(JSON.parse(localStorage.getItem('synced.voltest.progress')!)).toEqual({
      distance: 0,
      shots: 1,
    });
    expect(warn).toHaveBeenCalledWith('[VOL.TEST] Duraklatılamadı:', error);
  });
  it('eski kayıt göçü bitmeden ayar ve ilerleme yüklemez; kaynağı korur', async () => {
    localStorage.clear();
    Object.assign(bridge, {
      platform: 'web',
      session: 'web',
      measure: false,
      orientationError: false,
    });
    const preferences = JSON.stringify({ volume: 0.42, haptics: false });
    const progress = JSON.stringify({ distance: 17, shots: 4 });
    localStorage.setItem('voltest.preferences', preferences);
    localStorage.setItem('voltest.progress', progress);
    services = await GameServices.create();
    expect(services.settings.get()).toMatchObject({ volume: 0.42, haptics: false });
    expect(services.progress.get()).toEqual({ distance: 17, shots: 4 });
    expect(localStorage.getItem('voltest.preferences')).toBe(preferences);
    expect(localStorage.getItem('voltest.progress')).toBe(progress);
    expect(localStorage.getItem('device.device.voltest.preferences')).toBeNull();
    localStorage.clear();
  });
  it('ayar hatası olsa bile geciken ilerleme ve ekran kalıcılığını bekler, bütün hataları korur', async () => {
    Object.assign(bridge, {
      platform: 'web',
      session: 'web',
      measure: false,
      orientationError: false,
    });
    services = await GameServices.create();
    const settingsError = new Error('ayar diski');
    const displayError = new Error('ekran diski');
    let finish!: () => void;
    vi.spyOn(services.settings, 'flush').mockRejectedValue(settingsError);
    vi.spyOn(services.progress, 'flush').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    vi.spyOn(services.display!, 'flush').mockRejectedValue(displayError);
    let settled = false;
    const result = services.flush().catch((error: unknown) => {
      settled = true;
      return error;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);
    finish();
    const error = await result;
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([settingsError, displayError]);
  });
  it('ölçüm hatası kalıcılık başarısını bozmaz ve tanıda görünür', async () => {
    Object.assign(bridge, {
      platform: 'web',
      session: 'web',
      measure: true,
      orientationError: false,
    });
    services = await GameServices.create();
    const error = new Error('ölçüm aktarımı');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(services.measurements!, 'flush').mockRejectedValue(error);
    await expect(services.flush()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('[VOL.TEST] Ölçüm boşaltılamadı:', error);
  });

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
    expect(pause).toHaveBeenCalledTimes(4);
    remove();
    bridge.resume?.();
    expect(pause).toHaveBeenCalledTimes(4);
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
