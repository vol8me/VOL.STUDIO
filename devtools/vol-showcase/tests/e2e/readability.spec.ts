import { expect, test } from '@playwright/test';
import { openShowcase, selectTab, SHOWCASE_TABS } from './support/determinism';
import { loadGlyphRecords } from './support/geometry';

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
 * 3. ÇİZİLMİŞ GLİF YÜKSEKLİĞİ: Valve alt sınırı hesaplanan `font-size`a değil
 *    ekranda çizilen glife bağlıdır (CONTRACT: ≥9 ekran px, ≥12 hedef). 12 px
 *    iki yazı tipinde aynı glif boyunu vermez; bu yüzden CSS alt sınırı (1.) ile
 *    glif ölçümü (3.) ayrı kapılardır ve biri diğerinin yerine geçmez. Ölçü,
 *    tarayıcının canvas `actualBoundingBoxAscent` değeriyle 'H' (büyük harf)
 *    mürekkep yüksekliğidir: bir TARAYICI KESTİRİMİDİR, Deck panelindeki gerçek
 *    ekran örneği değildir ve o kabul UI-07.3'te açık kalır.
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

/** Valve çizilmiş glif alt sınırı (ekran px); büyük harf mürekkep yüksekliği ile ölçülür. */
const MIN_GLYPH_PX = 9;

interface GlyphMeasure {
  /** `Aile boyutpx w<ağırlık>`: aynı üçlü tek kez ölçülür. */
  font: string;
  capHeightPx: number;
}

function collectGlyphHeights(): GlyphMeasure[] {
  const canvas = document.createElement('canvas').getContext('2d');
  if (canvas === null) throw new Error('canvas bağlamı yok: glif yüksekliği ölçülemez');
  const seen = new Map<string, number>();
  for (const el of document.querySelectorAll('body *')) {
    let text = '';
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? '';
    }
    if (!text.trim()) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    if (Number.parseFloat(style.opacity) === 0) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 3 || rect.height < 3) continue;
    const size = Number.parseFloat(style.fontSize);
    const family = style.fontFamily.split(',')[0].replaceAll('"', '').trim();
    const key = `${family} ${size}px w${style.fontWeight}`;
    if (seen.has(key)) continue;
    canvas.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    // Ekran pikseli = CSS px × cihaz ölçeği (vitrin 1'e sabitler).
    seen.set(key, canvas.measureText('H').actualBoundingBoxAscent * window.devicePixelRatio);
  }
  return [...seen].map(([font, capHeightPx]) => ({ font, capHeightPx }));
}

test.describe('çizilmiş glif yüksekliği (tarayıcı kestirimi, 1280×800)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  const records = loadGlyphRecords();

  test(`büyük harf mürekkep yüksekliği ≥ ${MIN_GLYPH_PX} ekran px`, async ({ page }, info) => {
    await openShowcase(page);
    const low = new Map<string, number>();
    let measured = 0;
    for (const tab of SHOWCASE_TABS) {
      await selectTab(page, tab);
      for (const item of await page.evaluate(collectGlyphHeights)) {
        measured += 1;
        expect(item.capHeightPx, `${item.font}: ölçü alınamadı`).toBeGreaterThan(0);
        if (item.capHeightPx < MIN_GLYPH_PX) low.set(item.font, item.capHeightPx);
      }
    }
    info.annotations.push({
      type: 'kapsam',
      description: `${measured} yazı tipi örneği ölçüldü; <${MIN_GLYPH_PX}px: ${[...low.keys()].join(', ') || 'yok'}`,
    });
    expect(measured, 'hiç metin ölçülmedi').toBeGreaterThan(0);

    const engine = info.project.name;
    const known = new Set(
      records
        .filter((record) => record.engines === undefined || record.engines.includes(engine))
        .map((record) => record.font),
    );
    expect(
      [...low.keys()].filter((font) => !known.has(font)),
      'kayıtsız: çizilen glif Valve alt sınırının altında (font-size ≥12 bunu garanti etmez)',
    ).toEqual([]);
    expect(
      [...known].filter((font) => !low.has(font)),
      'bayat glif kaydı (ölçü düzelmiş, kaydı sil)',
    ).toEqual([]);
  });

  test('glif ölçümü yazı tipine duyarlıdır (kontrol)', async ({ page }) => {
    // Ölçümün gerçekten glif boyu okuduğunu gösterir: aynı 12 px'te küçük harfli
    // bir yedek yazı tipi ile büyük bir ekran yazı tipi farklı yükseklik verir.
    await openShowcase(page);
    const [small, large] = await page.evaluate(() => {
      const canvas = document.createElement('canvas').getContext('2d')!;
      const measure = (font: string): number => {
        canvas.font = font;
        return canvas.measureText('H').actualBoundingBoxAscent;
      };
      return [measure('12px monospace'), measure('48px monospace')];
    });
    expect(large).toBeGreaterThan(small * 3);
  });
});
