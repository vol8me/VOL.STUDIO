import { expect, test } from '@playwright/test';
import { openShowcase, selectTab, SHOWCASE_TABS } from './support/determinism';

/**
 * OKUNABİLİRLİK kapısı — Deck'in motoru (WebKit) projesinde koşar.
 *
 * İki ölçüm:
 *
 * 1. EL BOYU: 1280×800 ve 1280×720 görüntü alanında VİTRİNDEKİ her görünür
 *    metin ≥ 12 px. Steam'in Deck rehberi alt sınırı 12 px'tir; burada
 *    ölçülen değer tarayıcının hesapladığı `font-size`'dır (zoom 1 iken
 *    hesaplanan = çizilen).
 *
 * 2. OTURMA MESAFESİ: 1920×1080 ve 3840×2160'ta UI bütün olarak ölçeklenir
 *    (`--vol-layout-zoom` medya sorgusu → `.vol-showcase-root` zoom). İddia hem
 *    zoom katsayısı hem de gerçekten BÜYÜYEN bir metin kutusuyla yapılır —
 *    katsayı yalan söyleyemez çünkü kutu yüksekliği de ölçülür.
 *
 * İhlal raporu `sekme | seçici | hesaplanan px` biçimindedir: satır
 * doğrudan düzeltilecek kuralı gösterir.
 */

/** Deck el boyu görüntü alanları. */
const HANDHELD_SIZES = [
  { width: 1280, height: 800 },
  { width: 1280, height: 720 },
] as const;

/** Oturma mesafesi: genişlik → beklenen zoom katsayısı. */
const COUCH_SIZES = [
  { width: 1920, height: 1080, zoom: 1.5 },
  { width: 3840, height: 2160, zoom: 3 },
] as const;

const MIN_TEXT_PX = 12;

interface TextMeasure {
  /** Kısa seçici yolu: `tag.vol-a.vol-b`, en yakın iki atayla. */
  selector: string;
  fontSizePx: number;
  /** Klipslenmiş ya da sıfır-kutulu öğeler görünür sayılmaz. */
  text: string;
}

function collectVisibleText(): TextMeasure[] {
  const out: TextMeasure[] = [];

  function selectorOf(el: Element): string {
    const bits: string[] = [];
    let cur: Element | null = el;
    let depth = 0;
    while (cur && cur !== document.body && depth < 3) {
      const cls = Array.from(cur.classList)
        .filter((c) => c.startsWith('vol-'))
        .slice(0, 2)
        .join('.');
      bits.unshift(cls ? `${cur.tagName.toLowerCase()}.${cls}` : cur.tagName.toLowerCase());
      cur = cur.parentElement;
      depth += 1;
    }
    return bits.join('>');
  }

  function directText(el: Element): string {
    let t = '';
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) t += node.textContent ?? '';
    }
    return t.trim();
  }

  for (const el of document.querySelectorAll('body *')) {
    const text = directText(el);
    if (!text) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    if (Number.parseFloat(style.opacity) === 0) continue;
    const rect = el.getBoundingClientRect();
    // Klipslenmiş (.vol-sr-only 1×1) ve sıfır-kutulu metin görünür sayılmaz.
    if (rect.width < 3 || rect.height < 3) continue;
    out.push({
      selector: selectorOf(el),
      fontSizePx: Number.parseFloat(style.fontSize),
      text: text.slice(0, 24),
    });
  }
  return out;
}

test.describe('el boyu okunabilirlik (1280×800 / 1280×720)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  for (const size of HANDHELD_SIZES) {
    test(`görünen her metin ≥ ${MIN_TEXT_PX}px @ ${size.width}×${size.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await openShowcase(page);
      const violations: string[] = [];
      for (const tab of SHOWCASE_TABS) {
        await selectTab(page, tab);
        const items = await page.evaluate(collectVisibleText);
        for (const item of items) {
          if (item.fontSizePx < MIN_TEXT_PX) {
            violations.push(
              `${tab} | ${item.selector} | ${item.fontSizePx}px < ${MIN_TEXT_PX}px | "${item.text}"`,
            );
          }
        }
      }
      expect(violations, violations.join('\n')).toEqual([]);
    });
  }
});

test.describe('oturma mesafesi ölçeği (1080p / 2160p)', () => {
  for (const size of COUCH_SIZES) {
    test(`${size.width}×${size.height} görüntü alanında UI ${size.zoom}× ölçeklenir`, async ({
      page,
    }) => {
      // Karşılaştırma tabanı: aynı sekmenin el boyundaki kutusu.
      await page.setViewportSize({ width: 1280, height: 800 });
      await openShowcase(page);
      await selectTab(page, 'buttons');
      const baseHeight = await page
        .locator('[role="tab"]')
        .first()
        .evaluate((el) => el.getBoundingClientRect().height);

      await page.setViewportSize({ width: size.width, height: size.height });
      const zoomVar = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--vol-layout-zoom').trim(),
      );
      expect(zoomVar, `beklenen --vol-layout-zoom ${size.zoom}`).toBe(String(size.zoom));

      const scaledHeight = await page
        .locator('[role="tab"]')
        .first()
        .evaluate((el) => el.getBoundingClientRect().height);
      // getBoundingClientRect zoom sonrası CSS-px döner: sekme kutusu
      // gerçekten büyümüş olmalı (±%5 sığınma/flex farkı payı).
      expect(scaledHeight).toBeGreaterThanOrEqual(baseHeight * size.zoom * 0.95);
      expect(scaledHeight).toBeLessThanOrEqual(baseHeight * size.zoom * 1.05);
    });
  }
});
