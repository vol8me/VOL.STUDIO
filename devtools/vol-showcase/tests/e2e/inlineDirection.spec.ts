import { expect, test, type Page } from '@playwright/test';
import { PHONE_VIEWPORT, selectTab } from './support/determinism';

/**
 * Yazı yönü (UI-05.3 / UI-07.2): sırası okuma yönünü izleyen yapılar RTL'de gerçekten aynalanır. jsdom yerleşim
 * hesaplamadığı için "aktif slayt görünür alanın içinde mi" ve "sol ok sonraki sekmeyi seçiyor mu" yalnızca
 * burada gerçek tarayıcıda ölçülür. Fiziksel denetimler (kaydırıcı, kart destesi) aynalanmaz; onların kanıtı
 * `valueEditors.spec.ts` ve `swipeStack.spec.ts`.
 */
async function open(page: Page, dir: 'ltr' | 'rtl'): Promise<void> {
  await page.goto(dir === 'rtl' ? '/?dir=rtl' : '/');
  await page.waitForSelector('[role="tablist"]');
}

/** Slaytın görünür pencere (viewport) kutusuna yatayda tamamen sığıp sığmadığı. */
async function slideWithinViewport(page: Page, index: number): Promise<boolean> {
  return page.evaluate((slideIndex) => {
    const viewport = document.querySelector('.vol-carousel__viewport')!.getBoundingClientRect();
    const slide = document
      .querySelectorAll('.vol-carousel__slide')
      [slideIndex].getBoundingClientRect();
    return slide.left >= viewport.left - 1 && slide.right <= viewport.right + 1;
  }, index);
}

for (const dir of ['ltr', 'rtl'] as const) {
  test(`carousel: aktif slayt görünür alandadır, ok/düğme okuma yönünde ilerler (${dir})`, async ({
    page,
  }) => {
    await open(page, dir);
    await selectTab(page, 'scroll');
    const carousel = page.locator('.vol-carousel').first();
    await carousel.scrollIntoViewIfNeeded();

    expect(await slideWithinViewport(page, 0), `${dir}: ilk slayt görünür`).toBe(true);
    expect(await slideWithinViewport(page, 1), `${dir}: ikinci slayt henüz dışarıda`).toBe(false);

    // Klavye: ileri ok okuma yönündedir (LTR sağ, RTL sol).
    await carousel.locator('.vol-carousel__dot[aria-selected="true"]').focus();
    await page.keyboard.press(dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight');
    await expect
      .poll(() => slideWithinViewport(page, 1), {
        message: `${dir}: ileri ok ikinci slaytı getirir`,
      })
      .toBe(true);
    expect(await slideWithinViewport(page, 0)).toBe(false);

    // Ters yön geri döner.
    await page.keyboard.press(dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft');
    await expect
      .poll(() => slideWithinViewport(page, 0), { message: `${dir}: geri ok ilk slayda döner` })
      .toBe(true);

    // Fiziksel sol/sağ düğmeler: RTL'de sol düğme "sonraki"dir (ad ve kenar kilidi yöne uyar).
    const arrows = carousel.locator('.vol-carousel__arrow');
    const left = arrows.first();
    const right = arrows.last();
    await left.hover();
    const forwardLabel = /next|sonraki/i;
    const backLabel = /prev|önceki/i;
    await expect(left).toHaveAttribute('aria-label', dir === 'rtl' ? forwardLabel : backLabel);
    await expect(right).toHaveAttribute('aria-label', dir === 'rtl' ? backLabel : forwardLabel);
    // Sayfa 0'da yalnız "önceki" düğme kenarda kapalıdır: LTR'de sol, RTL'de sağ.
    await expect(left).toHaveAttribute('aria-disabled', dir === 'rtl' ? 'false' : 'true');
    await expect(right).toHaveAttribute('aria-disabled', dir === 'rtl' ? 'true' : 'false');
    if (dir === 'rtl') {
      await left.click();
      await expect.poll(() => slideWithinViewport(page, 1)).toBe(true);
    } else {
      await right.click();
      await expect.poll(() => slideWithinViewport(page, 1)).toBe(true);
    }
  });
}

for (const dir of ['ltr', 'rtl'] as const) {
  for (const layout of ['yatay (dar)', 'dikey (geniş)'] as const) {
    test(`sekme çubuğu ${layout}: ok okuma yönünde sonraki sekmeyi seçer (${dir})`, async ({
      page,
    }) => {
      if (layout === 'yatay (dar)') await page.setViewportSize(PHONE_VIEWPORT.viewport);
      await open(page, dir);
      const tabs = page.locator('[role="tablist"] [role="tab"]:not(.vol-carousel__dot)');
      const first = tabs.first();
      await first.focus();
      const orientation = await page
        .locator('[role="tablist"]:has(> [role="tab"]:not(.vol-carousel__dot))')
        .first()
        .evaluate((element) => getComputedStyle(element).flexDirection);
      // Dikey çubukta ok yukarı/aşağıdır ve yönden bağımsızdır; yatayda "ileri" okuma yönündedir.
      const vertical = layout === 'dikey (geniş)';
      expect(orientation === 'column', `${layout}: beklenen yerleşim`).toBe(vertical);
      const forward = vertical ? 'ArrowDown' : dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
      const backward = vertical ? 'ArrowUp' : dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
      const firstId = await first.getAttribute('id');
      await page.keyboard.press(forward);
      await expect(first).toHaveAttribute('aria-selected', 'false');
      await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press(backward);
      await expect(page.locator(`[role="tab"][id="${firstId}"]`)).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });
  }
}

test('gizli sekme paneli etkileşimsizdir: içindeki denetime Tab ulaşmaz', async ({ page }) => {
  await open(page, 'ltr');
  await selectTab(page, 'buttons');
  const hidden = await page.evaluate(() => {
    const inactive = [...document.querySelectorAll('[role="tabpanel"][aria-hidden="true"]')];
    return {
      count: inactive.length,
      allInert: inactive.every((panel) => (panel as HTMLElement).inert),
    };
  });
  expect(hidden.count).toBeGreaterThan(0);
  expect(hidden.allInert, 'gizli paneller inert').toBe(true);
  // Odaklanılabilirlik: gizli panel içindeki hiçbir denetim odağı alamaz.
  const focusable = await page.evaluate(() => {
    const inactive = [...document.querySelectorAll('[role="tabpanel"][aria-hidden="true"]')];
    return inactive.some((panel) => {
      const target = panel.querySelector<HTMLElement>('button, input, [tabindex]');
      if (!target) return false;
      target.focus();
      return document.activeElement === target;
    });
  });
  expect(focusable, 'gizli paneldeki denetim odak alamaz').toBe(false);
});
