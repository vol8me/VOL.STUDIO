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

test('ayar Sheet’i telefon, tablet ve masaüstünde taşmadan kurallı çizilir', async ({
  browser,
}) => {
  const viewports = [
    { width: 360, height: 800, mobile: true },
    { width: 800, height: 360, mobile: true },
    { width: 800, height: 1280, mobile: true },
    { width: 1280, height: 800, mobile: false },
  ];
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport,
      isMobile: viewport.mobile,
      hasTouch: viewport.mobile,
      userAgent: viewport.mobile
        ? 'Mozilla/5.0 (Linux; Android 16; Mobile) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36'
        : undefined,
    });
    const page = await context.newPage();
    await page.goto('/');
    const gear = page.getByRole('button', { name: /^(SEÇENEKLER|OPTIONS)$/i });
    const fullscreen = page.getByRole('button', { name: /TAM EKRAN|FULLSCREEN/i });
    await gear.click();
    await page.locator('[data-option="haptics"]').evaluate((element) => {
      (element as HTMLElement).hidden = false;
    });
    const close = page.locator('.vol-sheet__close');
    const sizes = await Promise.all(
      [gear, fullscreen, close].map((button) => button.boundingBox()),
    );
    expect(new Set(sizes.map((box) => `${box?.width}×${box?.height}`)).size).toBe(1);

    const geometry = await page.evaluate(() => {
      const dialog = document.querySelector<HTMLElement>('.vol-sheet .vol-modal__content')!;
      const body = document.querySelector<HTMLElement>('.vol-sheet__body')!;
      const dialogRect = dialog.getBoundingClientRect();
      const bodyRect = body.getBoundingClientRect();
      const controls = [...document.querySelectorAll<HTMLElement>('.vol-settings-row')].map(
        (row) => {
          const control = row.querySelector<HTMLElement>('.vol-settings-row__control')!;
          const rect = control.getBoundingClientRect();
          return { left: rect.left, right: rect.right };
        },
      );
      return {
        documentOverflow:
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
        bodyOverflow: body.scrollWidth - body.clientWidth,
        dialogLeft: dialogRect.left,
        dialogRight: dialogRect.right,
        controls,
        offenders: [...body.querySelectorAll<HTMLElement>('*')]
          .map((element) => ({
            className: element.className,
            left: element.getBoundingClientRect().left,
            right: element.getBoundingClientRect().right,
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
          }))
          .filter(
            (item) =>
              item.left < bodyRect.left - 1 ||
              item.right > bodyRect.right + 1 ||
              item.scrollWidth > item.clientWidth + 1,
          ),
      };
    });
    expect(geometry.documentOverflow).toBeLessThanOrEqual(0);
    expect(geometry.bodyOverflow, JSON.stringify(geometry.offenders, null, 2)).toBeLessThanOrEqual(
      0,
    );
    expect(
      geometry.controls.every(
        (control) =>
          control.left >= geometry.dialogLeft - 1 && control.right <= geometry.dialogRight + 1,
      ),
    ).toBe(true);

    await page.locator('[data-option="fps"] .vol-checkbox').click();
    const meter = page.locator('.vol-life-fps-meter');
    await expect(meter).toBeVisible();
    expect(
      await meter.evaluate((element) => Number(getComputedStyle(element).zIndex)),
    ).toBeGreaterThan(
      Number(
        await page.locator('.vol-sheet').evaluate((element) => getComputedStyle(element).zIndex),
      ),
    );
    await context.close();
  }
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
