import { expect, test, type Page } from '@playwright/test';

/**
 * Asset Studio'nun gerçek tarayıcıdaki kritik akışı.
 *
 * Bu dosyanın var olma sebebi somut: bütün sunucu testleri `frontend: 'none'`
 * ile koşarken Vite ara katmanı `/api/**` isteklerini yutuyordu ve uygulama
 * geliştirme modunda katalogu HİÇ yükleyemiyordu. Tek bir gerçek tarayıcı
 * yüklemesi o hatayı ilk saniyede gösterirdi.
 */

async function waitForCatalog(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.studio-shell')).toBeVisible();
  await expect(page.locator('.asset-card').first()).toBeVisible({ timeout: 30_000 });
}

test('kütüphane gerçek repo varlıklarıyla yüklenir', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`);
  });

  await waitForCatalog(page);

  await expect(page.locator('.studio-state[data-state="error"]')).toBeHidden();
  expect(await page.locator('.asset-card').count()).toBeGreaterThan(0);
  expect(failures).toEqual([]);
});

test('API aynı origin üzerinden JSON döndürür', async ({ page, baseURL }) => {
  // SPA fallback regresyonunun tarayıcı tarafındaki bekçisi.
  const response = await page.request.get(`${baseURL}/api/v1/catalog`);

  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/json');
  const body = (await response.json()) as { assets: unknown[] };
  expect(body.assets.length).toBeGreaterThan(0);
});

test('Jura ve Exo 2 gerçekten yüklenir', async ({ page }) => {
  await waitForCatalog(page);

  // Font DOSYALARI 200 dönmeli: yol yanlışsa tarayıcı sessizce yedek fonta düşer.
  const fontResponses = await page.evaluate(() => {
    const families = ['Jura', 'Exo 2'];
    const loaded = [...document.fonts].map((face) => face.family.replace(/["']/g, ''));
    return families.map((family) => ({ family, present: loaded.includes(family) }));
  });
  for (const font of fontResponses) {
    expect(font.present, `${font.family} yüklenmedi`).toBe(true);
  }

  const computed = await page
    .locator('.studio-brand__name')
    .evaluate((node) => getComputedStyle(node).fontFamily);
  expect(computed.toLowerCase()).toContain('jura');
});

test('istemci paketinde Phaser kalıntısı yoktur', async ({ page }) => {
  const scripts: string[] = [];
  page.on('response', (response) => {
    const url = response.url();
    if (url.endsWith('.js') || url.includes('/src/')) scripts.push(url);
  });

  await waitForCatalog(page);

  expect(scripts.some((url) => /phaser/i.test(url))).toBe(false);
});

test('Quick Look bir varlık seçilince açılır ve kapanır', async ({ page }) => {
  await waitForCatalog(page);

  await page.locator('.asset-card').first().click();
  const quickLook = page.locator('.quick-look');
  await expect(quickLook).toHaveClass(/quick-look--open/);

  await quickLook.locator('.quick-look__close').click();
  await expect(quickLook).not.toHaveClass(/quick-look--open/);
});
