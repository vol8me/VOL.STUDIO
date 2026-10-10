import { expect, test, type Page } from '@playwright/test';
import { cancel, centerOf as touchCenterOf, gesture, release } from '../device/touch';
import { openShowcase, PHONE_VIEWPORT, selectTab } from './support/determinism';

/**
 * Kaydırma yüzeyleri ve SplitPane gerçek tarayıcıda, iki motorda (UI-10.2). Birim testleri sözleşmeyi kilitler
 * (`splitPaneInput.test.ts`, `scrollSurfaces.test.ts`); burada tarayıcının yerleşimi ve odak/kaydırma davranışı sınanır:
 * tutamak gerçek kutusu 24 px (ince işaretçi) ve 44 px (kaba işaretçi/large hedef), sürükleme/iptal/sahiplik, pencere
 * %200-%400 büyütüldüğünde ikinci bölmenin ezilmeden dış panelin kayması, klavyeyle kaydırma ve sanal listenin sınırlı DOM'u.
 * Gerçek dokunma (çok parmak, `touchCancel`) Chromium'da CDP ile; cihazda `tests/device/scrollSplit.spec.ts` ile sürülür.
 */
const SPLIT = '.vol-showcase-workbench-split';
const SEPARATOR = `${SPLIT} .vol-split-pane__separator`;
/** Açık sekme paneli: kapalı Sheet gövdeleri de aynı sınıfı taşır. */
const TAB_PANEL = '[role="tabpanel"]:not([aria-hidden="true"])';

async function openWorkbench(page: Page): Promise<void> {
  await openShowcase(page);
  await selectTab(page, 'workbench');
  await page.locator(SPLIT).scrollIntoViewIfNeeded();
}

interface Geometry {
  split: { w: number; scrollW: number };
  primary: number;
  separator: number;
  secondary: number;
}

async function geometry(page: Page): Promise<Geometry> {
  return page.evaluate(
    ({ split, separator }) => {
      const root = document.querySelector<HTMLElement>(split)!;
      const handle = document.querySelector<HTMLElement>(separator)!;
      const width = (selector: string): number =>
        root.querySelector<HTMLElement>(selector)!.getBoundingClientRect().width;
      return {
        split: { w: root.clientWidth, scrollW: root.scrollWidth },
        primary: width('.vol-split-pane__pane--primary'),
        separator: handle.getBoundingClientRect().width,
        secondary: width('.vol-split-pane__pane--secondary'),
      };
    },
    { split: SPLIT, separator: SEPARATOR },
  );
}

const centerOf = async (page: Page, selector: string): Promise<{ x: number; y: number }> => {
  const box = (await page.locator(selector).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

test.describe('SplitPane tutamağı (ince işaretçi)', () => {
  test('gerçek kutu 24 px; large hedef tabanında 44 px; vuruş alanı kutunun tamamıdır', async ({
    page,
  }) => {
    await openWorkbench(page);
    expect((await geometry(page)).separator).toBeCloseTo(24, 0);

    // Merkezden ±11 px içeride hâlâ ayırıcının kendisi vurulur (24 px'lik kutu gerçekten tıklanır).
    const hit = async (offset: number): Promise<boolean> => {
      const center = await centerOf(page, SEPARATOR);
      return page.evaluate(
        ({ x, y, selector }) => document.elementFromPoint(x, y)?.matches(selector) ?? false,
        { x: center.x + offset, y: center.y, selector: '.vol-split-pane__separator' },
      );
    };
    expect(await hit(0)).toBe(true);
    expect(await hit(11)).toBe(true);
    expect(await hit(-11)).toBe(true);
    expect(await hit(13)).toBe(false);

    await page.evaluate(() => document.documentElement.setAttribute('data-vol-target', 'large'));
    await expect.poll(async () => (await geometry(page)).separator).toBeCloseTo(44, 0);
    expect(await hit(21)).toBe(true);
    await page.evaluate(() => document.documentElement.removeAttribute('data-vol-target'));
    await expect.poll(async () => (await geometry(page)).separator).toBeCloseTo(24, 0);
  });

  test('tutamak komşu bölmeyi örtmez: ikinci bölmenin kenarı ayırıcıdan hemen sonra başlar', async ({
    page,
  }) => {
    await openWorkbench(page);
    const edges = await page.evaluate(
      ({ split }) => {
        const root = document.querySelector<HTMLElement>(split)!;
        const rect = (selector: string) =>
          root.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
        const primary = rect('.vol-split-pane__pane--primary');
        const handle = rect('.vol-split-pane__separator');
        const secondary = rect('.vol-split-pane__pane--secondary');
        return {
          gapBefore: handle.left - primary.right,
          gapAfter: secondary.left - handle.right,
        };
      },
      { split: SPLIT },
    );
    expect(Math.abs(edges.gapBefore)).toBeLessThan(0.6);
    expect(Math.abs(edges.gapAfter)).toBeLessThan(0.6);
  });

  test('fareyle sürükleme boyutu değiştirir; Escape iptal eder (boyut başlangıca döner)', async ({
    page,
  }) => {
    await openWorkbench(page);
    const initial = (await geometry(page)).primary;
    const start = await centerOf(page, SEPARATOR);

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 60, start.y, { steps: 6 });
    await expect.poll(async () => (await geometry(page)).primary).toBeCloseTo(initial + 60, 0);
    await expect(page.locator(SPLIT)).toHaveClass(/vol-split-pane--resizing/);

    await page.keyboard.press('Escape');
    await expect.poll(async () => (await geometry(page)).primary).toBeCloseTo(initial, 0);
    await expect(page.locator(SPLIT)).not.toHaveClass(/vol-split-pane--resizing/);
    await page.mouse.up();
    expect((await geometry(page)).primary).toBeCloseTo(initial, 0);
  });

  test('fareyle sürükleyip bırakmak boyutu kalıcı kılar; klavye adımı oradan sürer', async ({
    page,
  }) => {
    await openWorkbench(page);
    const initial = (await geometry(page)).primary;
    const start = await centerOf(page, SEPARATOR);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 40, start.y, { steps: 4 });
    await page.mouse.up();
    await expect.poll(async () => (await geometry(page)).primary).toBeCloseTo(initial + 40, 0);

    await page.locator(SEPARATOR).focus();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await geometry(page)).primary).toBeCloseTo(initial + 32, 0);
  });
});

