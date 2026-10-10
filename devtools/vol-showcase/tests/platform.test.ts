import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IStorageAdapter, ScopedStores } from '@volstudio/core/persistence';
import { i18next } from '@volstudio/core/i18n';
import { bootShowcase } from '../src/bootstrap';
import {
  DEFAULT_DISPLAY,
  DISPLAY_KEY,
  PlatformServices,
  sanitizeDisplay,
  type DisplayDriver,
  type PlatformProbes,
} from '../src/platform';

/**
 * Vitrinin platform bağı: kabuk türü + oturum sınıfı → yetenek tablosu → native pencere sürücüsü, tercih
 * deposu ve titreşim gözlemcileri. Native kabuk burada sahtedir; gerçek pencere ve Tauri IPC kabulü native
 * turdadır (UI-06.4), web yedeği ve yaşam döngüsü sözleşmesi burada ölçülür.
 */
const BOOT_TIMEOUT_MS = 20_000;

type MemoryStores = ScopedStores & { raw: Map<string, unknown>; adapter: IStorageAdapter };

function memoryStores(initial: Record<string, unknown> = {}): MemoryStores {
  const raw = new Map<string, unknown>(Object.entries(initial));
  const adapter: IStorageAdapter = {
    get: <T>(key: string): Promise<T | undefined> => Promise.resolve(raw.get(key) as T | undefined),
    set: <T>(key: string, value: T): Promise<void> => {
      raw.set(key, value);
      return Promise.resolve();
    },
    remove: (key: string): Promise<void> => {
      raw.delete(key);
      return Promise.resolve();
    },
  };
  return { synced: adapter, device: adapter, adapter, raw };
}

function fakeDisplay(): { driver: DisplayDriver; destroyed: () => number; started: () => number } {
  let destroyed = 0;
  let started = 0;
  const driver: DisplayDriver = {
    start: () => {
      started += 1;
      return Promise.resolve();
    },
    toggle: () => Promise.resolve(),
    flush: () => Promise.resolve(),
    destroy: () => {
      destroyed += 1;
    },
  };
  return { driver, destroyed: () => destroyed, started: () => started };
}

function probes(
  overrides: Partial<PlatformProbes> & { stores?: ScopedStores } = {},
): PlatformProbes {
  return {
    platform: () => 'web',
    session: () => Promise.resolve('web'),
    createStores: () => overrides.stores ?? memoryStores(),
    observeHaptics: [],
    ...overrides,
  };
}

describe('sanitizeDisplay', () => {
  it('bozuk, yabancı ya da kısmi kaydı varsayılana indirir; geçerli alanı korur', () => {
    expect(sanitizeDisplay(null)).toEqual(DEFAULT_DISPLAY);
    expect(sanitizeDisplay('fullscreen')).toEqual(DEFAULT_DISPLAY);
    expect(sanitizeDisplay({ mode: 'sideways', resolution: 5 })).toEqual(DEFAULT_DISPLAY);
    expect(sanitizeDisplay({ mode: 'fullscreen' })).toEqual({
      mode: 'fullscreen',
      resolution: DEFAULT_DISPLAY.resolution,
    });
    expect(sanitizeDisplay({ mode: 'windowed', resolution: '1920x1080' })).toEqual({
      mode: 'windowed',
      resolution: '1920x1080',
    });
    // Listede olmayan çözünürlük pencereye verilmez.
    expect(sanitizeDisplay({ resolution: '10x10' }).resolution).toBe(DEFAULT_DISPLAY.resolution);
  });
});

