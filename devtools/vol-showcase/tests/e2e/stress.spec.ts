import { expect, test, type Page } from '@playwright/test';
import { openShowcase, selectTab } from './support/determinism';

/**
 * Etkileşim stresi (UI-13.2): katmanlar açıkken dil ve tema değişimi, art arda aç/kapat. Beklenen: konsolda hata
 * yok, yetim katman/kilit sınıfı kalmaz, açık kalan katman çalışmaya devam eder ya da temiz kapanır.
 */
const LANG_BUTTON = '.vol-showcase-lang-button';
const SKIN_BUTTON = '.vol-showcase-skin-button';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function openOsk(page: Page): Promise<void> {
  await selectTab(page, 'forms');
  await page.getByRole('button', { name: 'Open keyboard', exact: true }).click();
  await page.locator('.vol-osk').waitFor();
}

test('ekran klavyesi açıkken dil değişimi: yetim klavye ya da kilit kalmaz, hata yok', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openShowcase(page);
  await openOsk(page);
  await page.locator(LANG_BUTTON).click();
  await page.waitForTimeout(600);
  const state = await page.evaluate(() => ({
    keyboards: document.querySelectorAll('.vol-osk').length,
    locked: document.body.classList.length,
    activeIsBody: document.activeElement === document.body,
  }));
  expect(state.keyboards, 'en çok bir klavye').toBeLessThanOrEqual(1);
  if (state.keyboards === 1) {
    // Açık kalan klavye çalışmalı: bir tuşa basınca değer metni değişir, Bitti kapatır.
    await page.locator('.vol-osk__key').nth(10).click();
    await page.getByRole('button', { name: /Done|Bitti/ }).click();
    await expect(page.locator('.vol-osk')).toHaveCount(0);
  }
  expect(errors, 'konsol hatası yok').toEqual([]);
});

test('ekran klavyesi açıkken tema değişimi klavyeyi bozmaz', async ({ page }) => {
  const errors = trackErrors(page);
  await openShowcase(page);
  await openOsk(page);
  await page.locator(SKIN_BUTTON).click();
  await page.waitForTimeout(400);
  await expect(page.locator('.vol-osk')).toHaveCount(1);
  await page.getByRole('button', { name: /Cancel|Vazgeç/ }).click();
  await expect(page.locator('.vol-osk')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('katmanları art arda aç/kapat: yetim katman ve kilit sınıfı kalmaz', async ({ page }) => {
  const errors = trackErrors(page);
  await openShowcase(page);
  await selectTab(page, 'panels');
  const open = page.getByRole('button', { name: 'Open Modal', exact: true });
  for (let i = 0; i < 6; i += 1) {
    await open.click();
    await expect(page.locator('.vol-modal--visible')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('.vol-modal--visible')).toHaveCount(0);
  }
  const leftover = await page.evaluate(() => ({
    bodyClasses: [...document.body.classList],
    visibleModals: document.querySelectorAll('.vol-modal--visible').length,
  }));
  expect(leftover.visibleModals).toBe(0);
  expect(leftover.bodyClasses.filter((name) => /lock|modal/i.test(name))).toEqual([]);
  expect(errors).toEqual([]);
});

for (const [label, opener] of [
  ['Open Modal', 'modal'],
  ['Open Sheet', 'sheet'],
] as const) {
  test(`${opener} açıkken dil değişimi (sistem olayı): yetim katman, odak kilidi ya da gövde kilidi kalmaz`, async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await openShowcase(page);
    await selectTab(page, 'panels');
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator('.vol-modal--visible')).toHaveCount(1);
    // Sistem dil değişimi: kapsam arkasındaki düğme programatik tetiklenir.
    await page.evaluate(
      (selector) => document.querySelector<HTMLElement>(selector)?.click(),
      LANG_BUTTON,
    );
    await page.waitForTimeout(800);
    const state = await page.evaluate(() => ({
      visible: document.querySelectorAll('.vol-modal--visible').length,
      bodyClasses: [...document.body.classList],
      inertBody: document.body.hasAttribute('inert'),
    }));
    expect(state.visible, 'görünür katman 0 ya da 1').toBeLessThanOrEqual(1);
    expect(state.bodyClasses.filter((name) => /lock|modal/i.test(name))).toEqual(
      state.visible === 1 ? state.bodyClasses.filter((name) => /lock|modal/i.test(name)) : [],
    );
    expect(state.inertBody).toBe(false);
    // Kullanıcı hâlâ sayfayı kullanabilmeli: Escape ile kapanır, sekme tıklanır.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await selectTab(page, 'buttons');
    expect(errors).toEqual([]);
  });
}
