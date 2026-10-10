import { expect, test, type Page } from '@playwright/test';
import { openShowcase, selectTab } from './support/determinism';

/**
 * Palet sekmesi okunabilirliği (UI-10.5): karşıtlık çizelgesindeki her oran, satırın örnek kutusunun TARAYICIDA
 * çizilen ön/zemin renginden bağımsız olarak yeniden hesaplanır (sekmenin kendi token ayrıştırıcısına güvenilmez);
 * iki kaplamada hiçbir çift kalmaz, kaplama çalışırken değişince oranlar güncellenir ve dar görüntü alanında tablo
 * kartından taşmaz. Genel axe/kontrast/yerleşim taraması her sekmeyi (palet dahil) `accessibility`, `finalContrast`,
 * `themeMatrix` ve `layout` özelliklerinde kapsar.
 */
const SKINS = ['default', 'aurum'] as const;

interface RowReading {
  readonly foreground: string;
  readonly background: string;
  readonly displayed: number;
  readonly result: string | undefined;
  readonly resultText: string;
  readonly ratioText: string;
  /** Tarayıcının çizdiği örnek renkleri (`rgb(...)`). */
  readonly sampleColor: string;
  readonly sampleBackground: string;
  readonly pageBackground: string;
}

async function readRows(page: Page): Promise<RowReading[]> {
  return page.evaluate(() => {
    const page = getComputedStyle(document.documentElement).getPropertyValue('--vol-ui-bg').trim();
    const probe = document.createElement('span');
    document.body.appendChild(probe);
    probe.style.background = page;
    const pageBackground = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return [...document.querySelectorAll<HTMLElement>('.vol-palette-contrast__row')].map((row) => {
      const sample = row.querySelector<HTMLElement>('.vol-palette-contrast__sample');
      const style = sample ? getComputedStyle(sample) : null;
      return {
        foreground: row.dataset.foreground ?? '',
        background: row.dataset.background ?? '',
        displayed: Number(row.dataset.ratio),
        result: row.dataset.result,
        resultText: row.querySelector('.vol-palette-contrast__result')?.textContent ?? '',
        ratioText: row.querySelector('.vol-palette-contrast__ratio')?.textContent ?? '',
        sampleColor: style?.color ?? '',
        sampleBackground: style?.backgroundColor ?? '',
        pageBackground,
      };
    });
  });
}

/** `rgb(r, g, b)` / `rgba(r, g, b, a)` → [r, g, b, a]. */
function parseRgb(value: string): [number, number, number, number] {
  const numbers = /rgba?\(([^)]+)\)/
    .exec(value)?.[1]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number);
  if (!numbers || numbers.length < 3) throw new Error(`renk çözülemedi: ${value}`);
  return [numbers[0], numbers[1], numbers[2], numbers[3] ?? 1];
}

function over(front: number[], base: number[]): number[] {
  const alpha = front[3] ?? 1;
  return [0, 1, 2].map((index) => Math.round(front[index] * alpha + base[index] * (1 - alpha)));
}

