import { expect, test } from '@playwright/test';

test('mevsim etiketi ve hava seçenekleri gönderilen oyunda görünür, bilinmeyen değer reddedilir', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const [kind, label] of [
    ['rain', 'Yağmur'],
    ['snow', 'Kar'],
    ['dust', 'Toz'],
    ['unknown', 'Açık'],
  ] as const) {
    await page.goto(`/?weather=${kind}`);
    await expect(page.getByTestId('hud')).toBeVisible();
    await expect(page.locator('.vt-hud__climate')).toHaveText(`İlkbahar · ${label}`);
  }
  expect(errors).toEqual([]);
});
