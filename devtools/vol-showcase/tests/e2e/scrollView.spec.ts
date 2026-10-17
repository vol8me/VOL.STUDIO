import { expect, test, type Locator, type Page } from '@playwright/test';
import { openShowcase, selectTab } from './support/determinism';

/**
 * ScrollView referans kanıtı (UI-08.4): klavye, görünür odak ve odaktaki çocuğun görünür kalması iki motorda.
 * Kaydırma kapsayıcısı odaklanabilirdir (`tabindex=0`); gerisini tarayıcı yapar, bu yüzden sınanan şey tarayıcının
 * yerel davranışını bozmadığımız ve odağın temanın halkasını taşıdığıdır. PageDown/End/Home ve sona varınca
 * kaydırmanın dış panele geçmesi (tuzak yok) `scrollSplit.spec.ts`te; burası onları yinelemez.
 */
const TAB_PANEL = '[role="tabpanel"]:not([aria-hidden="true"])';
const SURFACES = [
  { name: 'ScrollView dikey', selector: `${TAB_PANEL} .vol-scroll-view--vertical` },
  { name: 'ScrollView yatay', selector: `${TAB_PANEL} .vol-scroll-view--horizontal` },
  { name: 'VirtualList', selector: `${TAB_PANEL} .vol-virtual-list` },
] as const;

async function openScrollTab(page: Page): Promise<void> {
  await openShowcase(page);
  await selectTab(page, 'scroll');
}

/** Sekme düğmesinden başlayıp gerçek Tab basışlarıyla hedefe varır: odak klavye kipindedir (`:focus-visible`). */
async function tabTo(page: Page, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  await page.locator('[role="tab"][id$="-tab-scroll"]').focus();
  for (let step = 0; step < 40; step += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error('hedef 40 Tab basışında odaklanmadı');
}

for (const surface of SURFACES) {
  test(`${surface.name}: klavyeyle odaklanınca tema halkasını taşır`, async ({ page }) => {
    await openScrollTab(page);
    const view = page.locator(surface.selector).first();
    await tabTo(page, view);

    const ring = await view.evaluate((element) => {
      const style = getComputedStyle(element);
      const probe = document.createElement('span');
      probe.style.color = 'var(--vol-ui-focus-ring)';
      element.parentElement!.appendChild(probe);
      const token = getComputedStyle(probe).color;
      probe.remove();
      return {
        style: style.outlineStyle,
        width: Number.parseFloat(style.outlineWidth),
        color: style.outlineColor,
        token,
      };
    });
    expect(ring.style).toBe('solid');
    expect(ring.width).toBeGreaterThanOrEqual(2);
    expect(ring.color).toBe(ring.token);
  });
}

test.describe('ok tuşlarıyla kaydırma', () => {
  test('dikey ScrollView: ArrowDown aşağı, ArrowUp yukarı kaydırır', async ({ page }) => {
    await openScrollTab(page);
    const view = page.locator(SURFACES[0].selector).first();
    await view.scrollIntoViewIfNeeded();
    await view.focus();
    const top = () => view.evaluate((element) => element.scrollTop);

    await page.keyboard.press('ArrowDown');
    await expect.poll(top).toBeGreaterThan(0);
    await page.keyboard.press('ArrowUp');
    await expect.poll(top).toBe(0);
  });

  test('yatay ScrollView: ArrowRight sağa, ArrowLeft sola kaydırır', async ({ page }) => {
    await openScrollTab(page);
    const view = page.locator(SURFACES[1].selector).first();
    await view.scrollIntoViewIfNeeded();
    await view.focus();
    const range = await view.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(range).toBeGreaterThan(0);
    const left = () => view.evaluate((element) => element.scrollLeft);

    await page.keyboard.press('ArrowRight');
    await expect.poll(left).toBeGreaterThan(0);
    await page.keyboard.press('ArrowLeft');
    await expect.poll(left).toBe(0);
  });
});

test('içindeki odaklanabilir çocuğa Tab ile gelinince çocuk kaydırma alanında görünür kalır', async ({
  page,
}) => {
  await openScrollTab(page);
  const view = page.locator(SURFACES[0].selector).first();
  await view.scrollIntoViewIfNeeded();
  // Çocuk uzun içeriğin sonuna eklenir: odaklanmadan önce kaydırma alanının dışındadır.
  const hidden = await view.evaluate((element) => {
    const button = document.createElement('button');
    button.textContent = 'son';
    button.id = 'scroll-probe-child';
    element.querySelector('.vol-scroll-view__content')!.appendChild(button);
    const box = element.getBoundingClientRect();
    return button.getBoundingClientRect().top > box.bottom;
  });
  expect(hidden).toBe(true);

  await view.focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#scroll-probe-child')).toBeFocused();

  const inside = await view.evaluate((element) => {
    const child = document.getElementById('scroll-probe-child')!.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    return {
      scrolled: element.scrollTop > 0,
      top: child.top >= box.top - 1,
      bottom: child.bottom <= box.bottom + 1,
    };
  });
  expect(inside).toEqual({ scrolled: true, top: true, bottom: true });
});
