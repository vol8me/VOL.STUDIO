import { describe, it, expect, beforeEach } from 'vitest';

/**
 * `main.ts` içe aktarımı CORE UI alt yolunun tamamını Vite'ın dönüştürme
 * hattından geçirir; bu testin süresi o modül grafiğinin maliyetidir, bir
 * takılma değil.
 *
 * Genel `testTimeout` ARTIRILMAZ (bkz. AGENTS.md Test Disiplini): o, başka
 * testlerdeki gerçek takılmaları gizler. Süre yalnızca bölünemeyen bu bütünsel
 * teste, gerekçesiyle verilir. Kapı `pnpm -r` ile tüm paketlerin kapsamını arka
 * arkaya koştuğu için 5 sn yüklü makinede yetmiyor.
 */
const BOOT_TIMEOUT_MS = 20_000;

describe('main', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it(
    'showcase oturumunu #app köküne kurar ve kapatılabilir olarak ihraç eder',
    async () => {
      const root = document.createElement('div');
      root.id = 'app';
      document.body.appendChild(root);

      // Top-level await: import çözüldüğünde boot tamamlanmıştır.
      const { showcaseSession } = await import('../src/main');

      expect(root.querySelector('.vol-showcase-root')).not.toBeNull();
      expect(showcaseSession.app.element.isConnected).toBe(true);

      showcaseSession.destroy();
      expect(root.querySelector('.vol-showcase-root')).toBeNull();
    },
    BOOT_TIMEOUT_MS,
  );
});
