import { expect, test } from '@playwright/test';

test('hava seçenekleri gönderilen oyunda uygulanır, bilinmeyen değer reddedilir; HUD mevsim yazısı taşımaz', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const [kind, applied] of [
    ['rain', 'rain'],
    ['snow', 'snow'],
    ['dust', 'dust'],
    ['unknown', 'clear'],
  ] as const) {
    await page.goto(`/?start=world&weather=${kind}`);
    await expect(page.getByTestId('hud')).toBeVisible();
    await expect(page.getByTestId('hud')).toHaveAttribute('data-weather', applied);
    await expect(page.getByTestId('hud')).toHaveAttribute('data-season', 'spring');
    await expect(page.locator('.vt-hud__climate')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
