import { expect, test, type Page } from '@playwright/test';
import { selectTab } from './support/determinism';

/**
 * Kart destesi alternatifleri (UI-04.3): sürükleme tek yol değildir (düğmeler), yönler fiziksel ve RTL'den
 * bağımsızdır (ret solda, kabul sağda; kaydırma ve ipucu rozetleriyle aynı), karar duyurusu odaktan bağımsızdır
 * (odak düğmede kalır) ve azaltılmış harekette son durum aynıdır. Düğmesiz klavye modu ile niyet/yakalama
 * ayrıntıları birim testlerindedir (`swipeableCardStack.test.ts`).
 */
const STACK = '.vol-card-stack';

async function openStack(page: Page, query = '/'): Promise<void> {
  await page.goto(query);
  await page.waitForSelector('[role="tablist"]');
  await selectTab(page, 'touch');
  await page.locator(STACK).first().scrollIntoViewIfNeeded();
}

async function drag(page: Page, dx: number): Promise<void> {
  const box = (await page.locator(`${STACK} .vol-card-stack__card:last-child`).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y, { steps: 4 });
  await page.mouse.move(x + dx, y, { steps: 4 });
  await page.mouse.up();
}

const status = (page: Page) => page.locator(`${STACK} [role="status"]`).first();

for (const dir of ['ltr', 'rtl'] as const) {
  test(`düğmeler fiziksel yönü izler: ret solda, kabul sağda (${dir})`, async ({ page }) => {
    await openStack(page, dir === 'rtl' ? '/?dir=rtl' : '/');
    if (dir === 'rtl') await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const reject = (await page.locator('.vol-card-stack__action--reject').boundingBox())!;
    const accept = (await page.locator('.vol-card-stack__action--accept').boundingBox())!;
    expect(reject.x + reject.width, 'ret düğmesi kabulün solunda').toBeLessThan(accept.x);
    // Sürükleme yönüyle aynı: sağa sürükleme kabul eder.
    await drag(page, 200);
    await expect(status(page)).toHaveText(/Accepted: Find the Lost Sword. Cards left: 3/);
  });
}

test('düğmeyle karar canlı bölgeye yazılır ve odak düğmede kalır', async ({ page }) => {
  await openStack(page);
  const accept = page.locator('.vol-card-stack__action--accept');
  // Klavye/kol etkinleştirmesi (fare tıklaması WebKit'te odağı bırakır): odak her kararda düğmede kalmalı.
  await accept.focus();
  await page.keyboard.press('Enter');
  await expect(status(page)).toHaveText(/Accepted: Find the Lost Sword\. Cards left: 3/);
  await expect(accept).toBeFocused();
  // Uçuş (240 ms) bitince düğmeler yeniden etkinleşir; sonraki karar için beklenir.
  await expect(page.locator('.vol-card-stack__action--reject')).toBeEnabled();
  await page.locator('.vol-card-stack__action--reject').click();
  await expect(status(page)).toHaveText(/Rejected: .+\. Cards left: 2/);
});

test('eşik altı sürükleme kartı geri getirir; eşik üstü karar verir', async ({ page }) => {
  await openStack(page);
  await drag(page, 30);
  expect(await status(page).textContent(), 'eşik altı karar vermez').toBe('');
  await drag(page, -220);
  await expect(status(page)).toHaveText(/Rejected: Find the Lost Sword\. Cards left: 3/);
});

test('azaltılmış harekette son durum aynıdır (uçuş yok, deste hemen yeniden çizilir)', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openStack(page);
  await page.locator('.vol-card-stack__action--accept').click();
  await expect(status(page)).toHaveText(/Accepted: Find the Lost Sword\. Cards left: 3/);
  // Uçuş sınıfı hiç eklenmez; düğme hemen yeniden etkinleşir (fiziksel uçuş beklenmez).
  await expect(page.locator(`${STACK} .vol-card-stack__card--flying`)).toHaveCount(0);
  await expect(page.locator('.vol-card-stack__action--accept')).toBeEnabled({ timeout: 500 });
});
