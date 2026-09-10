import { expect, test } from '@playwright/test';

/*
 * MainMenuScene ve SettingsScene gerçek tarayıcıda: birim kapsamı düşük kalan
 * iki sahnenin kapsam şekli kapısındaki kanıtıdır.
 */

test('oyun gerçek tarayıcıda açılır ve ana menü çizilir', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto('/');

  // Kanvas gerçekten kuruldu ve ölçüldü.
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(100);
  expect(box?.height ?? 0).toBeGreaterThan(100);

  // Menü DOM UI'dan gelir; kanvasın açılması onu kanıtlamaz.
  await expect(page.getByRole('button', { name: /BAŞLA|START/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /AYARLAR|SETTINGS/i })).toBeVisible();

  /*
   * Tema token'ları CSS'ten gelir ve bir dönem tamamen tanımsız kalabiliyordu
   * (bkz. VOL.LIFE'ın aynı hatası): fontlar yüklenir ama hiçbir renk uygulanmaz.
   * Token okunabiliyorsa zincir baştan sona kurulmuştur.
   */
  const bg = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--vol-ui-bg').trim(),
  );
  expect(bg).not.toBe('');

  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});

test('ayarlar ekranı açılır ve geri dönülür', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto('/');
  await page.getByRole('button', { name: /AYARLAR|SETTINGS/i }).click();

  // Tuş atama listesi ayarların parçasıdır; masaüstünde görünmelidir.
  await expect(page.locator('.vol-key-bindings')).toBeVisible();
  await expect(page.getByRole('button', { name: /GERİ|BACK/i }).first()).toBeVisible();

  await page
    .getByRole('button', { name: /GERİ|BACK/i })
    .first()
    .click();
  await expect(page.getByRole('button', { name: /BAŞLA|START/i })).toBeVisible();

  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});
