import { expect, test } from '@playwright/test';

test('cihaz ayarları yeniden açılışta korunur, ilerleme ayrı kapsamda kalır', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid="hud"]')).toBeVisible();
  await page.keyboard.press('Escape');
  const quality = page.locator('[data-testid="pause-quality"] button');
  await quality.last().click();
  const checkbox = page.locator('[data-testid="pause-haptics"] input');
  await page.locator('[data-testid="pause-haptics"]').click();
  await expect(checkbox).not.toBeChecked();
  const range = page.locator('[data-testid="pause-volume"] input');
  await range.fill('0.3');
  await range.dispatchEvent('change');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('device.voltest.preferences')))
    .toContain('"volume":0.3');
  await page.reload();
  await expect(page.locator('[data-testid="hud"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(checkbox).not.toBeChecked();
  await expect(range).toHaveValue('0.3');
  await expect(quality.last()).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => localStorage.getItem('synced.voltest.preferences'))).toBeNull();
});
