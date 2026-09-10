import { expect, test, type Page } from '@playwright/test';

/**
 * GameScene gerçek tarayıcıda.
 *
 * `boot.spec.ts` menüyü ve ayarları doğrular ama BAŞLA'ya basmaz; oyun sahnesi
 * orada hiç kurulmaz. `GameScene.ts` birim kapsamında ölçülmez — WebGL, ses ve
 * DOM arayüzünü birlikte kurar. Kapsam şekli kapısındaki gerekçesinin kanıtı
 * bu dosyadır; bekçi dosyanın var olduğunu ve bu sahneyi andığını doğrular.
 */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function startRun(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /BAŞLA|START/i }).click();
  const stats = page.locator('.vol-hud-stats');
  await expect(stats).toBeVisible();
  /* Satır sırası: skor, öldürme, süre, flux. */
  return stats.locator('.vol-hud-stats__line').nth(2);
}

test.describe('GameScene — gerçek tarayıcıda koşu', () => {
  test('BAŞLA koşuyu kurar: HUD görünür, süre ilerler, girdi kabul edilir', async ({ page }) => {
    const errors = collectErrors(page);
    const time = await startRun(page);

    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.locator('.vol-hud__slot--health')).toBeVisible();

    const first = await time.textContent();
    await expect.poll(() => time.textContent(), { timeout: 10_000 }).not.toBe(first);

    await page.keyboard.down('KeyD');
    await page.waitForTimeout(400);
    await page.keyboard.up('KeyD');

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('ESC duraklatır ve süreyi dondurur; devam koşuyu sürdürür', async ({ page }) => {
    const errors = collectErrors(page);
    const time = await startRun(page);
    const first = await time.textContent();
    await expect.poll(() => time.textContent(), { timeout: 10_000 }).not.toBe(first);

    await page.keyboard.press('Escape');
    const overlay = page.locator('.vol-pause-overlay--visible');
    await expect(overlay).toBeVisible();

    const paused = await time.textContent();
    await page.waitForTimeout(1_500);
    expect(await time.textContent()).toBe(paused);

    await overlay.getByRole('button').first().click();
    await expect(overlay).toHaveCount(0);
    await expect.poll(() => time.textContent(), { timeout: 10_000 }).not.toBe(paused);

    expect(errors, errors.join('\n')).toEqual([]);
  });
});
