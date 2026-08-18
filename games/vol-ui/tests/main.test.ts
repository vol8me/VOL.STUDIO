import { describe, it, expect, vi } from 'vitest';

const createVolGame = vi.fn();
const i18nInit = vi.fn(() => Promise.resolve());
const i18nAddResources = vi.fn();

describe('main', () => {
  it('i18n kaynaklarını yükler, init eder ve createVolGame çağırır', async () => {
    vi.doMock('@volstudio/core', async () => {
      const actual = await vi.importActual<Record<string, unknown>>('@volstudio/core');
      return {
        ...actual,
        createVolGame: (...args: unknown[]) => {
          createVolGame(...args);
          return Promise.resolve();
        },
        i18n: {
          ...(actual.i18n as Record<string, unknown>),
          init: i18nInit,
          addResources: i18nAddResources,
        },
      };
    });

    await import('../src/main');

    expect(i18nAddResources).toHaveBeenCalledWith('tr', 'volui', expect.any(Object));
    expect(i18nAddResources).toHaveBeenCalledWith('en', 'volui', expect.any(Object));
    expect(i18nInit).toHaveBeenCalled();
    expect(createVolGame).toHaveBeenCalledWith(
      expect.objectContaining({
        width: expect.any(Number) as number,
        height: expect.any(Number) as number,
        scenes: expect.arrayContaining([expect.any(Function)]) as (() => unknown)[],
      }),
    );

    vi.doUnmock('@volstudio/core');
  });

  it('createVolGame reddedince hatayı console.error ile yazar', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.doMock('@volstudio/core', async () => {
      const actual = await vi.importActual<Record<string, unknown>>('@volstudio/core');
      return {
        ...actual,
        createVolGame: () => Promise.reject(new Error('boot failed')),
        i18n: {
          ...(actual.i18n as Record<string, unknown>),
          init: () => Promise.resolve(),
          addResources: () => {},
        },
      };
    });

    // Modülü yeniden import et; her import farklı URL ile cache bypass olur.
    const fresh = '../src/main?' + Date.now();
    await import(fresh);

    // Top-level await nedeniyle catch hemen çalışır; kısa bekle.
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(consoleError).toHaveBeenCalledWith('[main] VOL.UI başlatılamadı:', expect.any(Error));

    consoleError.mockRestore();
    vi.doUnmock('@volstudio/core');
  });
});