test.describe('SplitPane tutamağı (kaba işaretçi)', () => {
  test.use(PHONE_VIEWPORT);

  test('telefon koşulunda gerçek kutu 44 px', async ({ page }) => {
    await openWorkbench(page);
    await expect.poll(async () => (await geometry(page)).separator).toBeCloseTo(44, 0);
  });
});

test.describe('SplitPane gerçek dokunma (CDP, yalnız Chromium)', () => {
  test.use({ ...PHONE_VIEWPORT, viewport: { width: 900, height: 900 } });

  test.beforeEach(({ browserName }) => {
    test.skip(
      browserName !== 'chromium',
      'WebKit CDP dokunma sunmaz; sahiplik birim testte, fare Escape yukarıda',
    );
  });

  test('ikinci parmak sürüklemeyi devralmaz; sahip parmak boyutu sürer', async ({ page }) => {
    await openWorkbench(page);
    const initial = (await geometry(page)).primary;
    // Önce görünüm ortasına getirilir ve örtülmediği doğrulanır (ham CDP dokunuşu bunu kendisi denetlemez).
    await touchCenterOf(page.locator(SEPARATOR));
    const box = (await page.locator(SEPARATOR).boundingBox())!;
    const first = { x: box.x + box.width / 2, y: box.y + box.height * 0.3 };
    const second = { x: box.x + box.width / 2, y: box.y + box.height * 0.7 };

    const held = await gesture(
      page,
      [
        { from: first, to: { x: first.x - 30, y: first.y } },
        // İkinci parmak ters yöne (sağa) gitmeye çalışır: görmezden gelinmeli.
        { from: second, to: { x: second.x + 60, y: second.y } },
      ],
      8,
      true,
    );
    const during = (await geometry(page)).primary;
    await release(held);
    expect(during, 'sahip parmak (birincil) boyutu sürmeli').toBeCloseTo(initial - 30, 0);
    expect((await geometry(page)).primary).toBeCloseTo(initial - 30, 0);
  });

  test('pointercancel (sistem dokunuşu keser) boyutu başlangıca döndürür ve kalıcı kılmaz', async ({
    page,
  }) => {
    await openWorkbench(page);
    const initial = (await geometry(page)).primary;
    const center = await touchCenterOf(page.locator(SEPARATOR));

    const held = await gesture(
      page,
      [{ from: center, to: { x: center.x - 35, y: center.y } }],
      6,
      true,
    );
    expect((await geometry(page)).primary).toBeCloseTo(initial - 35, 0);
    await cancel(held);
    await expect.poll(async () => (await geometry(page)).primary).toBeCloseTo(initial, 0);
    await expect(page.locator(SPLIT)).not.toHaveClass(/vol-split-pane--resizing/);
  });
});

