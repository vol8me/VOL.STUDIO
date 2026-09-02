import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { backHandlerCount, i18n, i18next } from '@volstudio/core';
import type { TauriWindowAdapter } from '@volstudio/tauri-v2';
import tr from '@/i18n/tr.json';
import en from '@/i18n/en.json';
import '@/i18next-augment';
import { ArachnidExitPrompt } from '@/runtime/ui/ArachnidExitPrompt';

/** `TauriWindowAdapter`ın bu yüzeyden fazlası bu testte gerekmez. */
function fakeAdapter(): { adapter: TauriWindowAdapter; close: ReturnType<typeof vi.fn> } {
  const close = vi.fn().mockResolvedValue(undefined);
  return { adapter: { close } as unknown as TauriWindowAdapter, close };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('ArachnidExitPrompt', () => {
  let prompt: ArachnidExitPrompt | null;

  beforeAll(async () => {
    i18n.addResources('tr', 'arachnid', tr);
    i18n.addResources('en', 'arachnid', en);
    await i18n.init();
    await i18next.changeLanguage('tr');
  });

  afterEach(() => {
    prompt?.destroy();
    prompt = null;
    document.body.replaceChildren();
  });

  const modal = () => document.querySelector('.vol-modal');
  const buttons = () => [...document.querySelectorAll<HTMLButtonElement>('.vol-modal button')];

  it('geri hareketini TÜKETİR ve onay açar — uygulama sessizce kapanmaz', async () => {
    const { adapter, close } = fakeAdapter();
    prompt = new ArachnidExitPrompt({ container: document.body, windowAdapter: adapter });

    expect(prompt.request()).toBe(true);
    await flush();

    expect(modal()).not.toBeNull();
    expect(modal()?.parentElement?.classList.contains('vol-ui-root')).toBe(true);
    expect(document.body.textContent).toContain('VOL.ARACHNID kapatılsın mı?');
    expect(close).not.toHaveBeenCalled();
  });

  it('onaylanınca pencereyi kapatır', async () => {
    const { adapter, close } = fakeAdapter();
    prompt = new ArachnidExitPrompt({ container: document.body, windowAdapter: adapter });

    prompt.request();
    await flush();
    buttons()
      .find((button) => button.textContent === 'Çık')
      ?.click();
    await flush();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('iptal edilince kapatmaz', async () => {
    const { adapter, close } = fakeAdapter();
    prompt = new ArachnidExitPrompt({ container: document.body, windowAdapter: adapter });

    prompt.request();
    await flush();
    buttons()
      .find((button) => button.textContent === 'Devam et')
      ?.click();
    await flush();

    expect(close).not.toHaveBeenCalled();
  });

  it('üst üste geri basmak modal YIĞMAZ', async () => {
    const { adapter } = fakeAdapter();
    prompt = new ArachnidExitPrompt({ container: document.body, windowAdapter: adapter });

    prompt.request();
    prompt.request();
    prompt.request();
    await flush();

    expect(document.querySelectorAll('.vol-modal')).toHaveLength(1);
  });

  it('destroy geri işleyicisini bırakır ve tekrar çağrılabilir', () => {
    const { adapter } = fakeAdapter();
    const before = backHandlerCount();
    prompt = new ArachnidExitPrompt({ container: document.body, windowAdapter: adapter });
    expect(backHandlerCount()).toBe(before + 1);

    prompt.destroy();
    prompt.destroy();
    expect(backHandlerCount()).toBe(before);
  });

  it('açılma/kapanma durumunu simülasyon sahibine bildirir', async () => {
    const { adapter } = fakeAdapter();
    const onVisibilityChange = vi.fn();
    prompt = new ArachnidExitPrompt({
      container: document.body,
      windowAdapter: adapter,
      onVisibilityChange,
    });

    prompt.request();
    await flush();
    expect(onVisibilityChange).toHaveBeenLastCalledWith(true);

    buttons()
      .find((button) => button.textContent === 'Devam et')
      ?.click();
    await flush();
    expect(onVisibilityChange).toHaveBeenLastCalledWith(false);
  });

  it('native kapatma hatasını unhandled rejection yerine teşhis eder', async () => {
    const error = new Error('IPC reddedildi');
    const close = vi.fn().mockRejectedValue(error);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    prompt = new ArachnidExitPrompt({
      container: document.body,
      windowAdapter: { close } as unknown as TauriWindowAdapter,
    });

    prompt.request();
    await flush();
    buttons()
      .find((button) => button.textContent === 'Çık')
      ?.click();
    await flush();

    expect(log).toHaveBeenCalledWith('[ArachnidExitPrompt] Uygulama kapatılamadı:', error);
    log.mockRestore();
  });
});
