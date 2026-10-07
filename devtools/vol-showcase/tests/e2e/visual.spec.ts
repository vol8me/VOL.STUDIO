import { expect, test, type Page } from '@playwright/test';
import { openShowcase, selectTab, SHOWCASE_TABS, type ShowcaseTab } from './support/determinism';
import { LAYER_SCENARIOS, openLayer } from './support/accessibility';

/**
 * PİKSEL temeli.
 *
 * Geometri kapısı ölçebildiğini ölçer: taşma, kutu boyutu, ezilme. Ölçemediği
 * her şey — renk, kenarlık, gölge, yazı tipi, bir token'ın sessizce düşmesi —
 * ancak görüntü karşılaştırmasıyla yakalanır. Buna karşılık bir piksel farkı
 * NEDEN değiştiğini söylemez; iki katman bu yüzden birbirini tamamlar.
 *
 * Görüntü SEKME PANELİNDEN alınır, sayfanın tamamından değil: kabuk (başlık,
 * sekme çubuğu) her temelde tekrar ederdi ve bir sekmedeki değişiklik on iki
 * dosyayı birden kirletirdi.
 *
 * Temel güncellemesi bilinçli bir eylemdir:
 *   pnpm --filter @volstudio/vol-showcase test:e2e:update
 * Fark beklenmiyorsa güncellemeden önce sebebi bulunur — kapının değeri tam
 * olarak burada, "beklemiyordum" anındadır.
 */
/**
 * Panel KENDİ kaydırıcısıdır (`.vol-tabs__panels` → `overflow: auto`) ve
 * Playwright iç içe bir kaydırıcının görünmeyen kısmını çekemez: kalanı siyah
 * dolgu yapar; temel, sekmenin yalnız görünen kısmını kapsardı.
 *
 * Tek öğeyi açmak YETMEZ: `.vol-showcase-root`, sarmalayıcı ve `body` de
 * 900 px + `overflow: hidden` taşır. Zincirin tamamı açılır.
 *
 * Kaydırma yalnız EKRAN GÖRÜNTÜSÜ için açılır; `layout.spec.ts` gerçek
 * kaydırıcıyı ölçmeye devam eder, yani taşma/dokunma hedefi iddiaları
 * ürünün gerçek yerleşiminden gelir.
 */
const UNSCROLL_PANELS = `
html, body, .vol-showcase-root, .vol-tabs, .vol-tabs__panels,
[role="tabpanel"] {
  height: auto !important;
  max-height: none !important;
  overflow: visible !important;
}`;

/*
 * `freezeEnvironment` rAF'ı ve saati dondurur ama timer tekerleğine
 * (`setInterval`) dokunmaz. Duvar saatiyle işleyen haneler — `touch`
 * sekmesindeki `PauseResumeButton` sayacı (1 sn'lik interval) — karenin ne
 * zaman alındığına göre farklı rakam basar; sözleşme o hane maskelenerek
 * korunur.
 */
const TAB_MASKS: Partial<Record<ShowcaseTab, string>> = {
  touch: '.vol-pause-resume-button__counter',
};

test.describe('görsel sözleşme', () => {
  for (const tab of SHOWCASE_TABS) {
    test(`${tab} sekmesi görsel olarak değişmedi`, async ({ page }) => {
      await openShowcase(page);
      await selectTab(page, tab);
      await page.addStyleTag({ content: UNSCROLL_PANELS });
      const maskSelector = TAB_MASKS[tab];
      await expect(page.locator(`[role="tabpanel"][id$="-panel-${tab}"]`)).toHaveScreenshot(
        `${tab}.png`,
        maskSelector ? { mask: [page.locator(maskSelector)] } : {},
      );
    });
  }
});

/*
 * KATMANLAR VE İKİNCİ KAPLAMA. Sekme panelleri yalnız sayfa içeriğini kapsar; modal, sheet, diyalog
 * kutusu, bildirim, komut paleti ve ekran klavyesi panelin DIŞINDA çizilir. Diyalog kutusunun sayfa
 * içeriğinin arkasında kalması (z-index) bu yüzden hiçbir temelde görünmüyordu. Burada her katman
 * sabit 1280×720 görüntü alanında, iki kaplamada, tam ekran görüntüsüyle korunur.
 */
