import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { i18n, i18next } from '@volstudio/core';
import { showFatalError } from '@/app/fatalError';
import tr from '@/i18n/tr.json';
import en from '@/i18n/en.json';

beforeAll(async () => {
  i18n.addResources('tr', 'life', tr);
  i18n.addResources('en', 'life', en);
  await i18n.init();
}, 60_000);

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function withI18nUninitialized(run: () => void): void {
  const original = i18next.isInitialized;
  Object.defineProperty(i18next, 'isInitialized', { configurable: true, value: false });
  try {
    run();
  } finally {
    Object.defineProperty(i18next, 'isInitialized', { configurable: true, value: original });
  }
}

describe('showFatalError', () => {
  it('alert rolüyle çevrilmiş başlığı ve hata ayrıntısını gösterir', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const overlay = showFatalError(new Error('Cannot create WebGL context, aborting.'));

    expect(overlay.parentElement).toBe(document.body);
    expect(overlay.getAttribute('role')).toBe('alert');
    expect(overlay.querySelector('.vol-life-fatal__title')?.textContent).toBe(
      i18next.t('life:fatal.title'),
    );
    expect(overlay.querySelector('.vol-life-fatal__detail')?.textContent).toBe(
      'Cannot create WebGL context, aborting.',
    );
    expect(consoleError).toHaveBeenCalled();
  });

  it('Error olmayan değeri metne çevirir ve verilen köke ekler', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const parent = document.createElement('section');
    const overlay = showFatalError('bozuk yapılandırma', parent);
    expect(overlay.parentElement).toBe(parent);
    expect(overlay.querySelector('.vol-life-fatal__detail')?.textContent).toBe(
      'bozuk yapılandırma',
    );
  });

  it('i18n kurulamadıysa başlık paketlenmiş çeviriden, dil tarayıcıdan gelir', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    withI18nUninitialized(() => {
      vi.stubGlobal('navigator', { language: 'en-US' });
      expect(showFatalError(new Error('x')).textContent).toContain(en.fatal.title);

      vi.stubGlobal('navigator', { language: 'tr-TR' });
      expect(showFatalError(new Error('x')).textContent).toContain(tr.fatal.title);
    });
  });
});