describe('PlatformServices', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('web: native pencere ve titreşim sürücüsü kurulmaz, tam yetenek tablosu, localStorage deposu', async () => {
    const created = vi.fn();
    const services = await PlatformServices.boot(
      probes({ createDisplay: () => (created(), fakeDisplay().driver) }),
    );
    expect(services.platform).toBe('web');
    expect(services.session).toBe('web');
    expect(services.native).toBe(false);
    expect(services.display).toBeNull();
    expect(created).not.toHaveBeenCalled();
    expect(services.capabilities).toEqual({ windowMode: true, resolution: true });
    expect(services.displayPreferences).toEqual(DEFAULT_DISPLAY);
    services.destroy();
  });

  it('web yedeği gerçek `createScopedStores` ile localStorage yolunu kullanır (Tauri yok)', async () => {
    localStorage.clear();
    const services = await PlatformServices.boot({ observeHaptics: [] });
    expect(services.platform).toBe('web');
    expect(services.session).toBe('web');
    await services.update({ mode: 'fullscreen' });
    expect(localStorage.getItem(DISPLAY_KEY)).toContain('fullscreen');
    services.destroy();
    localStorage.clear();
  });

  it('masaüstü native: pencere sürücüsü bir kez başlar; kip tercihe, boyut çözünürlüğe bağlanır', async () => {
    const display = fakeDisplay();
    let options: Parameters<NonNullable<PlatformProbes['createDisplay']>>[0] | undefined;
    const stores = memoryStores();
    const services = await PlatformServices.boot(
      probes({
        platform: () => 'desktop',
        session: () => Promise.resolve('desktop'),
        stores,
        createDisplay: (given) => {
          options = given;
          return display.driver;
        },
      }),
    );
    expect(services.native).toBe(true);
    expect(services.display).toBe(display.driver);
    expect(display.started()).toBe(1);
    expect(options?.getMode()).toBe('windowed');
    expect(options?.getWindowedSize?.()).toEqual({ width: 1280, height: 800 });

    await services.update({ resolution: '1920x1080' });
    expect(options?.getWindowedSize?.()).toEqual({ width: 1920, height: 1080 });

    // F11/pencere yöneticisi `setMode` ile gelir: tercihe yazılır, dinleyici bilgilenir, depoya gider.
    const heard = vi.fn();
    const stop = options?.subscribe(heard);
    await options?.setMode('fullscreen');
    expect(services.displayPreferences.mode).toBe('fullscreen');
    expect(heard).toHaveBeenCalledTimes(1);
    expect(stores.raw.get(DISPLAY_KEY)).toEqual({ mode: 'fullscreen', resolution: '1920x1080' });

    // Aynı değer bildirim ya da yazım üretmez (F11 → tercih → uygulama döngüsü kapanır).
    stores.raw.delete(DISPLAY_KEY);
    await options?.setMode('fullscreen');
    expect(heard).toHaveBeenCalledTimes(1);
    expect(stores.raw.has(DISPLAY_KEY)).toBe(false);

    stop?.();
    await services.update({ mode: 'windowed' });
    expect(heard).toHaveBeenCalledTimes(1);
    services.destroy();
  });

  it('kayıtlı tercih açılışta okunur; bozuk kayıt ve okuma hatası varsayılana iner', async () => {
    const saved = await PlatformServices.boot(
      probes({
        stores: memoryStores({ [DISPLAY_KEY]: { mode: 'fullscreen', resolution: '2560x1440' } }),
      }),
    );
    expect(saved.displayPreferences).toEqual({ mode: 'fullscreen', resolution: '2560x1440' });
    saved.destroy();

    const corrupt = await PlatformServices.boot(
      probes({ stores: memoryStores({ [DISPLAY_KEY]: 42 }) }),
    );
    expect(corrupt.displayPreferences).toEqual(DEFAULT_DISPLAY);
    corrupt.destroy();

    const failing = memoryStores();
    failing.adapter.get = () => Promise.reject(new Error('disk'));
    const broken = await PlatformServices.boot(probes({ stores: failing }));
    expect(broken.displayPreferences).toEqual(DEFAULT_DISPLAY);
    expect(console.warn).toHaveBeenCalled();
    broken.destroy();
  });

  it('yazım hatası ayarı bozmaz: bellek tercihi kalır, uyarı yazılır', async () => {
    const stores = memoryStores();
    stores.adapter.set = () => Promise.reject(new Error('disk dolu'));
    const services = await PlatformServices.boot(probes({ stores }));
    await expect(services.update({ mode: 'fullscreen' })).resolves.toBeUndefined();
    expect(services.displayPreferences.mode).toBe('fullscreen');
    expect(console.warn).toHaveBeenCalled();
    services.destroy();
  });

  it('gamescope: pencere kipi ve çözünürlük sunulmaz, pencere sürücüsü kurulmaz', async () => {
    const created = vi.fn();
    const services = await PlatformServices.boot(
      probes({
        platform: () => 'desktop',
        session: () => Promise.resolve('gamescope'),
        createDisplay: () => (created(), fakeDisplay().driver),
      }),
    );
    expect(services.capabilities).toEqual({ windowMode: false, resolution: false });
    expect(services.display).toBeNull();
    expect(created).not.toHaveBeenCalled();
    services.destroy();
  });

  it('tam ekran kontrolü ortama göre akıllıdır: native pencere, tarayıcı Fullscreen API ya da hiçbiri', async () => {
    const control = async (
      platform: 'web' | 'desktop' | 'android',
      session: 'web' | 'desktop' | 'gamescope' | 'bigpicture',
      browserFullscreen = true,
    ) => {
      const services = await PlatformServices.boot(
        probes({
          platform: () => platform,
          session: () => Promise.resolve(session),
          createDisplay: () => fakeDisplay().driver,
          browserFullscreen: () => browserFullscreen,
        }),
      );
      const value = services.fullscreenControl;
      services.destroy();
      return value;
    };
    // Tarayıcı: Fullscreen API varsa düğme anlamlı; iPhone Safari gibi API'siz tarayıcıda yok.
    expect(await control('web', 'web')).toBe('browser');
    expect(await control('web', 'web', false)).toBe('none');
    // Masaüstü native: pencere sürücüsü tam ekranı sürer (tarayıcı API'sinin desteği önemsiz).
    expect(await control('desktop', 'desktop', false)).toBe('native-window');
    expect(await control('desktop', 'bigpicture')).toBe('native-window');
    // Steam Deck oyun kipi ve Android zaten tam ekran: kontrol sunulmaz, tarayıcı API'si olsa bile.
    expect(await control('desktop', 'gamescope')).toBe('none');
    expect(await control('android', 'desktop')).toBe('none');
    expect(await control('android', 'desktop', false)).toBe('none');
  });

  it('Android: pencere kipi ve çözünürlük sunulmaz (oturum `desktop` bildirse de)', async () => {
    const services = await PlatformServices.boot(
      probes({ platform: () => 'android', session: () => Promise.resolve('desktop') }),
    );
    expect(services.capabilities).toEqual({ windowMode: false, resolution: false });
    services.destroy();
  });

  it('Android: pencere sürücüsü yok; titreşim gözlemcileri bir kez kurulur, destroy hepsini söker', async () => {
    const stops = [vi.fn(), vi.fn()];
    const observers = stops.map((stop) => vi.fn(() => stop));
    const created = vi.fn();
    const services = await PlatformServices.boot(
      probes({
        platform: () => 'android',
        session: () => Promise.resolve('desktop'),
        createDisplay: () => (created(), fakeDisplay().driver),
        observeHaptics: observers,
      }),
    );
    expect(services.display).toBeNull();
    expect(created).not.toHaveBeenCalled();
    for (const observer of observers) expect(observer).toHaveBeenCalledTimes(1);
    for (const stop of stops) expect(stop).not.toHaveBeenCalled();

    services.destroy();
    services.destroy();
    for (const stop of stops) expect(stop).toHaveBeenCalledTimes(1);
  });

  it('destroy sürücüyü ve dinleyicileri bırakır; sonrasında güncelleme etkisizdir', async () => {
    const display = fakeDisplay();
    const services = await PlatformServices.boot(
      probes({ platform: () => 'desktop', createDisplay: () => display.driver }),
    );
    const heard = vi.fn();
    services.subscribe(heard);
    services.destroy();
    services.destroy();
    expect(display.destroyed()).toBe(1);
    await services.update({ mode: 'fullscreen' });
    expect(heard).not.toHaveBeenCalled();
    expect(services.displayPreferences).toEqual(DEFAULT_DISPLAY);
  });
});