const SKINS = ['default', 'aurum'] as const;
type Skin = (typeof SKINS)[number];

async function useSkin(page: Page, skin: Skin): Promise<void> {
  if (skin === 'default') return;
  await page.locator('.vol-showcase-skin-button').click();
  await expect(page.locator('.vol-showcase-skin-button')).toHaveAttribute('data-skin', skin);
}

async function pressButton(page: Page, name: string): Promise<void> {
  const button = page.getByRole('button', { name, exact: true }).first();
  await button.scrollIntoViewIfNeeded();
  await button.click();
}

/*
 * Katman görüntüleri TAM sayfadır; arkadaki sayfanın kaydırma ofseti yerleşimi tetikleyiciye göre
 * alt piksel düzeyinde oynatabilir (kenarlarda 2-3 piksel). O yüzden yalnız bu görüntülere dar bir
 * mutlak piksel payı verilir; sekme panelleri sıfır toleransta kalır.
 */
const LAYER_SHOT = { maxDiffPixels: 24, maxDiffPixelRatio: 0.0001 } as const;

test.describe('görsel sözleşme: katmanlar', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  for (const skin of SKINS) {
    for (const scenario of LAYER_SCENARIOS) {
      test(`${scenario.scope} katmanı (${skin})`, async ({ page }) => {
        await openShowcase(page);
        await useSkin(page, skin);
        await openLayer(page, scenario);
        await page.waitForTimeout(300);
        await expect(page).toHaveScreenshot(
          `layer-${skin}-${scenario.scope.replace('/', '-')}.png`,
          LAYER_SHOT,
        );
      });
    }

    test(`diyalog kutusu sayfa içeriğinin üstünde (${skin})`, async ({ page }) => {
      await openShowcase(page);
      await useSkin(page, skin);
      await selectTab(page, 'advanced');
      await pressButton(page, 'Start Dialogue');
      // Daktilo yazımı bitsin: görüntü tam metinle alınır.
      await expect
        .poll(async () => (await page.locator('.vol-dialogue__text').textContent())?.length ?? 0)
        .toBeGreaterThan(60);
      await page.waitForTimeout(300);
      const box = await page.locator('.vol-dialogue').boundingBox();
      expect(box).not.toBeNull();
      const covered = await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.closest('.vol-dialogue') !== null,
        { x: (box?.x ?? 0) + (box?.width ?? 0) / 2, y: (box?.y ?? 0) + (box?.height ?? 0) / 2 },
      );
      expect(covered, 'diyalog kutusu başka bir yüzeyin arkasında kalmamalı').toBe(true);
      await expect(page).toHaveScreenshot(`layer-${skin}-dialogue.png`, LAYER_SHOT);
    });

    test(`bildirim ve komut paleti (${skin})`, async ({ page }) => {
      await openShowcase(page);
      await useSkin(page, skin);
      await selectTab(page, 'panels');
      await pressButton(page, 'Show Info');
      await pressButton(page, 'Show Danger');
      await page.waitForTimeout(300);
      await expect(page).toHaveScreenshot(`layer-${skin}-toast.png`, LAYER_SHOT);
      await selectTab(page, 'advanced');
      await pressButton(page, 'Command Palette');
      await page.waitForTimeout(300);
      await expect(page).toHaveScreenshot(`layer-${skin}-palette.png`, LAYER_SHOT);
    });
  }

  for (const tab of ['buttons', 'cards', 'panels', 'forms'] as const) {
    test(`${tab} sekmesi aurum kaplamasında görsel olarak değişmedi`, async ({ page }) => {
      await openShowcase(page);
      await useSkin(page, 'aurum');
      await selectTab(page, tab);
      await page.addStyleTag({ content: UNSCROLL_PANELS });
      await expect(page.locator(`[role="tabpanel"][id$="-panel-${tab}"]`)).toHaveScreenshot(
        `aurum-${tab}.png`,
      );
    });
  }
});
