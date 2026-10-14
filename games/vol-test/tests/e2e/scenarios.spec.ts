import { expect, test } from '@playwright/test';

test('senaryo ve tohum tercihi tekrar açılışta korunur; boş dünya geri seçilebilir', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?start=world');
  await expect(page.getByTestId('hud')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('pause-dev').click();
  await page.getByTestId('dev-scenario').click();
  await page.locator('.vol-select__listbox [data-value="multitank"]').click();
  await page.getByTestId('dev-seed').fill('42');
  await page.getByTestId('dev-seed').press('Enter');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('device.voltest.preferences')))
    .toContain('"seed":42');
  await page.getByTestId('dev-back').click();
  await page.getByTestId('pause-resume').click();
  await expect(page.locator('.vt-pause.vol-modal--visible')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('hud')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('pause-dev').click();
  await expect(page.getByTestId('dev-scenario')).toContainText('Çoklu tank');
  await expect(page.getByTestId('dev-seed')).toHaveValue('42');
  await page.getByTestId('dev-scenario').click();
  await page.locator('.vol-select__listbox [data-value="empty"]').click();
  await page.getByTestId('dev-back').click();
  await page.getByTestId('pause-resume').click();
  expect(errors).toEqual([]);
});
