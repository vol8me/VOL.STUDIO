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
test.describe('görsel sözleşme', () => {
  for (const tab of SHOWCASE_TABS) {
    test(`${tab} sekmesi görsel olarak değişmedi`, async ({ page }) => {
      await openShowcase(page);
      await selectTab(page, tab);
      await expect(page.locator(`[role="tabpanel"][id$="-panel-${tab}"]`)).toHaveScreenshot(
        `${tab}.png`,
      );
    });
  }
});
