import { expect, test } from '@playwright/test';
test('üretilen build CORE arayüzü ve Phaser canvas açar', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('button')).toBeDisabled();
  expect(errors).toEqual([]);
});
