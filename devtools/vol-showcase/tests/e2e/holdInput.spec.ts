import { expect, test, type Page } from '@playwright/test';
import { selectTab } from './support/determinism';
import { installVirtualPad } from './support/gamepad';

/**
 * Basılı-tutma denetimleri (Hold/Charge/LongPress) fareden bağımsız çalışır: klavye Space/Enter ve kol A
 * aynı basış/bırakış çiftini üretir; azaltılmış harekette işlev değişmez (halka bir dekorasyondur).
 * Şarj süresi vitrinde 1100 ms; iddialar sınıf işaretlerine bakar, metne değil.
 */
const CHARGE = '.vol-charge-button';

/** Süre ölçülür: determinizm düzeneği `performance.now`'u dondurur, bu yüzden sayfa gerçek zamanla açılır. */
async function openLive(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForSelector('[role="tablist"]');
}
const LONG_PRESS = '.vol-long-press-button';

async function holdPad(page: Page, pressed: boolean): Promise<void> {
  await page.evaluate((state) => {
    const pad = window.__virtualPad;
    pad.timestamp += 1;
    pad.buttons[0].pressed = state;
  }, pressed);
}

test.describe('klavye', () => {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test(`ChargeButton Space basılı tutulunca dolar, bırakınca sıfırlanır (hareket: ${reducedMotion})`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion });
      await openLive(page);
      await selectTab(page, 'touch');
      const charge = page.locator(CHARGE).first();
      await charge.scrollIntoViewIfNeeded();
      await charge.focus();

      await page.keyboard.down('Space');
      await expect(charge).toHaveClass(/vol-charge-button--charging/);
      await expect(charge).toHaveAttribute('aria-pressed', 'true');
      await expect(charge).toHaveClass(/vol-charge-button--full/, { timeout: 3000 });
      await page.keyboard.up('Space');
      await expect(charge).not.toHaveClass(/vol-charge-button--charging/);
      await expect(charge).toHaveAttribute('aria-pressed', 'false');
    });
  }

  test('LongPressButton uzun Enter basışı eşiği aşar ve basılı durum sınıfını verir', async ({
    page,
  }) => {
    await openLive(page);
    await selectTab(page, 'touch');
    const press = page.locator(LONG_PRESS).first();
    await press.scrollIntoViewIfNeeded();
    await press.focus();

    await page.keyboard.down('Enter');
    await expect(press).toHaveClass(/vol-long-press-button--pressed/);
    await expect(press).toHaveClass(/vol-long-press-button--long-pressed/, { timeout: 3000 });
    await page.keyboard.up('Enter');
    await expect(press).not.toHaveClass(/vol-long-press-button--pressed/);
  });
});

test.describe('kol', () => {
  test.beforeEach(async ({ page }) => {
    await installVirtualPad(page);
  });

  test('A basılı tutulunca odaktaki ChargeButton dolar; bırakınca durur', async ({ page }) => {
    await openLive(page);
    await selectTab(page, 'touch');
    const charge = page.locator(CHARGE).first();
    await charge.scrollIntoViewIfNeeded();
    await charge.focus();

    await holdPad(page, true);
    await expect(charge).toHaveClass(/vol-charge-button--charging/);
    await expect(charge).toHaveClass(/vol-charge-button--full/, { timeout: 3000 });
    await holdPad(page, false);
    await expect(charge).not.toHaveClass(/vol-charge-button--charging/);
  });
});
