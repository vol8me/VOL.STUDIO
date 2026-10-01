import { expect, test } from '@playwright/test';

test('senaryo ve tohum tercihi tekrar açılışta korunur; boş dünya geri seçilebilir', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByTestId('hud')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('pause-scenario').click();
  await page.locator('.vol-select__listbox [data-value="multitank"]').click();
  await page.getByTestId('pause-seed').fill('42');
  await page.getByTestId('pause-seed').press('Enter');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('device.voltest.preferences')))
    .toContain('"seed":42');
  await page.getByTestId('pause-resume').click();
  await expect(page.locator('.vt-pause.vol-modal--visible')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('hud')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-scenario')).toContainText('Çoklu tank');
  await expect(page.getByTestId('pause-seed')).toHaveValue('42');
  await page.getByTestId('pause-scenario').click();
  await page.locator('.vol-select__listbox [data-value="empty"]').click();
  await page.getByTestId('pause-resume').click();
  expect(errors).toEqual([]);
});
