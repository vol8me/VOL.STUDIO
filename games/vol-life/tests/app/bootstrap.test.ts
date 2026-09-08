import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const { createVolGame, gameEvents } = vi.hoisted(() => {
  const events = { once: vi.fn() };
  return {
    createVolGame: vi.fn((config: unknown) => {
      void config;
      return Promise.resolve({ events });
    }),
    gameEvents: events,
  };
});

vi.mock('@volstudio/core', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@volstudio/core');
  return { ...actual, createVolGame };
});

vi.mock('@/runtime/scene/LifeScene', () => ({ LifeScene: class {} }));

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
    gameEvents.once.mockClear();
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
});
