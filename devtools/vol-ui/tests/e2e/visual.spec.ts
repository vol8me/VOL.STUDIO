import { expect, test } from '@playwright/test';
import { openShowcase, selectTab, SHOWCASE_TABS } from './support/determinism';

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
 *   pnpm --filter @volstudio/vol-ui test:e2e:update
 * Fark beklenmiyorsa güncellemeden önce sebebi bulunur — kapının değeri tam
 * olarak burada, "beklemiyordum" anındadır.
 */
/**
 * Panel KENDİ kaydırıcısıdır (`.vol-tabs__panels` → `overflow: auto`) ve
 * Playwright iç içe bir kaydırıcının görünmeyen kısmını çekemez: kalanı siyah
 * dolgu yapar. Ölçüldü — temellerin içeriği her sekmede ~715. satırda bitiyor,
 * `advanced` sekmesinin %79'u boştu ve `hud` sekmesinin on yedi kartından
 * yalnız ilk yedisi kapılıydı.
 *
 * Tek öğeyi açmak YETMEZ: ölçüldü, panel 900 px'te kalıyordu çünkü
 * `.vol-showcase-root`, sarmalayıcı ve `body` de 900 px + `overflow: hidden`
 * taşıyor. Zincirin tamamı açılır.
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

test.describe('görsel sözleşme', () => {
  for (const tab of SHOWCASE_TABS) {
    test(`${tab} sekmesi görsel olarak değişmedi`, async ({ page }) => {
      await openShowcase(page);
      await selectTab(page, tab);
      await page.addStyleTag({ content: UNSCROLL_PANELS });
      await expect(page.locator(`[role="tabpanel"][id$="-panel-${tab}"]`)).toHaveScreenshot(
        `${tab}.png`,
      );
    });
  }
});
