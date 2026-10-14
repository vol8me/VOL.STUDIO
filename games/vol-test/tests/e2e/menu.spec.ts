import { expect, test, type Page } from '@playwright/test';

/** Sürücü performans uyarıları hata değildir; gerçek hatalar toplanır. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('oyun ana menüyle açılır; vitrin çizilir, dünya ve HUD henüz yoktur, konsol temiz', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.getByTestId('menu')).toBeVisible();
  await expect(page.locator('#game > canvas')).toBeVisible();
  await expect(page.getByTestId('hud')).toHaveCount(0);
  await expect(page.getByTestId('menu-play')).toBeFocused();
  expect(errors).toEqual([]);
});

test('alıştırma dünyası açılır; duraklatma menüsündeki ana menü düğmesi menüye döner', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('menu-practice').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('pause-menu').click();
  await expect(page.getByTestId('menu')).toBeVisible();
  await expect(page.getByTestId('hud')).toHaveCount(0);
});

test('garaj: araç seçimi kalıcıdır, alıştırma seçilen araçla açılır', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('menu-play').click();
  await expect(page.getByTestId('garage')).toBeVisible();
  const arachnid = page.getByTestId('garage-vehicle-arachnid').locator('.vol-card__action');
  await arachnid.click();
  await expect(arachnid).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('garage-back').click();
  await expect(page.getByTestId('menu')).toBeVisible();
  await page.reload();
  await page.getByTestId('menu-play').click();
  await expect(arachnid).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('garage-practice').click();
  await expect(page.getByTestId('hud')).toBeVisible();
});

test('ayarlar: dil değişimi menüye yansır ve yeniden açılışta korunur', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('menu-settings').click();
  await expect(page.getByTestId('settings')).toBeVisible();
  await page.getByTestId('settings-language').getByRole('radio', { name: 'English' }).click();
  await expect(page.getByTestId('settings-back')).toHaveAttribute('aria-label', 'Back');
  await page.getByTestId('settings-back').click();
  await expect(page.getByTestId('menu-play')).toHaveText('Join the war');
  await page.reload();
  await expect(page.getByTestId('menu-play')).toHaveText('Join the war');
});

test('dar ekranda menü ve garaj panelleri ekrana sığar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('/');
  const fits = async (id: string): Promise<void> => {
    const box = await page.getByTestId(id).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390 + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(780 + 1);
  };
  await fits('menu');
  await page.getByTestId('menu-play').click();
  await fits('garage');
});

/** Telefonda garajın her parçası ekran içinde ve erişilebilir olmalı; kullanıcı kaydırma aramamalı. */
async function garageReport(page: Page) {
  return page.evaluate(() => {
    const rect = (selector: string): DOMRect =>
      document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
    const body = document.querySelector<HTMLElement>('.vt-screen__body')!;
    const cards = document.querySelector<HTMLElement>('.vt-garage__cards')!;
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      bodyScrolls: body.scrollHeight > body.clientHeight + 1,
      cardsScrollX: cards.scrollWidth > cards.clientWidth + 1,
      cardsScrollY: cards.scrollHeight > cards.clientHeight + 1,
      join: rect('[data-testid="garage-join"]'),
      name: rect('[data-testid="garage-name"]'),
      faction: rect('[data-testid="garage-faction"]'),
      stage: rect('.vt-garage__stage'),
    };
  });
}

test('telefon dikey: garaj kaymadan sığar, araçlar yatay şeritte kayar, katılım formu görünür', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('menu-play').click();
  await page.getByTestId('garage').waitFor();
  const report = await garageReport(page);
  expect(report.bodyScrolls, 'gövde kaymadan sığar').toBe(false);
  expect(report.cardsScrollX, 'araç şeridi yatay kayar').toBe(true);
  for (const box of [report.name, report.faction, report.join]) {
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(report.vh);
  }
  // Sunum alanı araçları çizecek kadar yüksek kalır.
  expect(report.stage.height).toBeGreaterThanOrEqual(120);
});

test('telefon yatay: garaj tek alt çubukla sığar, kartlar sütunda dikey kayar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/');
  await page.getByTestId('menu-play').click();
  await page.getByTestId('garage').waitFor();
  const report = await garageReport(page);
  expect(report.bodyScrolls, 'gövde kaymadan sığar').toBe(false);
  expect(report.cardsScrollY, 'kartlar sütunda dikey kayar').toBe(true);
  for (const box of [report.name, report.faction, report.join]) {
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(report.vh);
  }
  expect(report.join.height).toBeGreaterThan(0);
});
