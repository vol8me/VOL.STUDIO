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
  // Tam ekran düğmesi yalnız webde, haritanın ALTINDA.
  const map = (await page.locator('.vt-hud__map').boundingBox())!;
  const fullscreen = (await page.locator('.vt-hud__fullscreen').boundingBox())!;
  expect(fullscreen.y).toBeGreaterThanOrEqual(map.y + map.height);
  expect(fullscreen.x + fullscreen.width).toBeCloseTo(map.x + map.width, 0);
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

test('Space fren: paletler kilitlenir, tank gaz basılıyken bile durur', async ({ page }) => {
  await open(page);
  await page.locator('#game > canvas').hover();
  await page.keyboard.down('d');
  await expect(page.getByTestId('telemetry')).not.toContainText('0.0 m/s', { timeout: 6000 });
  await page.keyboard.down('Space');
  await expect(page.getByTestId('telemetry')).toContainText('Fren');
  await expect(page.getByTestId('telemetry')).toContainText('0.0 m/s', { timeout: 4000 });
  await page.keyboard.up('Space');
  await page.keyboard.up('d');
});

test('atış barı tek atıştan sonra boşalır, bekler ve yeniden hazır olur', async ({ page }) => {
  await open(page);
  const bar = page.locator('.vt-hud__fire-bar');
  await expect(bar).toHaveAttribute('aria-valuenow', '100');
  await page.mouse.move(900, 400);
  await page.mouse.down();
  await expect.poll(async () => Number(await bar.getAttribute('aria-valuenow'))).toBeLessThan(30);
  await page.mouse.up();
  await expect(bar).toHaveAttribute('aria-valuenow', '100');
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
    await expect(page.getByTestId('touch-brake')).toBeVisible();
    await expect(page.getByTestId('control-hints')).toBeHidden();
    await page.getByTestId('touch-pause').tap();
    await expect(page.locator('.vt-pause.vol-modal--visible')).toHaveCount(1);
  });

  test('telefon yatayında HUD parçaları birbirini örtmez', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await open(page);
    await page.touchscreen.tap(420, 200);
    await expect(page.getByTestId('touch-brake')).toBeVisible();
    const selectors = [
      '.vt-hud__touch > :not([hidden])',
      '.vt-hud__map',
      '.vt-hud__fullscreen',
      '.vt-hud__telemetry',
      '.vt-hud__title',
      '.vt-hud__boost-bar',
      '.vt-hud__fire-bar',
      '.vt-hud__climate',
    ];
    const boxes = [];
    for (const selector of selectors) {
      for (const element of await page.locator(selector).all()) {
        const box = await element.boundingBox();
        if (box) boxes.push({ selector, ...box });
      }
    }
    const overlaps: string[] = [];
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const [p, q] = [boxes[a], boxes[b]];
        const apart =
          p.x + p.width <= q.x ||
          q.x + q.width <= p.x ||
          p.y + p.height <= q.y ||
          q.y + q.height <= p.y;
        if (!apart) overlaps.push(`${p.selector}#${a} ∩ ${q.selector}#${b}`);
      }
    }
    expect(overlaps).toEqual([]);
    const pause = (await page.getByTestId('touch-pause').boundingBox())!;
    const zoom = (await page.getByTestId('touch-zoomIn').boundingBox())!;
    const boost = (await page.locator('.vt-hud__boost-bar').boundingBox())!;
    const fire = (await page.locator('.vt-hud__fire-bar').boundingBox())!;
    expect(pause.x + pause.width).toBeLessThan(zoom.x);
    expect(pause.y).toBeCloseTo(zoom.y, 0);
    expect(zoom.x - pause.x - pause.width).toBeLessThan(20);
    expect(fire.x).toBeGreaterThan(boost.x + boost.width);
    expect(fire.y).toBeCloseTo(boost.y, 0);
    for (const box of boxes) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(390);
    }
  });

  test('sağ çubuğun iç bölgesi nişan alır, dış bölgesi hizalanınca ateş eder', async ({ page }) => {
    await open(page);
    await page.touchscreen.tap(640, 400);
    const box = (await page.getByTestId('stick-aim').locator('.vol-joystick__base').boundingBox())!;
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const bar = page.locator('.vt-hud__fire-bar');
    await page.evaluate(({ x, y }) => {
      const target = document.querySelector('[data-testid="stick-aim"] .vol-joystick__base')!;
      target.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          pointerId: 12,
          pointerType: 'touch',
          clientX: x,
          clientY: y,
        }),
      );
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          pointerId: 12,
          pointerType: 'touch',
          clientX: x - 24,
          clientY: y,
        }),
      );
    }, center);
    await page.waitForTimeout(800);
    await expect(bar).toHaveAttribute('aria-valuenow', '100');
    await page.evaluate(
      ({ x, y }) =>
        window.dispatchEvent(
          new PointerEvent('pointermove', {
            bubbles: true,
            pointerId: 12,
            pointerType: 'touch',
            clientX: x - 64,
            clientY: y,
          }),
        ),
      center,
    );
    await expect.poll(async () => Number(await bar.getAttribute('aria-valuenow'))).toBeLessThan(30);
    await page.evaluate(() =>
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 12, pointerType: 'touch' })),
    );
    await expect(bar).toHaveAttribute('aria-valuenow', '100');
    await page.waitForTimeout(800);
    await expect(bar).toHaveAttribute('aria-valuenow', '100');
  });

  test("sabit hareket joystick'i tankı sürer", async ({ page }) => {
    await open(page);
    await page.touchscreen.tap(640, 400);
    const base = page.getByTestId('stick-move').locator('.vol-joystick__base');
    await expect(base).toBeVisible();
    const box = (await base.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const start = await position(page);
    // Joystick işaretçi olaylarını dinler; dokunma işaretçisi sayfadan üretilir.
    await page.evaluate(
      ({ x, y }) => {
        const target = document.querySelector('[data-testid="stick-move"] .vol-joystick__base')!;
        const make = (type: string, clientX: number) =>
          new PointerEvent(type, {
            bubbles: true,
            pointerId: 9,
            pointerType: 'touch',
            clientX,
            clientY: y,
          });
        target.dispatchEvent(make('pointerdown', x));
        window.dispatchEvent(make('pointermove', x + 60));
      },
      { x: cx, y: cy },
    );
    await expect
      .poll(async () => (await position(page)).x, { timeout: 6000 })
      .toBeGreaterThan(start.x + 2);
    await page.evaluate(() =>
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9 })),
    );
  });
});
