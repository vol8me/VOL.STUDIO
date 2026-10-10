import { expect, test, type Page } from '@playwright/test';
import { openShowcase, selectTab } from './support/determinism';

/**
 * Dokunma denetimlerinin klavye eşdeğeri (UI-10.1; CONTRACT §9: sürükleme/jest tek yol olamaz). Çubukların ok tuşları
 * gerçek tarayıcıda odaklanır ve aynı okumayı üretir; jest dedektörünün yön düğmeleri aynı `onSwipe` yolunu çağırır.
 */
async function openTouch(page: Page): Promise<void> {
  await openShowcase(page);
  await selectTab(page, 'touch');
}

const demoOf = (page: Page, selector: string) =>
  page.locator('.vol-showcase-panel-demo').filter({ has: page.locator(selector) });

test.describe('çubuklar', () => {
  for (const [name, base, expectedDiagonal] of [
    ['Joystick', '.vol-joystick__base', 'x: 0.71  y: 0.71'],
    ['SquareJoystick', '.vol-square-joystick__base', 'x: 1.00  y: 1.00'],
  ] as const) {
    test(`${name}: ok tuşları vektör üretir, bırakınca merkeze döner; odaklanabilir ve adlıdır`, async ({
      page,
    }) => {
      await openTouch(page);
      const stick = page.locator(base).first();
      await stick.scrollIntoViewIfNeeded();
      await expect(stick).toHaveAttribute('role', 'group');
      await expect(stick).toHaveAccessibleName(/.+/);
      const demo = demoOf(page, base).first();

      await stick.focus();
      await expect(stick).toBeFocused();
      await page.keyboard.down('ArrowRight');
      await expect(demo).toContainText('x: 1.00  y: 0.00');
      await page.keyboard.down('ArrowDown');
      await expect(demo).toContainText(expectedDiagonal);
      await page.keyboard.up('ArrowRight');
      await page.keyboard.up('ArrowDown');
      await expect(demo).toContainText('x: 0.00  y: 0.00');
    });

    test(`${name}: klavye odağı görünür halka taşır, odak dışında halka yok`, async ({ page }) => {
      await openTouch(page);
      const stick = page.locator(base).first();
      await stick.scrollIntoViewIfNeeded();
      // `outline-width` çizgisiz kutuda da varsayılan 3px döner; halkanın varlığı stilden okunur.
      const outline = () =>
        stick.evaluate((element) => {
          const style = getComputedStyle(element);
          return `${style.outlineStyle} ${Number.parseFloat(style.outlineWidth)}`;
        });
      await stick.focus();
      // Klavye kipi: `:focus-visible` yalnız klavye modalitesinde eşleşir (WebKit değiştirici tuşu saymaz, ok tuşunu sayar).
      await page.keyboard.press('ArrowRight');
      await expect(stick).toBeFocused();
      expect(await outline()).toBe('solid 2');
      await stick.evaluate((element) => (element as HTMLElement).blur());
      expect((await outline()).startsWith('none')).toBe(true);
    });

    test(`${name}: odak kaybı basılı tuşu bırakır`, async ({ page }) => {
      await openTouch(page);
      const stick = page.locator(base).first();
      await stick.scrollIntoViewIfNeeded();
      await stick.focus();
      await page.keyboard.down('ArrowLeft');
      await expect(demoOf(page, base).first()).toContainText('x: -1.00  y: 0.00');
      await stick.evaluate((element) => (element as HTMLElement).blur());
      await expect(demoOf(page, base).first()).toContainText('x: 0.00  y: 0.00');
      await page.keyboard.up('ArrowLeft');
    });
  }
});

test('SwipeGestureZone: yön düğmeleri jestle aynı olayı üretir (jest tek yol değil)', async ({
  page,
}) => {
  await openTouch(page);
  const demo = demoOf(page, '.vol-swipe-zone').first();
  await demo.scrollIntoViewIfNeeded();
  const buttons = demo.getByRole('button');
  await expect(buttons).toHaveCount(4);

  await buttons.nth(0).focus();
  await page.keyboard.press('Enter');
  // Düğme olayı jestle aynı okuma biçimini ve eşik mesafesini taşır; hız 0'dır (bırakma anı yok).
  await expect(demo).toContainText(/(Left|Sol).*40\s?px.*0\.00\s?px\/ms/);
  await buttons.nth(3).click();
  await expect(demo).toContainText(/(Right|Sağ).*40\s?px/);

  const box = await demo.locator('.vol-swipe-zone').boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 40, box!.y + 70);
  await page.mouse.down();
  await page.mouse.move(box!.x + 200, box!.y + 70, { steps: 8 });
  await page.mouse.up();
  await expect(demo).toContainText(/(Right|Sağ).*\d+\s?px/);
});
