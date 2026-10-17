import { expect, test, type Page } from '@playwright/test';

/**
 * Akıllı tam ekran düğmesi (kabuk üst çubuğu): Android ve gamescope zaten tam ekrandır, Fullscreen API'si olmayan tarayıcıda
 * düğme işe yaramaz. Bu durumlarda düğme HİÇ çizilmez ve dil düğmesi boşalan hücreyi doldurur (boş delik kalmaz).
 * Native ortamlar birim testte (`bootstrap.test.ts`, `platform.test.ts`) sahte kabukla sınanır; burada gerçek yerleşim ölçülür.
 */
const VIEWPORTS = [
  { name: 'masaüstü', width: 1280, height: 800 },
  { name: 'telefon', width: 360, height: 740 },
] as const;

async function open(page: Page, fullscreenApi: boolean): Promise<void> {
  if (!fullscreenApi) {
    await page.addInitScript(() => {
      Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });
      Object.defineProperty(document, 'webkitFullscreenEnabled', {
        configurable: true,
        value: false,
      });
    });
  }
  await page.goto('/');
  await page.waitForSelector('[role="tablist"]');
}

interface Row {
  actions: { left: number; right: number };
  lang: { left: number; right: number; width: number } | null;
  skin: { left: number; right: number; width: number } | null;
  fullscreen: boolean;
  mode: string | null;
}

const measure = (page: Page): Promise<Row> =>
  page.evaluate(() => {
    const box = (selector: string) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, width: r.width };
    };
    const actions = document.querySelector('.vol-showcase-header__actions') as HTMLElement;
    const a = actions.getBoundingClientRect();
    return {
      actions: { left: a.left, right: a.right },
      lang: box('.vol-showcase-lang-button'),
      skin: box('.vol-showcase-skin-button'),
      fullscreen: document.querySelector('.vol-showcase-fullscreen-button') !== null,
      mode: actions.dataset.volFullscreen ?? null,
    };
  });

for (const viewport of VIEWPORTS) {
  test.describe(`tam ekran düğmesi (${viewport.name})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('Fullscreen API varsa düğme vardır ve dil düğmesi satırı onunla paylaşır', async ({
      page,
    }) => {
      await open(page, true);
      const row = await measure(page);
      expect(row.mode).toBe('browser');
      expect(row.fullscreen).toBe(true);
      // Dil düğmesi satırın tamamını almaz: yanında tam ekran düğmesi durur.
      expect(row.lang!.right).toBeLessThan(row.actions.right - 1);
    });

    for (const dir of ['ltr', 'rtl'] as const) {
      test(`API yoksa düğme çizilmez ve dil düğmesi boşalan hücreyi doldurur (${dir})`, async ({
        page,
      }) => {
        await open(page, false);
        if (dir === 'rtl') {
          await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
        }
        const row = await measure(page);
        expect(row.mode).toBe('none');
        expect(row.fullscreen).toBe(false);
        if (viewport.name === 'masaüstü') {
          // Dikey kenar çubuğunda skin üst satırda, dil düğmesi alt satırın TAMAMINDA: ikisi de satırı kaplar.
          expect(Math.abs(row.lang!.left - row.actions.left)).toBeLessThanOrEqual(1);
          expect(Math.abs(row.lang!.right - row.actions.right)).toBeLessThanOrEqual(1);
          expect(Math.abs(row.lang!.width - row.skin!.width)).toBeLessThanOrEqual(1);
        } else {
          // Telefon şeridinde skin ve dil yan yana eşit iki hücredir, sağda boş hücre kalmaz.
          const edge = dir === 'ltr' ? row.actions.right : row.actions.left;
          const outer =
            dir === 'ltr'
              ? Math.max(row.lang!.right, row.skin!.right)
              : Math.min(row.lang!.left, row.skin!.left);
          expect(Math.abs(outer - edge)).toBeLessThanOrEqual(1);
          expect(Math.abs(row.lang!.width - row.skin!.width)).toBeLessThanOrEqual(2);
        }
      });
    }
  });
}
