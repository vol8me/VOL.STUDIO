import { afterEach, describe, expect, it, vi } from 'vitest';

const { audioDestroy, createArachnidAudio, createVolGame, gameEvents } = vi.hoisted(() => {
  const events = { once: vi.fn() };
  const destroy = vi.fn();
  return {
    createVolGame: vi.fn((config: unknown) => {
      void config;
      return Promise.resolve({ events });
    }),
    audioDestroy: destroy,
    createArachnidAudio: vi.fn(() => ({ destroy })),
    gameEvents: events,
  };
});

vi.mock('@volstudio/core', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@volstudio/core');
  return { ...actual, createVolGame };
});

vi.mock('@/app/ArachnidAudio', () => ({ createArachnidAudio }));

// Sahne, gerçek bir Phaser bağlamı olmadan içe aktarılamayacak kadar ağır
// değil ama boot sırasını ölçen bu testte hiç kurulmaz.
vi.mock('@/runtime/scene/GameScene', () => ({ GameScene: class {} }));

describe('bootstrap', () => {
  afterEach(() => {
    const destroyCall = gameEvents.once.mock.calls.find((call) => call[0] === 'destroy');
    (destroyCall?.[1] as (() => void) | undefined)?.();
    vi.resetModules();
    createVolGame.mockClear();
    createArachnidAudio.mockClear();
    audioDestroy.mockClear();
    gameEvents.once.mockClear();
  });

  it('i18n kaynaklarını yükler, belge dilini kurar ve oyunu başlatır', async () => {
    await import('@/app/bootstrap');
    const { i18next } = await import('@volstudio/core');

    expect(createVolGame).toHaveBeenCalledTimes(1);
    expect(createVolGame).toHaveBeenCalledWith(
      expect.objectContaining({
        strategy: 'resize',
        renderScale: 1,
        render: expect.objectContaining({
          antialias: true,
          antialiasGL: true,
          pixelArt: false,
          powerPreference: 'high-performance',
        }) as unknown,
      }),
    );
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

  it('Phaser kurulumu düşerse ses ve haptik yaşam döngüsünü geri toplar', async () => {
    const failure = new Error('boot failed');
    createVolGame.mockRejectedValueOnce(failure);

    await expect(import('@/app/bootstrap')).rejects.toThrow(failure);
    const { isHapticsEnabled } = await import('@volstudio/core');
    expect(audioDestroy).toHaveBeenCalledTimes(1);
    expect(isHapticsEnabled()).toBe(false);
  });
});