describe('vitrin oturumu ve platform', () => {
  let root: HTMLDivElement;
  beforeEach(() => {
    document.body.replaceChildren();
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  it(
    'kök kabuk türünü ve oturumu bildirir; ayar kartı gerçek özeti gösterir',
    async () => {
      const session = await bootShowcase(root, probes({}));
      expect(session.app.element.dataset.volPlatform).toBe('web');
      expect(session.app.element.dataset.volSession).toBe('web');
      const summary = root.querySelector<HTMLElement>('.vol-display-settings__summary');
      expect(summary?.dataset.volPlatform).toBe('web');
      expect(summary?.textContent ?? '').toMatch(/Web/);
      session.destroy();
    },
    BOOT_TIMEOUT_MS,
  );

  it(
    'dil değişimi tercih aboneliği sızdırmaz: yeniden kurulumda abonelik sayısı sabit, destroy sonrası sıfır',
    async () => {
      let active = 0;
      const display = fakeDisplay();
      const session = await bootShowcase(
        root,
        probes({ platform: () => 'desktop', createDisplay: () => display.driver }),
      );
      const subscribe = session.platform.subscribe.bind(session.platform);
      // Gözlem: sonradan yapılan her abonelik sayılır, söküm sayacı düşürür.
      session.platform.subscribe = (listener) => {
        active += 1;
        const stop = subscribe(listener);
        let stopped = false;
        return () => {
          if (!stopped) active -= 1;
          stopped = true;
          stop();
        };
      };

      const before = i18next.language;
      const next = before === 'tr' ? 'en' : 'tr';
      await i18next.changeLanguage(next);
      const afterFirst = active;
      expect(afterFirst).toBeGreaterThan(0);
      for (let round = 0; round < 3; round += 1) {
        await i18next.changeLanguage(before);
        await i18next.changeLanguage(next);
      }
      expect(active).toBe(afterFirst);

      session.destroy();
      expect(active).toBe(0);
      expect(display.destroyed()).toBe(1);
      await i18next.changeLanguage(before);
    },
    BOOT_TIMEOUT_MS,
  );
});

describe('native kabuk: eklenti yüzeyi tüketiciyle sınırlı', () => {
  const read = (path: string): string =>
    readFileSync(resolve(import.meta.dirname, '..', path), 'utf8');

  it('Android yeteneği ve Rust kaydı yalnız JS tüketicisi olan eklentileri içerir', () => {
    const mobile = JSON.parse(read('src-tauri/capabilities/mobile.json')) as {
      permissions: string[];
    };
    const plugins = mobile.permissions
      .filter((permission) => !permission.startsWith('core:'))
      .map((permission) => permission.split(':')[0]);
    // Her eklentinin vitrinde bir JS tüketicisi vardır: titreşim sürücüsü `observeAndroidHaptics` ile kaydolur.
    const consumers: Record<string, RegExp> = { 'vol-haptics': /observeAndroidHaptics/ };
    expect(plugins.sort()).toEqual(Object.keys(consumers).sort());
    for (const plugin of plugins) {
      expect(read('src/platform.ts'), `${plugin} tüketicisi`).toMatch(consumers[plugin]);
    }
    const lib = read('src-tauri/src/lib.rs');
    const cargo = read('src-tauri/Cargo.toml');
    for (const plugin of plugins) {
      const crate = plugin.replaceAll('-', '_');
      expect(lib).toContain(`tauri_plugin_${crate}::init()`);
      expect(cargo).toContain(`tauri-plugin-${plugin}`);
    }
    // Tüketicisiz yön eklentisi ne kayıtta ne yetenekte ne bağımlılıkta bulunur (ölü saldırı yüzeyi).
    expect(lib).not.toContain('vol_orientation');
    expect(cargo).not.toContain('vol-orientation');
  });

  it('masaüstü yeteneği pencereyi süren komutlara izin verir (DisplayModeController tüketicisi)', () => {
    const desktop = JSON.parse(read('src-tauri/capabilities/desktop.json')) as {
      permissions: string[];
    };
    expect(desktop.permissions).toEqual(
      expect.arrayContaining([
        'core:window:allow-set-fullscreen',
        'core:window:allow-set-size',
        'core:window:allow-center',
      ]),
    );
  });
});
