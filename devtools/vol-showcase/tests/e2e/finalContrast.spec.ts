import { expect, test, type Page } from '@playwright/test';
import { openShowcase, selectTab, SHOWCASE_TABS, type ShowcaseTab } from './support/determinism';
import { loadAxeRecords } from './support/accessibility';
import { measureFinalContrast, type ContrastMeasurement } from './support/finalContrast';

/**
 * axe'in hesaplayamadığı (`incomplete`) her `color-contrast` kaydı için SON RENK ölçümü: metin
 * silinir, çizilmiş zemin pikselleri okunur, metin rengi her pikselin üstüne bindirilir ve en
 * kötü piksel WCAG eşiğiyle (4,5 ya da büyük metinde 3) karşılaştırılır. Kayıt eklemek ölçümü
 * otomatik kapsar; iki skinde de koşar.
 */
const SKINS = ['default', 'aurum'] as const;

const records = loadAxeRecords().incomplete.filter((record) => record.rule === 'color-contrast');

function tabOf(scope: string): ShowcaseTab {
  const tab = scope.replace(/^tab\//, '');
  const known = SHOWCASE_TABS.find((candidate) => candidate === tab);
  if (!known) throw new Error(`Bilinmeyen sekme kapsamı: ${scope}`);
  return known;
}

async function open(page: Page, skin: (typeof SKINS)[number], tab: ShowcaseTab): Promise<void> {
  if (skin !== 'default')
    await page.addInitScript((value) => {
      localStorage.setItem('device.volui:theme', JSON.stringify(value));
    }, skin);
  await openShowcase(page);
  await selectTab(page, tab);
}

async function scratchPage(page: Page): Promise<Page> {
  const scratch = await page.context().newPage();
  await scratch.goto('about:blank');
  return scratch;
}

const report = (measure: ContrastMeasurement): string =>
  `"${measure.text.slice(0, 40)}" ${measure.color} ${measure.fontPx}px: en kötü ${measure.worst.toFixed(2)}, ` +
  `%5 dilimi ${measure.p05.toFixed(2)}, eşik ${measure.required}`;

test('kayıtlı color-contrast incomplete kayıtları var (ölçülecek şey bulunuyor)', () => {
  expect(records.length).toBeGreaterThan(0);
});

for (const skin of SKINS) {
  test.describe(`son renk kontrastı: ${skin}`, () => {
    for (const record of records) {
      test(`${record.scope} ${record.target}`, async ({ page }) => {
        await open(page, skin, tabOf(record.scope));
        const scratch = await scratchPage(page);
        const targets = page
          .locator('[role="tabpanel"]:not([aria-hidden="true"])')
          .locator(record.target);
        const count = await targets.count();
        expect(count, 'hedef seçici etkin panelde bulunmalı').toBeGreaterThan(0);
        const failures: string[] = [];
        for (let index = 0; index < count; index++) {
          for (const measure of await measureFinalContrast(page, scratch, targets.nth(index))) {
            if (process.env.CONTRAST_REPORT)
              console.log(`[${skin}] ${record.scope} ${report(measure)}`);
            if (measure.worst < measure.required) failures.push(report(measure));
          }
        }
        expect(failures, `eşik altı metin: ${record.scope} ${record.target}`).toEqual([]);
      });
    }
  });
}

test.describe('düzenek eşik altını yakalar, geçeni geçirir', () => {
  async function fixture(page: Page, style: string): Promise<ContrastMeasurement[]> {
    await openShowcase(page);
    await page.evaluate((css) => {
      const box = document.createElement('div');
      box.id = 'fc-fixture';
      box.textContent = 'Deneme metni';
      box.style.cssText = `position:fixed;left:20px;top:20px;padding:8px;font:16px sans-serif;${css}`;
      document.body.append(box);
    }, style);
    const scratch = await scratchPage(page);
    return measureFinalContrast(page, scratch, page.locator('#fc-fixture'));
  }

  test('düz koyu zeminde beyaz metin yüksek orandır', async ({ page }) => {
    const [measure] = await fixture(page, 'background:#000;color:#fff');
    expect(measure.worst).toBeGreaterThan(20);
    expect(measure.required).toBe(4.5);
  });

  test('gradyanın açık ucundaki metin en kötü piksele göre düşer', async ({ page }) => {
    // Sol uç koyu (yeterli), sağ uç açık: ortalama orta, en kötü piksel eşik altı.
    const [measure] = await fixture(
      page,
      'width:220px;background:linear-gradient(90deg,#000,#fff);color:#888',
    );
    expect(measure.worst).toBeLessThan(measure.required);
  });

  test('yarı saydam metin zeminle birleşir (alfa hesaba katılır)', async ({ page }) => {
    const [opaque] = await fixture(page, 'background:#000;color:#fff');
    const [faint] = await fixture(page, 'background:#000;color:rgba(255,255,255,0.3)');
    expect(faint.worst).toBeLessThan(opaque.worst);
    expect(faint.worst).toBeLessThan(4.5);
  });

  test('kesirli konumdaki kutunun dışında kalan sınır satırı ölçülmez (yalnız metnin arkası sayılır)', async ({
    page,
  }) => {
    await openShowcase(page);
    // Açık sayfa üstünde koyu kutu, `top` yarım piksel: kutu piksele yuvarlanarak çizilir, metin kutusunun ilk satırı
    // kutunun DIŞINDA (açık zemin) kalır; metnin arkasında olmayan o satır en kötü piksel sayılmamalıdır.
    await page.evaluate(() => {
      const sheet = document.createElement('div');
      sheet.style.cssText =
        'position:fixed;left:10px;top:10px;width:240px;height:60px;background:#fff;z-index:99999';
      const box = document.createElement('div');
      box.id = 'fc-fixture';
      box.textContent = 'Deneme metni';
      box.style.cssText =
        'position:absolute;left:10px;top:10.5px;padding:0;background:#000;color:#fff;font:13px sans-serif;line-height:normal';
      sheet.append(box);
      document.body.append(sheet);
    });
    const scratch = await scratchPage(page);
    const [measure] = await measureFinalContrast(page, scratch, page.locator('#fc-fixture'));
    expect(measure.worst).toBeGreaterThan(20);
  });

  test('büyük metin 3:1 eşiğini kullanır', async ({ page }) => {
    const [measure] = await fixture(page, 'background:#000;color:#fff;font-size:28px');
    expect(measure.required).toBe(3);
  });
});
