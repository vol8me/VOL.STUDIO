import { expect, test, type Page } from '@playwright/test';
import { selectTab } from './support/determinism';

/**
 * Yükleme ekranı hata yolu: ilerleme yarıda kesilir, hata `role="alert"` ile bildirilir, odak "Tekrar dene"
 * düğmesine gider; yeniden denemek baştan yükler ve ekran kapanır. Süre gerçek zamandır (determinizm düzeneği
 * `performance.now`'u dondurur), bu yüzden sayfa doğrudan açılır.
 */
async function openLive(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForSelector('[role="tablist"]');
}

test('hata: alert + odak Tekrar dene; yeniden deneme tamamlanır; Vazgeç ekranı kapatır', async ({
  page,
}) => {
  await openLive(page);
  await selectTab(page, 'loading');
  const trigger = page.getByRole('button', {
    name: /simulate failed loading|başarısız yüklemeyi dene/i,
  });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();

  const alert = page.locator('.vol-loading [role="alert"]');
  await expect(alert).toBeVisible({ timeout: 10_000 });
  const retry = alert.getByRole('button').first();
  await expect(retry).toBeFocused();
  await expect(page.locator('.vol-loading')).toHaveAttribute('aria-busy', 'false');
  const bar = page.locator('.vol-loading [role="progressbar"]');
  await expect(bar).toHaveAttribute('aria-valuenow', /^(45|60)$/);

  await page.keyboard.press('Enter');
  await expect(alert).toHaveCount(0);
  await expect(page.locator('.vol-loading')).toHaveCount(0, { timeout: 15_000 });

  // Vazgeç: ikinci tur
  await trigger.click();
  await expect(alert).toBeVisible({ timeout: 10_000 });
  await alert.getByRole('button').nth(1).click();
  await expect(page.locator('.vol-loading')).toHaveCount(0, { timeout: 15_000 });
});