function luminance(rgb: number[]): number {
  const linear = (channel: number): number => {
    const unit = channel / 255;
    return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
}

/** Tarayıcının çizdiği renklerden WCAG oranı; saydam zemin sayfa zeminine, saydam ön renk zeminin son rengine bileşilir. */
function paintedRatio(row: RowReading): number {
  const base = parseRgb(row.pageBackground);
  const back = over(parseRgb(row.sampleBackground), base);
  const front = over(parseRgb(row.sampleColor), back);
  const [light, dark] = [luminance(front), luminance(back)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

async function openPalette(page: Page, skin: (typeof SKINS)[number]): Promise<void> {
  await page.addInitScript((theme) => {
    localStorage.setItem('device.volui:theme', JSON.stringify(theme));
  }, skin);
  await openShowcase(page);
  await expect(page.locator('html')).toHaveAttribute('data-vol-theme', skin);
  await selectTab(page, 'palette');
  await expect(page.locator('.vol-palette-contrast__row').first()).toBeVisible();
}

for (const skin of SKINS) {
  test.describe(`palet karşıtlık çizelgesi (${skin})`, () => {
    test('gösterilen her oran çizilen renklerden bağımsız hesapla aynıdır ve hiçbir çift kalmaz', async ({
      page,
    }) => {
      await openPalette(page, skin);
      const rows = await readRows(page);
      expect(rows.length).toBeGreaterThanOrEqual(24);

      const mismatches: string[] = [];
      const failing: string[] = [];
      for (const row of rows) {
        const painted = paintedRatio(row);
        // Görünen metin (yerel ondalık ayracıyla) ve veri özniteliği aynı değeri taşır.
        const text = Number(row.ratioText.replace(':1', '').replace(',', '.'));
        if (Math.abs(painted - row.displayed) > 0.005) {
          mismatches.push(
            `${row.foreground}/${row.background}: çizilen ${painted.toFixed(3)} ≠ ${row.displayed}`,
          );
        }
        if (Math.abs(text - row.displayed) > 0.006) {
          mismatches.push(
            `${row.foreground}/${row.background}: metin ${row.ratioText} ≠ ${row.displayed}`,
          );
        }
        if (row.result !== 'pass')
          failing.push(`${row.foreground} / ${row.background} (${row.ratioText})`);
      }
      expect(mismatches, mismatches.join('\n')).toEqual([]);
      expect(failing, `eşiği geçmeyen çiftler:\n${failing.join('\n')}`).toEqual([]);
    });

    test('sonuç renge değil yazıya dayanır ve her satırın başlığı vardır (tablo semantiği)', async ({
      page,
    }) => {
      await openPalette(page, skin);
      const rows = await readRows(page);
      for (const row of rows) {
        expect(row.resultText, row.foreground).toMatch(/^(Pass|Geçer) \(≥ \d+(?:[.,]\d)?:1\)$/);
      }
      const table = page.locator('table.vol-palette-contrast');
      await expect(table.locator('thead th[scope="col"]')).toHaveCount(4);
      await expect(table.locator('tbody th[scope="row"]')).toHaveCount(rows.length);
      // Örnek kutusu salt görsel: yardımcı teknolojiden gizlidir, bilgi oran ve sonuç metnindedir.
      await expect(table.locator('.vol-palette-contrast__sample[aria-hidden="true"]')).toHaveCount(
        rows.length,
      );
      // Salt okunur karşılaştırma verisi yerel tablodur; `grid` yalnız etkileşimli seçilebilir veriye aittir
      // (sayfadaki seçilebilir DataTable'lar başka sekmededir ve bu çizelgeyi kapsamaz).
      await expect(table.locator('xpath=ancestor-or-self::*[@role="grid"]')).toHaveCount(0);
      await expect(table.locator('[role="grid"], [role="gridcell"]')).toHaveCount(0);
    });
  });
}

test('kaplama çalışırken değişince oranlar yeni renklerden yeniden yazılır', async ({ page }) => {
  await openPalette(page, 'default');
  const before = await readRows(page);
  await page.locator('.vol-showcase-skin-button').click();
  await expect(page.locator('html')).toHaveAttribute('data-vol-theme', 'aurum');
  await expect
    .poll(async () => {
      const after = await readRows(page);
      return after.filter((row, index) => row.displayed !== before[index].displayed).length;
    })
    .toBeGreaterThan(0);
  // Yenilenen oranlar yine çizilen renklerle uyumludur (bayat değer kalmadı).
  for (const row of await readRows(page)) {
    expect(
      Math.abs(paintedRatio(row) - row.displayed),
      `${row.foreground}/${row.background}`,
    ).toBeLessThan(0.005);
    expect(row.result).toBe('pass');
  }
});

test('dar görüntü alanında (320 CSS px) tablo kartından taşmaz ve sayfa yatay kaymaz', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openPalette(page, 'default');
  const geometry = await page.evaluate(() => {
    const table = document.querySelector<HTMLElement>('table.vol-palette-contrast');
    const card = table?.closest<HTMLElement>('.vol-showcase-card__body');
    if (!table || !card) return null;
    const tableBox = table.getBoundingClientRect();
    const cardBox = card.getBoundingClientRect();
    return {
      tableRight: tableBox.right,
      cardRight: cardBox.right,
      tableLeft: tableBox.left,
      cardLeft: cardBox.left,
      pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  expect(geometry).not.toBeNull();
  expect(geometry!.tableRight).toBeLessThanOrEqual(geometry!.cardRight + 1);
  expect(geometry!.tableLeft).toBeGreaterThanOrEqual(geometry!.cardLeft - 1);
  expect(geometry!.pageOverflow).toBeLessThanOrEqual(0);
});

test('karşıtlık kartı palet ızgarasının tamamını kaplar ve satırlar sıkışmaz (1280 × 800)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openPalette(page, 'default');
  const geometry = await page.evaluate(() => {
    const table = document.querySelector<HTMLElement>('table.vol-palette-contrast');
    const card = table?.closest<HTMLElement>('.vol-showcase-card');
    const grid = card?.closest<HTMLElement>('.vol-palette-grid');
    if (!table || !card || !grid) return null;
    const rows = [...table.querySelectorAll<HTMLElement>('tbody tr')];
    return {
      cardWidth: card.getBoundingClientRect().width,
      gridWidth: grid.getBoundingClientRect().width,
      tallestRow: Math.max(...rows.map((row) => row.getBoundingClientRect().height)),
    };
  });
  expect(geometry).not.toBeNull();
  // Dar bir sütuna sıkışsaydı kart ızgaranın küçük bir bölümü olur ve satırlar onlarca satıra bölünürdü.
  expect(geometry!.cardWidth).toBeGreaterThanOrEqual(geometry!.gridWidth * 0.99);
  expect(geometry!.tallestRow).toBeLessThanOrEqual(56);
});
