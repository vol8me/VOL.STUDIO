import { expect, test, type Page } from '@playwright/test';

/**
 * Skin değiştirici (üst çubuk): kök eleman `data-vol-theme` taşır, renk tokenları gerçekten
 * değişir, seçim yeniden yüklemede kalır, bilinmeyen kayıt varsayılana düşer. Ses paleti ve imleç
 * vurgusu aynı değişikliğe bağlıdır (birim testleri `followTheme`i, burada yalnız tarayıcı yüzü sınanır).
 */
const brand = (page: Page) =>
  page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--vol-ui-brand-solid').trim(),
  );

test('skin düğmesi iki kaplama arasında döner; renk tokenı ve etiket değişir', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('[role="tablist"]');
  const button = page.locator('.vol-showcase-skin-button');
  await expect(button).toHaveAttribute('data-skin', 'default');
  const before = await brand(page);
  await button.click();
  await expect(button).toHaveAttribute('data-skin', 'aurum');
  expect(await page.evaluate(() => document.documentElement.dataset.volTheme)).toBe('aurum');
  expect(await brand(page)).not.toBe(before);
  await button.click();
  await expect(button).toHaveAttribute('data-skin', 'default');
  expect(await brand(page)).toBe(before);
});

test('seçim yeniden yüklemede kalır; bilinmeyen kayıtlı skin varsayılana döner', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForSelector('[role="tablist"]');
  await page.locator('.vol-showcase-skin-button').click();
  await expect(page.locator('.vol-showcase-skin-button')).toHaveAttribute('data-skin', 'aurum');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('device.volui:theme')))
    .toBe('"aurum"');
  await page.reload();
  await page.waitForSelector('[role="tablist"]');
  await expect(page.locator('.vol-showcase-skin-button')).toHaveAttribute('data-skin', 'aurum');

  await page.evaluate(() => localStorage.setItem('device.volui:theme', '"yok-boyle-bir-skin"'));
  await page.reload();
  await page.waitForSelector('[role="tablist"]');
  await expect(page.locator('.vol-showcase-skin-button')).toHaveAttribute('data-skin', 'default');
});
