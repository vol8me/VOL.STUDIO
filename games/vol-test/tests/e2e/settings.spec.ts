import { expect, test } from '@playwright/test';

test('cihaz ayarları yeniden açılışta korunur, ilerleme ayrı kapsamda kalır', async ({ page }) => {
  await page.goto('/?start=world');
  await expect(page.locator('[data-testid="hud"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('pause-settings').click();
  const quality = page.locator('[data-testid="settings-quality"] button');
  await quality.last().click();
  // Titreşim satırı yalnız Android ve Deck'te görünür; masaüstünde cihaz ayarı örneği ızgaradır.
  const checkbox = page.locator('[data-testid="settings-grid"] input');
  await page.locator('[data-testid="settings-grid"]').click();
  await expect(checkbox).not.toBeChecked();
  const range = page.locator('[data-testid="settings-volume"] input');
  await range.fill('0.3');
  await range.dispatchEvent('change');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('device.voltest.preferences')))
    .toContain('"volume":0.3');
  await page.reload();
  await expect(page.locator('[data-testid="hud"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('pause-settings').click();
  await expect(checkbox).not.toBeChecked();
  await expect(range).toHaveValue('0.3');
  await expect(quality.last()).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => localStorage.getItem('synced.voltest.preferences'))).toBeNull();
});

test('çizim çözünürlüğü seçimi canvas piksel sayısını anında değiştirir ve yeniden açılışta korunur', async ({
  page,
}) => {
  await page.goto('/?start=world');
  await expect(page.locator('[data-testid="hud"]')).toBeVisible();
  const canvasWidth = (): Promise<number> =>
    page.evaluate(() => document.querySelector('canvas')!.width);
  const full = await canvasWidth();
  await page.keyboard.press('Escape');
  await page.getByTestId('pause-settings').click();
  await page.getByTestId('settings-resolution').click();
  await page.getByRole('option', { name: /^%?50%?$/ }).click();
  // Çizim ölçeği yarıya iner: aynı CSS boyutunda canvas'ın piksel genişliği de yarıya iner.
  await expect.poll(canvasWidth).toBeLessThan(full * 0.6);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('device.voltest.preferences')))
    .toContain('"resolution":0.5');
  await page.reload();
  await expect(page.locator('[data-testid="hud"]')).toBeVisible();
  await expect.poll(canvasWidth).toBeLessThan(full * 0.6);
});
