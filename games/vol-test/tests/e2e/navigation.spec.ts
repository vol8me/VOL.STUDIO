import { expect, test, type Page } from '@playwright/test';

const OPEN = /vol-modal--visible/;
const PAD = { a: 0, b: 1, start: 9, down: 13 } as const;

async function frames(page: Page, count = 3): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        const next = (): void => {
          if (--count === 0) resolve();
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
    count,
  );
}

async function key(page: Page, value: string): Promise<void> {
  await page.keyboard.down(value);
  await frames(page);
  await page.keyboard.up(value);
  await frames(page);
}

async function installPad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let pressed: number[] = [];
    document.addEventListener('vol-test:pad', (event) => {
      pressed = (event as CustomEvent<number[]>).detail;
    });
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [
        {
          id: 'E2E standard controller',
          index: 0,
          connected: true,
          mapping: 'standard',
          axes: [0, 0, 0, 0],
          timestamp: performance.now(),
          buttons: Array.from({ length: 17 }, (_, index) => ({
            pressed: pressed.includes(index),
            touched: pressed.includes(index),
            value: pressed.includes(index) ? 1 : 0,
          })),
        },
      ],
    });
  });
}

async function pad(page: Page, button: number): Promise<void> {
  await page.evaluate((button) => {
    document.dispatchEvent(new CustomEvent('vol-test:pad', { detail: [button] }));
  }, button);
  await frames(page);
  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('vol-test:pad', { detail: [] }));
  });
  await frames(page);
}

test('klavye gezinmesi: menü, garaj, ayarlar ve iç duraklatma ekranı tek geri sahibiyle dolaşılır', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByTestId('menu-play')).toBeFocused();
  await key(page, 'ArrowDown');
  await expect(page.getByTestId('menu-practice')).toBeFocused();
  await key(page, 'ArrowDown');
  await expect(page.getByTestId('menu-settings')).toBeFocused();
  await key(page, 'Enter');
  await expect(page.getByTestId('settings')).toBeVisible();
  await key(page, 'Escape');
  await expect(page.getByTestId('menu-play')).toBeFocused();
  await key(page, 'Enter');
  await expect(page.getByTestId('garage')).toBeVisible();
  await key(page, 'Escape');
  await expect(page.getByTestId('menu-play')).toBeFocused();
  await key(page, 'ArrowDown');
  await key(page, 'Enter');
  await expect(page.getByTestId('hud')).toBeVisible({ timeout: 30_000 });
  await key(page, 'Escape');
  await expect(page.getByTestId('pause-resume')).toBeFocused();
  await key(page, 'ArrowDown');
  await expect(page.getByTestId('pause-settings')).toBeFocused();
  await key(page, 'Enter');
  await expect(page.getByTestId('settings')).toBeVisible();
  await key(page, 'Escape');
  await expect(page.getByTestId('settings')).toBeHidden();
  await expect(page.getByTestId('pause-settings')).toBeFocused();
  await expect(page.locator('.vt-pause')).toHaveClass(OPEN);
  await key(page, 'Escape');
  await expect(page.locator('.vt-pause')).not.toHaveClass(OPEN);
  expect(errors).toEqual([]);
});

test('kol gezinmesi: D-pad/A/B ile tam menü döngüsü; oynanış B fren, Start tek duraklatma sahibidir', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await installPad(page);
  await page.goto('/');
  await expect(page.getByTestId('menu-play')).toBeFocused();
  await pad(page, PAD.a);
  await expect(page.getByTestId('garage')).toBeVisible();
  await pad(page, PAD.b);
  await expect(page.getByTestId('menu-play')).toBeFocused();
  await pad(page, PAD.down);
  await expect(page.getByTestId('menu-practice')).toBeFocused();
  await pad(page, PAD.a);
  await expect(page.getByTestId('hud')).toBeVisible({ timeout: 30_000 });
  await pad(page, PAD.b);
  await expect(page.locator('.vt-pause')).not.toHaveClass(OPEN);
  await pad(page, PAD.start);
  await expect(page.getByTestId('pause-resume')).toBeFocused();
  await pad(page, PAD.down);
  await expect(page.getByTestId('pause-settings')).toBeFocused();
  await pad(page, PAD.a);
  await expect(page.getByTestId('settings')).toBeVisible();
  await pad(page, PAD.b);
  await expect(page.getByTestId('settings')).toBeHidden();
  await expect(page.getByTestId('pause-settings')).toBeFocused();
  await expect(page.locator('.vt-pause')).toHaveClass(OPEN);
  await pad(page, PAD.b);
  await expect(page.locator('.vt-pause')).not.toHaveClass(OPEN);
  await pad(page, PAD.start);
  await expect(page.getByTestId('pause-resume')).toBeFocused();
  for (const id of ['pause-settings', 'pause-dev', 'pause-online', 'pause-menu']) {
    await pad(page, PAD.down);
    await expect(page.getByTestId(id)).toBeFocused();
  }
  await pad(page, PAD.a);
  await expect(page.getByTestId('menu-play')).toBeFocused();
  await expect(page.getByTestId('hud')).toHaveCount(0);
  await pad(page, PAD.a);
  await expect(page.getByTestId('garage')).toBeVisible();
  await pad(page, PAD.b);
  await expect(page.getByTestId('menu-play')).toBeFocused();
  expect(errors).toEqual([]);
});
