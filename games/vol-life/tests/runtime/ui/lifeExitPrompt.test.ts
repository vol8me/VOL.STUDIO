import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { LifeExitPrompt } from '@/runtime/ui/LifeExitPrompt';
import { i18n } from '@volstudio/core';
import tr from '@/i18n/tr.json';
import en from '@/i18n/en.json';

function findButton(label: RegExp): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find((b) => label.test(b.textContent ?? ''));
}

describe('LifeExitPrompt', () => {
  beforeAll(async () => {
    i18n.addResources('tr', 'life', tr);
    i18n.addResources('en', 'life', en);
    await i18n.init();
  }, 60_000);

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('geri hareketi onay sorar, uygulamayı SESSİZCE kapatmaz', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const prompt = new LifeExitPrompt({
      container: document.body,
      windowAdapter: { close } as never,
    });

    expect(prompt.request()).toBe(true);
    await vi.waitFor(() => expect(findButton(/Çık|Exit/)).toBeDefined());
    expect(close).not.toHaveBeenCalled();

    prompt.destroy();
  });

  it('onaylanınca pencereyi kapatır', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const prompt = new LifeExitPrompt({
      container: document.body,
      windowAdapter: { close } as never,
    });

    prompt.request();
    await vi.waitFor(() => expect(findButton(/Çık|Exit/)).toBeDefined());
    findButton(/Çık|Exit/)?.click();
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));

    prompt.destroy();
  });

  /* Geri tuşuna üst üste basmak modal YIĞMAMALIDIR. */
  it('ikinci geri basışı ikinci bir onay açmaz', async () => {
    const prompt = new LifeExitPrompt({
      container: document.body,
      windowAdapter: { close: vi.fn() } as never,
    });

    prompt.request();
    await vi.waitFor(() => expect(findButton(/Çık|Exit/)).toBeDefined());
    prompt.request();
    prompt.request();

    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    prompt.destroy();
  });

  it('destroy bekleyen onayı ve kaydı toplar', async () => {
    const prompt = new LifeExitPrompt({
      container: document.body,
      windowAdapter: { close: vi.fn() } as never,
    });
    prompt.request();
    await vi.waitFor(() => expect(findButton(/Çık|Exit/)).toBeDefined());

    prompt.destroy();

    await vi.waitFor(() => expect(document.querySelectorAll('[role="dialog"]').length).toBe(0));
  });
});
