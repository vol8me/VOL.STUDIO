import { expect, test, type Locator } from '@playwright/test';
import { openShowcase, selectTab } from './support/determinism';

/**
 * D5c kapısı — oturum → yetenek tablosu → görünen ayar satırları.
 * İddialar dile değil yapıya bakar: `hidden` attribute'u ve satır sayısı.
 */
test.beforeEach(async ({ page }) => {
  await openShowcase(page);
  await selectTab(page, 'forms');
});

const DEMO = '.vol-display-settings';

async function selectOption(root: Locator, value: string) {
  await root.locator('.vol-select').first().click();
  await root.page().locator(`.vol-select__listbox [role="option"][data-value="${value}"]`).click();
}

test('web/masaüstü oturumunda tüm görüntü satırları sunulur', async ({ page }) => {
  const demo = page.locator(DEMO);
  await expect(demo.locator('.vol-settings-row:visible')).toHaveCount(4);
});

test('gamescope oturumunda pencere kipi ve çözünürlük sunulmaz; kalite kalır', async ({ page }) => {
  const demo = page.locator(DEMO);
  await selectOption(demo, 'gamescope');

  // "Sunulmaz" = disabled değil gizli: satır DOM'da kalır ama görünmez.
  await expect(demo.locator('.vol-settings-row:visible')).toHaveCount(2);
  await expect(demo.locator('.vol-settings-row[hidden]')).toHaveCount(2);

  // Kalite satırı kalır ve seçimi `device` kapsamına yazar.
  const qualitySelect = demo.locator('.vol-settings-row:visible .vol-select').last();
  await qualitySelect.click();
  await page.locator('.vol-select__listbox [role="option"][data-value="low"]').click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('device.volui:display-quality')))
    .toBe('"low"');

  // Web'e dönünce iki satır geri gelir.
  await selectOption(demo, 'web');
  await expect(demo.locator('.vol-settings-row:visible')).toHaveCount(4);
});
