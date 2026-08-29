import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { i18next } from '@volstudio/core/i18n';
import { bootShowcase } from '../src/bootstrap';

/**
 * `bootShowcase` CORE UI alt yolunun tamamını, i18n'i ve font yüklemesini tek
 * seferde ayağa kaldırır; süre o modül grafiğinin maliyetidir, bir takılma
 * değil.
 *
 * Genel `testTimeout` ARTIRILMAZ (bkz. AGENTS.md Test Disiplini): o, başka
 * testlerdeki gerçek takılmaları gizler. Süre yalnızca bölünemeyen bu boot
 * testlerine, gerekçesiyle verilir. Kapı `pnpm -r` ile bütün paketlerin
 * kapsamını yan yana koştuğu için 5 sn yüklü makinede yetmiyor.
 */
const BOOT_TIMEOUT_MS = 20_000;

describe('bootShowcase', () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    document.body.replaceChildren();
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
    Reflect.deleteProperty(root, 'requestFullscreen');
    const showcase = root.querySelector('.vol-showcase-root');
    if (showcase) Reflect.deleteProperty(showcase, 'requestFullscreen');
  });

  it('kök verilmezse başlatmayı reddeder', async () => {
    await expect(bootShowcase(null)).rejects.toThrow('#app');
  });

  it(
    'i18n kaynaklarını yükler ve showcase kabuğunu monte eder',
    async () => {
      const session = await bootShowcase(root);

      expect(i18next.getResourceBundle('tr', 'volui')).toBeTruthy();
      expect(i18next.getResourceBundle('en', 'volui')).toBeTruthy();
      expect(root.querySelector('.vol-showcase-root')).not.toBeNull();

      session.destroy();
    },
    BOOT_TIMEOUT_MS,
  );

  it(
    'destroy iki kez çağrılsa da DOM ve dinleyici bırakmaz',
    async () => {
      const session = await bootShowcase(root);

      session.destroy();
      session.destroy();

      expect(root.querySelector('.vol-showcase-root')).toBeNull();
      expect(session.app.element.isConnected).toBe(false);
    },
    BOOT_TIMEOUT_MS,
  );

  it(
    'sayfa kapanışında oturumu kendiliğinden kapatır',
    async () => {
      const session = await bootShowcase(root);

      window.dispatchEvent(new Event('beforeunload'));

      expect(session.app.element.isConnected).toBe(false);
    },
    BOOT_TIMEOUT_MS,
  );

  it(
    'fullscreen butonu geniş tıklama alanıyla ortak controllerı çağırır',
    async () => {
      const requestFullscreen = vi.fn().mockResolvedValue(undefined);
      const session = await bootShowcase(root);
      Object.defineProperty(session.app.element, 'requestFullscreen', {
        configurable: true,
        value: requestFullscreen,
      });
      const button = root.querySelector<HTMLButtonElement>('.vol-showcase-fullscreen-button');
      expect(button?.getAttribute('aria-label')).toBe(i18next.t('volui:app.fullscreen'));

      button?.click();
      await Promise.resolve();
      expect(requestFullscreen).toHaveBeenCalledOnce();
      session.destroy();
    },
    BOOT_TIMEOUT_MS,
  );
});
