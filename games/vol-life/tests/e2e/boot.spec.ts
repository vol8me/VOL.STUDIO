import { chromium, expect, test, type Page } from '@playwright/test';

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test('üretim kabuğu gerçek WebGL ile açılır ve Sheet kullanılabilir', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto('/');

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(100);
  expect(box?.height ?? 0).toBeGreaterThan(100);

  const options = page.getByRole('button', { name: /^(SEÇENEKLER|OPTIONS)$/i });
  await expect(options).toBeVisible();
  await options.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.vol-sheet__title')).toHaveText(/SEÇENEKLER|OPTIONS/i);

  const themeBackground = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--vol-ui-bg').trim(),
  );
  expect(themeBackground).not.toBe('');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('DPR 2 tarayıcıda kanvas görüntü alanını doldurur', async ({ browser }) => {
  const context = await browser.newContext({
    deviceScaleFactor: 2,
    viewport: { width: 960, height: 640 },
  });
  const page = await context.newPage();
  const errors = collectPageErrors(page);
  await page.goto('/');

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveCSS('width', '960px');
  await expect(canvas).toHaveCSS('height', '640px');
  expect(
    await canvas.evaluate((element) => {
      const canvasElement = element as HTMLCanvasElement;
      return [canvasElement.width, canvasElement.height];
    }),
  ).toEqual([1920, 1280]);
  expect(errors, errors.join('\n')).toEqual([]);
  await context.close();
});

test('WebGL kapalıysa boş ekran yerine çevrilmiş fatal yüzeyi gösterilir', async () => {
  const browser = await chromium.launch({ args: ['--disable-webgl', '--disable-3d-apis'] });
  const page = await browser.newPage();
  await page.goto('/');

  await expect(page.getByRole('alert')).toContainText(/VOL\.LIFE (BAŞLATILAMADI|COULD NOT START)/i);
  await browser.close();
});
