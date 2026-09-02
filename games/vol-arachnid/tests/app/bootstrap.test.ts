import { afterEach, describe, expect, it, vi } from 'vitest';

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

// Sahne, gerçek bir Phaser bağlamı olmadan içe aktarılamayacak kadar ağır
// değil ama boot sırasını ölçen bu testte hiç kurulmaz.
vi.mock('@/runtime/scene/GameScene', () => ({ GameScene: class {} }));

describe('bootstrap', () => {
  afterEach(() => {
    vi.resetModules();
    createVolGame.mockClear();
    gameEvents.once.mockClear();
  });

  it('i18n kaynaklarını yükler, belge dilini kurar ve oyunu başlatır', async () => {
    await import('@/app/bootstrap');
    const { i18next } = await import('@volstudio/core');

    expect(createVolGame).toHaveBeenCalledTimes(1);
    expect(createVolGame).toHaveBeenCalledWith(expect.objectContaining({ strategy: 'resize' }));
    expect(document.documentElement.lang).toBe(i18next.language);
    expect(document.title).toBe('VOL.ARACHNID');
    expect(i18next.t('arachnid:hud.ariaLabel')).not.toBe('');
  });

  it('oyun yok edildiğinde dil dinleyicisini bırakır', async () => {
    await import('@/app/bootstrap');
    const { i18next } = await import('@volstudio/core');

    const call = gameEvents.once.mock.calls[0] as [string, () => void];
    expect(call[0]).toBe('destroy');
    const handler = call[1];

    const off = vi.spyOn(i18next, 'off');
    (handler as () => void)();
    expect(off).toHaveBeenCalledWith('languageChanged', expect.any(Function));
  });
});