test.describe('pencere %200 ve %400 büyütme (dış panel kayar, bölme ezilmez)', () => {
  for (const [name, width, height] of [
    ['%200 (640×400)', 640, 400],
    ['%400 (320×568)', 320, 568],
  ] as const) {
    test(`${name}: sayfa yatay taşmaz; ikinci bölme bildirilen en küçük boyutun altına ezilmez`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await openWorkbench(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, 'sayfa yatay kaydı').toBe(0);

      const measured = await geometry(page);
      // Bildirilen en küçükler: 120 / 200 (workbenchTab.ts).
      expect(measured.primary).toBeGreaterThanOrEqual(119.5);
      expect(measured.secondary, 'ikinci bölme ezildi').toBeGreaterThanOrEqual(199.5);
      if (measured.split.scrollW > measured.split.w) {
        // Kap dar: dış panel yatay kayar ve ayırıcı odakla görünür kalır.
        expect(width).toBeLessThan(400);
      } else {
        expect(measured.primary + measured.separator + measured.secondary).toBeLessThanOrEqual(
          measured.split.w + 1,
        );
      }
    });
  }

  test('%400: dar kapta bölme yatay kayar ve klavye odağı kaydırıp ayırıcıyı görünür kılar', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await openWorkbench(page);
    const measured = await geometry(page);
    expect(measured.split.scrollW).toBeGreaterThan(measured.split.w);
    await expect(page.locator(`${SPLIT}`)).toHaveCSS('overflow-x', /auto|scroll/);

    await page.locator(SEPARATOR).focus();
    await page.keyboard.press('Home');
    const visible = await page.evaluate(
      ({ split, separator }) => {
        const root = document.querySelector<HTMLElement>(split)!.getBoundingClientRect();
        const handle = document.querySelector<HTMLElement>(separator)!.getBoundingClientRect();
        return handle.left >= root.left - 1 && handle.right <= root.right + 1;
      },
      { split: SPLIT, separator: SEPARATOR },
    );
    expect(visible, 'odaklanan ayırıcı kap içinde görünmeli').toBe(true);
  });

  test('%200: dış panel (sekme paneli) kayar ve iç kaydırma alanı sona ulaşınca kaydırma dış panele geçer', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 640, height: 400 });
    await openShowcase(page);
    await selectTab(page, 'scroll');
    const outer = page.locator('.vol-tabs__panels');
    const inner = page.locator(`${TAB_PANEL} .vol-scroll-view--vertical`).first();
    await inner.scrollIntoViewIfNeeded();
    await expect
      .poll(() => outer.evaluate((element) => element.scrollHeight - element.clientHeight))
      .toBeGreaterThan(0);

    const box = (await inner.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 4000);
    await expect
      .poll(() =>
        inner.evaluate(
          (element) => element.scrollHeight - element.clientHeight - element.scrollTop,
        ),
      )
      .toBeLessThan(1);

    const before = await outer.evaluate((element) => element.scrollTop);
    await page.waitForTimeout(800);
    await page.mouse.wheel(0, 300);
    await expect
      .poll(() => outer.evaluate((element) => element.scrollTop), { timeout: 5000 })
      .toBeGreaterThan(before);
  });
});

test.describe('klavyeyle kaydırma ve sanal liste', () => {
  test('ScrollView odaklanır; PageDown/End/Home kaydırır', async ({ page }) => {
    await openShowcase(page);
    await selectTab(page, 'scroll');
    const view = page.locator(`${TAB_PANEL} .vol-scroll-view--vertical`).first();
    await view.scrollIntoViewIfNeeded();
    await view.focus();
    await expect(view).toBeFocused();

    const top = () => view.evaluate((element) => element.scrollTop);
    const range = await view.evaluate((element) => element.scrollHeight - element.clientHeight);
    expect(range).toBeGreaterThan(0);

    await page.keyboard.press('PageDown');
    await expect.poll(top).toBeGreaterThan(0);
    await page.keyboard.press('End');
    await expect.poll(top).toBeGreaterThanOrEqual(range - 1);
    await page.keyboard.press('Home');
    await expect.poll(top).toBe(0);
  });

  test('VirtualList: DOM sınırlı kalır, End son satırı getirir, tam liste bildirilir', async ({
    page,
  }) => {
    await openShowcase(page);
    await selectTab(page, 'scroll');
    const list = page.locator(`${TAB_PANEL} .vol-virtual-list`);
    await list.scrollIntoViewIfNeeded();
    const rows = list.locator('.vol-virtual-list__row');

    expect(await rows.count()).toBeLessThan(30);
    await expect(rows.first()).toHaveAttribute('aria-setsize', '5000');
    await expect(rows.first()).toHaveAttribute('aria-posinset', '1');

    await list.focus();
    await expect(list).toBeFocused();
    await page.keyboard.press('End');
    await expect(rows.last()).toHaveAttribute('aria-posinset', '5000');
    expect(await rows.count()).toBeLessThan(30);
    await expect(list.locator('.vol-virtual-list__row', { hasText: /5000/ })).toHaveCount(1);

    await page.keyboard.press('Home');
    await expect(rows.first()).toHaveAttribute('aria-posinset', '1');
  });

  test('VirtualList tekerlekle kayar: pencere kayar, DOM sayısı sabit kalır', async ({ page }) => {
    await openShowcase(page);
    await selectTab(page, 'scroll');
    const list = page.locator(`${TAB_PANEL} .vol-virtual-list`);
    await list.scrollIntoViewIfNeeded();
    const rows = list.locator('.vol-virtual-list__row');
    const initialFirst = Number(await rows.first().getAttribute('aria-posinset'));

    const box = (await list.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 3600);
    await expect
      .poll(async () => Number(await rows.first().getAttribute('aria-posinset')))
      .toBeGreaterThan(initialFirst + 20);
    expect(await rows.count()).toBeLessThan(30);
  });
});

