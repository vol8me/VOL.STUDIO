import { expect, test, type Page } from '@playwright/test';
import { SHOWCASE_TABS, selectTab } from './support/determinism';
import { scan, type Finding } from './support/textFit';

/**
 * Yazı tipi yükleme sözleşmesi (UI-07.3): `FontManager` uygulama kurulmadan ÖNCE yazı tiplerini bekler, yüklenemeyeni
 * `document.fonts`tan siler. Bu yüzden (1) yavaş yazı tipi kurulumdan sonra yerleşimi KAYDIRMAZ (uygulama yüklenmiş
 * yazı tipiyle kurulur, sonradan takas yok), (2) yazı tipi yüklenemezse uygulama sistem yedeğiyle açılır, hiçbir
 * sekmede metin kırpılmaz/taşmaz ve sonradan gelen geç dosya yerleşimi değiştirmez.
 */
const FONT_URL = '**/assets/fonts/**';
const VIEWPORT = { width: 1280, height: 800 };

/** Sayfa betiklerinden önce: kök ilk eklendiğinde yazı tiplerinin durumunu ve düzen kaymalarını kaydeder. */
function instrument(): void {
  const w = window as unknown as {
    __fontsAtMount?: string[];
    __shifts?: number;
  };
  w.__shifts = 0;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as {
        value: number;
        hadRecentInput: boolean;
      }[]) {
        if (!entry.hadRecentInput) w.__shifts = (w.__shifts ?? 0) + entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {
    // WebKit `layout-shift` sunmaz; orada eşdeğer kanıt kök kurulduğundaki yazı tipi durumudur.
  }
  const watch = new MutationObserver(() => {
    if (w.__fontsAtMount || !document.querySelector('.vol-showcase-root')) return;
    w.__fontsAtMount = [...(document.fonts as unknown as Iterable<FontFace>)].map(
      (face) => `${face.family}:${face.status}`,
    );
    watch.disconnect();
  });
  watch.observe(document, { childList: true, subtree: true });
}

async function boot(page: Page): Promise<void> {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/');
  await page.waitForSelector('[role="tablist"]');
  await page.evaluate(() => document.fonts.ready);
}

/** Her sekmenin panel yüksekliği (yerleşim parmak izi). */
async function tabHeights(page: Page): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const tab of SHOWCASE_TABS) {
    await selectTab(page, tab);
    out[tab] = await page.evaluate(
      (id) =>
        Math.round(
          document
            .querySelector<HTMLElement>(`[role="tabpanel"][id$="-panel-${id}"]`)!
            .getBoundingClientRect().height,
        ),
      tab,
    );
  }
  return out;
}

test.describe('yavaş yazı tipi', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(instrument);
    await page.route(FONT_URL, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.continue();
    });
  });

  test('uygulama yüklenmiş yazı tipiyle kurulur ve sonradan yerleşim kaymaz', async ({
    page,
    browserName,
  }) => {
    await boot(page);
    const atMount = await page.evaluate(
      () => (window as unknown as { __fontsAtMount?: string[] }).__fontsAtMount,
    );
    expect(atMount, 'kök kurulurken yazı tipi listesi').toBeDefined();
    expect(atMount!.length).toBeGreaterThan(0);
    expect(
      atMount!.every((entry) => entry.endsWith(':loaded')),
      `kök kurulurken yazı tipleri yüklü olmalı: ${JSON.stringify(atMount)}`,
    ).toBe(true);
    const before = await tabHeights(page);
    await page.waitForTimeout(800);
    const after = await tabHeights(page);
    expect(after).toEqual(before);
    if (browserName === 'chromium') {
      const shifts = await page.evaluate(
        () => (window as unknown as { __shifts: number }).__shifts,
      );
      expect(shifts, 'toplam düzen kayması (CLS)').toBe(0);
    }
  });
});

test.describe('yazı tipi yüklenemez', () => {
  test('uygulama sistem yedeğiyle açılır, kırpılma/taşma yok, geç dosya yerleşimi değiştirmez', async ({
    page,
  }) => {
    const warnings: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'warning') warnings.push(message.text());
    });
    await page.addInitScript(instrument);
    await page.route(FONT_URL, (route) => route.abort());
    await boot(page);

    expect(warnings.some((text) => text.includes('Font yüklenemedi'))).toBe(true);
    const faces = await page.evaluate(() =>
      [...(document.fonts as unknown as Iterable<FontFace>)].map(
        (face) => `${face.family}:${face.status}`,
      ),
    );
    expect(
      faces.some((entry) => entry.endsWith(':loaded')),
      `başarısız yazı tipi document.fonts içinde kalmamalı: ${JSON.stringify(faces)}`,
    ).toBe(false);

    const findings: Finding[] = [];
    for (const tab of SHOWCASE_TABS) {
      await selectTab(page, tab);
      findings.push(...(await scan(page, tab, 'fallback-1280x800')));
    }
    expect(findings).toEqual([]);

    const fallbackHeights = await tabHeights(page);
    await page.waitForTimeout(500);
    expect(await tabHeights(page)).toEqual(fallbackHeights);
    console.log('yedek yazı tipi sekme yükseklikleri', JSON.stringify(fallbackHeights));
  });

  test('yedek yazı tipinde sekme yükseklikleri yüklü yazı tipine göre ölçülür', async ({
    browser,
  }) => {
    const measure = async (abort: boolean): Promise<Record<string, number>> => {
      const context = await browser.newContext({ viewport: VIEWPORT });
      const page = await context.newPage();
      if (abort) await page.route(FONT_URL, (route) => route.abort());
      await boot(page);
      const heights = await tabHeights(page);
      await context.close();
      return heights;
    };
    const loaded = await measure(false);
    const fallback = await measure(true);
    const deltas = Object.fromEntries(
      SHOWCASE_TABS.map((tab) => [
        tab,
        Math.round(((fallback[tab] - loaded[tab]) / loaded[tab]) * 1000) / 10,
      ]),
    );
    console.log('yedek/yüklü yükseklik farkı (%)', JSON.stringify(deltas));
    // Yedek yazı tipi yerleşimi bozmaz: hiçbir sekme yüklü yazı tipine göre %10'dan fazla uzamaz/kısalmaz.
    for (const [tab, delta] of Object.entries(deltas)) {
      expect(Math.abs(delta), `${tab} sekmesi yedek/yüklü fark %`).toBeLessThanOrEqual(10);
    }
  });
});
