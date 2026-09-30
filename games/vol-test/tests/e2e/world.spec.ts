import { expect, test, type Page } from '@playwright/test';

/** Sürücü performans uyarıları (GPU stall vb.) hata değildir; gerçek hatalar toplanır. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function open(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#game > canvas')).toBeVisible();
  await expect(page.getByTestId('hud')).toBeVisible();
}

/** Minimap'in bildirdiği tank konumu (metre). */
async function position(page: Page): Promise<{ x: number; y: number }> {
  const value = (await page.locator('.vt-hud__map').getAttribute('data-position')) ?? '0,0';
  const [x, y] = value.split(',').map(Number);
  return { x: x ?? 0, y: y ?? 0 };
}

/**
 * İnsan basışı gibi birkaç kare süren tuş basışı. Anlık `press` tuşu aynı
 * karede bırakır; kare başında okunan klavye durumu onu görmez.
 */
async function tap(page: Page, key: string): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(80);
  await page.keyboard.up(key);
}

test('oyun açılır, HUD ve kontrol ipuçları görünür, konsol temiz', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  await expect(page.getByTestId('telemetry')).toContainText('m/s');
  await expect(page.getByTestId('control-hints')).toBeVisible();
  await expect(page.getByTestId('touch-boost')).toBeHidden();
  await expect.poll(() => position(page)).toEqual({ x: 64, y: 64 });
  expect(errors).toEqual([]);
});

test('klavyeyle sürülen tank dünyada ilerler', async ({ page }) => {
  await open(page);
  await page.locator('#game > canvas').hover();
  const start = await position(page);
  await page.keyboard.down('d');
  await expect
    .poll(async () => (await position(page)).x, { timeout: 6000 })
    .toBeGreaterThan(start.x + 2);
  await expect(page.getByTestId('telemetry')).not.toContainText('0.0 m/s');
  await page.keyboard.up('d');
});

test('Escape duraklatır, devam düğmesi sürdürür', async ({ page }) => {
  await open(page);
  await tap(page, 'Escape');
  const overlay = page.locator('.vt-pause.vol-modal--visible');
  await expect(overlay).toHaveCount(1);
  await page.getByTestId('pause-resume').click();
  await expect(overlay).toHaveCount(0);
  const start = await position(page);
  await page.keyboard.down('d');
  await expect
    .poll(async () => (await position(page)).x, { timeout: 6000 })
    .toBeGreaterThan(start.x);
  await page.keyboard.up('d');
});

test.describe('kol', () => {
  test.beforeEach(async ({ page }) => {
    // Standart eşlemeli sanal kol: eksenler ve düğmeler sayfadan sürülür.
    await page.addInitScript(() => {
      const pad = {
        id: 'VOL.TEST sanal kol (STANDARD GAMEPAD)',
        index: 0,
        connected: true,
        mapping: 'standard',
        timestamp: 0,
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
        vibrationActuator: null,
      };
      (window as unknown as { __pad: typeof pad }).__pad = pad;
      Object.defineProperty(navigator, 'getGamepads', { value: () => [pad, null, null, null] });
    });
  });

  test('sol çubuk sürer, ipuçları kol glifine geçer, Menu duraklatır', async ({ page }) => {
    await open(page);
    const start = await position(page);
    await page.evaluate(() => {
      const pad = (window as unknown as { __pad: { axes: number[] } }).__pad;
      pad.axes[0] = 1;
    });
    await expect
      .poll(async () => (await position(page)).x, { timeout: 6000 })
      .toBeGreaterThan(start.x + 2);
    await expect
      .poll(() => page.locator('[data-vol-input-glyph] img').first().getAttribute('src'))
      .not.toContain('keyboard');
    await page.evaluate(() => {
      const pad = (
        window as unknown as {
          __pad: { axes: number[]; buttons: { pressed: boolean; value: number }[] };
        }
      ).__pad;
      pad.axes[0] = 0;
      pad.buttons[9].pressed = true;
      pad.buttons[9].value = 1;
    });
    await expect(page.locator('.vt-pause.vol-modal--visible')).toHaveCount(1);
  });
});

test.describe('dokunmatik', () => {
  test.use({ hasTouch: true });

  test("dokunuş HUD'u dokunmatik kipe geçirir, duraklat düğmesi çalışır", async ({ page }) => {
    await open(page);
    await page.touchscreen.tap(300, 500);
    await expect(page.getByTestId('touch-boost')).toBeVisible();
    await expect(page.getByTestId('control-hints')).toBeHidden();
    await page.getByTestId('touch-pause').tap();
    await expect(page.locator('.vt-pause.vol-modal--visible')).toHaveCount(1);
  });

  test('sol dokunmatik çubuk tankı sürer', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Sürükleme dokunuşu CDP ile üretilir (yalnız Chromium).');
    await open(page);
    const start = await position(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 260, y: 520 }],
    });
    for (let step = 1; step <= 8; step++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: 260 + step * 10, y: 520 }],
      });
      await page.waitForTimeout(16);
    }
    await expect
      .poll(async () => (await position(page)).x, { timeout: 6000 })
      .toBeGreaterThan(start.x + 2);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  });
});
