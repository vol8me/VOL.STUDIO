import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

type Platform = 'web' | 'desktop' | 'android';

const { createVolGame, gameDestroy, gameEvents, platform, displayStart, displayControllers } =
  vi.hoisted(() => {
    const events = { once: vi.fn() };
    const destroy = vi.fn();
    const start = vi.fn(() => Promise.resolve());
    return {
      createVolGame: vi.fn((config: unknown) => {
        void config;
        return Promise.resolve({ events, canvas: document.createElement('canvas'), destroy });
      }),
      gameDestroy: destroy,
      gameEvents: events,
      platform: { value: 'web' as Platform },
      displayStart: start,
      displayControllers: [] as Array<{
        options: unknown;
        start: ReturnType<typeof vi.fn>;
        destroy: ReturnType<typeof vi.fn>;
      }>,
    };
  });

vi.mock('@volstudio/core', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@volstudio/core');
  return { ...actual, createVolGame };
});

vi.mock('@volstudio/tauri-v2', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@volstudio/tauri-v2');
  class FakeDisplayModeController {
    readonly start = displayStart;
    readonly destroy = vi.fn();
    constructor(readonly options: unknown) {
      displayControllers.push(this);
    }
  }
  return {
    ...actual,
    getRuntimePlatform: () => platform.value,
    DisplayModeController: FakeDisplayModeController,
  };
});

vi.mock('@/app/storage', () => ({
  createSaveManager: () => ({
    load: () => Promise.resolve(undefined),
    save: () => Promise.resolve(),
  }),
}));

vi.mock('@/runtime/scene/LifeScene', () => ({
  LifeScene: class {
    constructor(readonly services: unknown) {}
  },
}));

function sceneServices(): { platform: Platform; preferences: unknown } {
  const config = createVolGame.mock.calls[0]?.[0] as {
    scenes: Array<{ services: { platform: Platform; preferences: unknown } }>;
  };
  return config.scenes[0].services;
}

describe('bootstrap', () => {
  /*
   * Modül grafiğini testlerin DIŞINDA ısıt: `vi.resetModules()` her testte
   * `@volstudio/core`un gerçek grafiğini yeniden değerlendirir ve ilk yükleme
   * tek başına varsayılan 5000 ms sınırına yaklaşır. Maliyet davranışa değil
   * tek seferlik yüklemeye aittir; hook'a taşımak hiçbir testin son tarihini
   * zayıflatmaz.
   */
  beforeAll(async () => {
    await import('@volstudio/core');
  }, 120_000);

  afterEach(() => {
    const destroyCall = gameEvents.once.mock.calls.find((call) => call[0] === 'destroy');
    (destroyCall?.[1] as (() => void) | undefined)?.();
    vi.resetModules();
    createVolGame.mockClear();
    gameDestroy.mockClear();
    gameEvents.once.mockClear();
    displayStart.mockReset();
    displayStart.mockResolvedValue(undefined);
    platform.value = 'web';
    displayControllers.length = 0;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('oyunu açıkça WebGL isteyerek kurar', async () => {
    await import('@/app/bootstrap');

    expect(createVolGame).toHaveBeenCalledTimes(1);
    const config = createVolGame.mock.calls[0]?.[0] as { renderer?: string; scenes?: unknown[] };
    expect(config.renderer).toBe('webgl');
    expect(config.scenes).toHaveLength(1);
  });

  it('belge dilini ve başlığını i18n üzerinden kurar', async () => {
    await import('@/app/bootstrap');

    expect(document.documentElement.lang).not.toBe('');
    expect(document.title).not.toBe('');
  });

  /* Listener eklenen her yerde kaldırılır (AGENTS Kural 6). */
  it('oyun yıkıldığında dil aboneliğini bırakır', async () => {
    await import('@/app/bootstrap');
    const { i18next } = await import('@volstudio/core');

    const call = gameEvents.once.mock.calls[0] as [string, () => void];
    expect(call[0]).toBe('destroy');

    const off = vi.spyOn(i18next, 'off');
    call[1]();
    expect(off).toHaveBeenCalledWith('languageChanged', expect.any(Function));
  });

  it('tarayıcıda görüntü kipi denetleyicisi kurulmaz; sahne kabuğu ve tercihleri alır', async () => {
    await import('@/app/bootstrap');

    expect(displayControllers).toHaveLength(0);
    expect(sceneServices().platform).toBe('web');
    expect(sceneServices().preferences).not.toBeNull();
  });

  it('masaüstünde görüntü kipi denetleyicisi başlar ve oyun ömrüne bağlanır', async () => {
    platform.value = 'desktop';
    await import('@/app/bootstrap');

    expect(sceneServices().platform).toBe('desktop');
    expect(sceneServices().preferences).not.toBeNull();
    expect(displayControllers).toHaveLength(1);
    expect(displayControllers[0].start).toHaveBeenCalledOnce();

    for (const [event, handler] of gameEvents.once.mock.calls as Array<[string, () => void]>) {
      if (event === 'destroy') handler();
    }
    expect(displayControllers[0].destroy).toHaveBeenCalledOnce();
  });

  it('açılış zinciri kırılırsa i18n başlıklı görünür hata yüzeyi çıkar', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    createVolGame.mockRejectedValueOnce(new Error('Cannot create WebGL context, aborting.'));

    await import('@/app/bootstrap');
    const { i18next } = await import('@volstudio/core');

    const overlay = document.querySelector('.vol-life-fatal');
    expect(overlay?.getAttribute('role')).toBe('alert');
    expect(overlay?.querySelector('.vol-life-fatal__title')?.textContent).toBe(
      i18next.t('life:fatal.title'),
    );
    expect(overlay?.textContent).toContain('Cannot create WebGL context, aborting.');
    expect(consoleError).toHaveBeenCalled();
  });

  it('oyun kurulduktan sonraki açılış hatasında çalışan oyunu yok eder', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    platform.value = 'desktop';
    displayStart.mockRejectedValueOnce(new Error('pencere kipi'));
    await import('@/app/bootstrap');

    expect(gameDestroy).toHaveBeenCalledExactlyOnceWith(true);
    expect(document.querySelector('.vol-life-fatal')).not.toBeNull();
  });
});
