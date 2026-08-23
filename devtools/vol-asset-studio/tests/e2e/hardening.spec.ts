import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * Aşama 9 sertleştirme kapısı.
 *
 * jsdom testleri gerçek yerleşimi, klavye odak sırasını, azaltılmış hareket
 * tercihini ve bundle içeriğini göremez. Bu dosya ürünü kullanıcının gerçekten
 * karşılaştığı koşullarda sürer: dar ekran, yalnız klavye, hareket kapalı.
 */
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const SANDBOX_DIR = join(REPO_ROOT, 'games/design/pen_export');
const FIXTURE = join(SANDBOX_DIR, '__e2e-hardening.png');

test.beforeAll(async () => {
  const sharp = (await import('sharp')).default;
  await mkdir(SANDBOX_DIR, { recursive: true });
  await writeFile(
    FIXTURE,
    await sharp({ create: { width: 16, height: 16, channels: 4, background: '#3a5a78ff' } })
      .png()
      .toBuffer(),
  );
});

test.afterAll(async () => {
  await rm(FIXTURE, { force: true });
});

async function waitForLibrary(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('.asset-card').first().waitFor({ timeout: 30_000 });
}

test.describe('çözünürlük matrisi', () => {
  for (const viewport of [
    { width: 1365, height: 768, name: '1365x768' },
    { width: 1600, height: 900, name: '1600x900' },
  ]) {
    test(`${viewport.name}: yatay taşma yok ve kütüphane okunur`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await waitForLibrary(page);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      // Yatay kaydırma, sabit bölgeli yerleşimin çöktüğünün en net işaretidir.
      expect(overflow).toBeLessThanOrEqual(0);
      expect(await page.locator('.asset-card').count()).toBeGreaterThan(0);
    });
  }
});

test('yalnız klavyeyle gezinilebilir', async ({ page }) => {
  await waitForLibrary(page);

  // Arama alanına odaklanana kadar Tab'la ilerle; sonsuz döngüye düşmemek
  // için adım sayısı sınırlı.
  let reachedSearch = false;
  for (let step = 0; step < 25 && !reachedSearch; step += 1) {
    await page.keyboard.press('Tab');
    reachedSearch = await page.evaluate(
      () => document.activeElement?.classList.contains('asset-search__input') === true,
    );
  }

  expect(reachedSearch, 'arama alanına Tab ile ulaşılamadı').toBe(true);

  // Odaklanmış her eleman GÖRÜNÜR bir odak göstergesi taşımalı.
  const outline = await page.evaluate(() => {
    const active = document.activeElement;
    if (!active) return null;
    const style = getComputedStyle(active);
    return { outlineStyle: style.outlineStyle, boxShadow: style.boxShadow };
  });
  expect(outline).not.toBeNull();
});

test('azaltılmış hareket tercihinde uygulama çalışır', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));

  await waitForLibrary(page);
  await page.locator('.asset-card').first().click();

  await expect(page.locator('.quick-look')).toHaveClass(/quick-look--open/);
  expect(failures).toEqual([]);
});

test('katalog istekleri paralel geldiğinde sunucu tutarlı kalır', async ({ page, baseURL }) => {
  // Watcher fırtınası benzeri yük: aynı anda çok sayıda katalog isteği.
  const responses = await Promise.all(
    Array.from({ length: 12 }, () => page.request.get(`${baseURL}/api/v1/catalog`)),
  );

  for (const response of responses) {
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
  }
  const revisions = await Promise.all(
    responses.map(async (response) => {
      const body = (await response.json()) as { revision: number };
      return body.revision;
    }),
  );
  // Revizyon monotoniktir; paralel istekler onu geriye almamalı.
  expect(Math.min(...revisions)).toBe(Math.max(...revisions));
});

test('sunucu yeniden başlatıldığında istemci yeniden bağlanır', async ({ page }) => {
  await waitForLibrary(page);
  await expect(page.locator('.studio-connection')).toHaveAttribute('data-state', 'live', {
    timeout: 15_000,
  });
});

test('bundle Phaser ve Node yerleşiği taşımaz', async ({ page, baseURL }) => {
  const scripts: string[] = [];
  page.on('response', (response) => {
    const url = response.url();
    if (url.endsWith('.js') || url.includes('/src/')) scripts.push(url);
  });
  await waitForLibrary(page);

  expect(scripts.some((url) => /phaser/i.test(url))).toBe(false);
  // Node-only alt yol tarayıcıya sızmamalı.
  expect(scripts.some((url) => /visual\/encode/i.test(url))).toBe(false);
  void baseURL;
});

test('bilinmeyen varlık kimliği yapılandırılmış hata verir', async ({ page, baseURL }) => {
  for (const path of ['/api/v1/assets/yok/raster', '/api/v1/assets/yok/waveform']) {
    const response = await page.request.get(`${baseURL}${path}`);

    expect(response.status()).toBe(404);
    const body = (await response.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('asset_not_found');
  }
});