test.describe('DualAxisScrollPanel (sürükleme tek yol değildir)', () => {
  const panelOf = (page: Page) => page.locator(`${TAB_PANEL} .vol-dual-scroll`);

  test('odaklanabilir ve adlıdır; oklar, Page ve Home/End kaydırır; odak halkası görünür', async ({
    page,
  }) => {
    await openShowcase(page);
    await selectTab(page, 'touch');
    const panel = panelOf(page);
    await panel.scrollIntoViewIfNeeded();
    await expect(panel).toHaveAttribute('role', 'group');
    await expect(panel).toHaveAccessibleName(/\S/);

    const offset = () =>
      panel.evaluate((element) => ({ x: element.scrollLeft, y: element.scrollTop }));
    const range = await panel.evaluate((element) => ({
      x: element.scrollWidth - element.clientWidth,
      y: element.scrollHeight - element.clientHeight,
    }));
    expect(range.x, 'demo içeriği yatay kaymalı').toBeGreaterThan(0);
    expect(range.y, 'demo içeriği dikey kaymalı').toBeGreaterThan(0);

    await panel.focus();
    await page.keyboard.press('ArrowRight');
    await expect(panel).toBeFocused();
    const ring = await panel.evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(ring).not.toBe('none');

    await expect.poll(offset).toEqual({ x: 48, y: 0 });
    await page.keyboard.press('ArrowDown');
    await expect.poll(offset).toEqual({ x: 48, y: 48 });
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowUp');
    await expect.poll(offset).toEqual({ x: 0, y: 0 });

    await page.keyboard.press('PageDown');
    await expect.poll(async () => (await offset()).y).toBeGreaterThan(100);
    await page.keyboard.press('End');
    await expect.poll(async () => (await offset()).y).toBeGreaterThanOrEqual(range.y - 1);
    await page.keyboard.press('Shift+End');
    await expect.poll(async () => (await offset()).x).toBeGreaterThanOrEqual(range.x - 1);
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+Home');
    await expect.poll(offset).toEqual({ x: 0, y: 0 });
  });

  test('tekerlek kaydırır; Shift+tekerlek yataydır; uçta sayfa kayar (tuzak yok)', async ({
    page,
  }) => {
    await openShowcase(page);
    await selectTab(page, 'touch');
    const panel = panelOf(page);
    await panel.scrollIntoViewIfNeeded();
    const box = (await panel.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

    await page.mouse.wheel(0, 90);
    await expect.poll(() => panel.evaluate((element) => element.scrollTop)).toBeGreaterThan(40);
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, 90);
    await page.keyboard.up('Shift');
    await expect.poll(() => panel.evaluate((element) => element.scrollLeft)).toBeGreaterThan(40);

    // Uca kadar kaydır; sonra aynı alanda yeni kaydırma dış paneli oynatır.
    await page.mouse.wheel(0, 5000);
    await expect
      .poll(() =>
        panel.evaluate(
          (element) => element.scrollHeight - element.clientHeight - element.scrollTop,
        ),
      )
      .toBeLessThan(1);
    const outer = page.locator('.vol-tabs__panels');
    const before = await outer.evaluate((element) => element.scrollTop);
    await page.waitForTimeout(800);
    await page.mouse.wheel(0, 300);
    await expect
      .poll(() => outer.evaluate((element) => element.scrollTop), { timeout: 5000 })
      .toBeGreaterThan(before);
  });
});
