import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { openShowcase, selectTab } from './support/determinism';

/**
 * Tarih / birim / yüzde biçimi tüketicileri (UI-07.2): vitrindeki okumalar elle birleştirme değil, i18next'in `datetime` ve
 * `number` biçimleyicileriyle ARAYÜZ diline göre yazılır. Dil tarayıcı yerelinden (navigator.languages) gelir; beklenen
 * değer tarayıcının kendi `Intl`inden alınır, böylece iki motorun ICU sürüm farkı testi kırmaz ama biçimin dile bağlı
 * olduğu (Türkçede `%100`, İngilizcede `100%`; saat 24 saat / 12 saat) iki dilin farkıyla da kanıtlanır.
 */
const LANGS = [
  { tag: 'tr-TR', lng: 'tr', percentFirst: true },
  { tag: 'en-US', lng: 'en', percentFirst: false },
] as const;

function strings(lng: string): { randomEvent: string; criticalAlert: string } {
  const json = JSON.parse(
    readFileSync(resolve(import.meta.dirname, `../../src/i18n/${lng}.json`), 'utf8'),
  ) as { advanced: { randomEvent: string; criticalAlert: string } };
  return json.advanced;
}

for (const { tag, lng, percentFirst } of LANGS) {
  test.describe(`biçim tüketicileri (${tag})`, () => {
    test.use({ locale: tag, timezoneId: 'UTC' });

    test('Zoom yüzdesi: işaret yeri dile göre, elle %/sayı birleştirmesi yok', async ({ page }) => {
      await openShowcase(page);
      await selectTab(page, 'workbench');
      const expected = await page.evaluate(
        (l) => new Intl.NumberFormat(l, { style: 'percent' }).format(1),
        lng,
      );
      const zoom = page
        .locator('[role="tabpanel"]:not([aria-hidden="true"])')
        .getByText(/^Zoom\s/)
        .first();
      await expect(zoom).toHaveText(`Zoom ${expected}`);
      expect(expected.startsWith('%')).toBe(percentFirst);
    });

    test('saat: olay günlüğü zaman damgası arayüz dilinin saat biçimindedir', async ({ page }) => {
      await openShowcase(page);
      await selectTab(page, 'advanced');
      const { criticalAlert } = strings(lng);
      const panel = page.locator('[role="tabpanel"]:not([aria-hidden="true"])');
      await panel.getByRole('button', { name: criticalAlert, exact: true }).click();
      const expected = await page.evaluate(
        (l) =>
          new Intl.DateTimeFormat(l, { timeStyle: 'medium', timeZone: 'UTC' }).format(
            new Date(Date.UTC(2026, 0, 1)),
          ),
        lng,
      );
      // `openShowcase` "şimdi"yi 2026-01-01T00:00:00Z'e dondurur: damga tam olarak bu saattir.
      const stamps = await panel.locator('.vol-event-log__timestamp').allTextContents();
      expect(stamps.at(-1) ?? stamps[0]).toBe(expected);
    });

    test('commit anı: Enter ile işlenince saat arayüz dilinde yazılır', async ({ page }) => {
      await openShowcase(page);
      await selectTab(page, 'workbench');
      const panel = page.locator('[role="tabpanel"]:not([aria-hidden="true"])');
      const field = panel.locator('.vol-showcase-workbench-fields input').first();
      await field.fill('hero.png');
      await field.press('Enter');
      const expected = await page.evaluate(
        (l) =>
          new Intl.DateTimeFormat(l, { timeStyle: 'medium' }).format(
            new Date(Date.UTC(2026, 0, 1)),
          ),
        lng,
      );
      await expect(panel.getByText(/hero\.png · /)).toContainText(expected);
    });

    test('saniye birimi: bekleme etiketi dile göre birimle yazılır', async ({ page }) => {
      await openShowcase(page);
      await selectTab(page, 'forms');
      const unit = await page.evaluate(
        (l) =>
          new Intl.NumberFormat(l, {
            style: 'unit',
            unit: 'second',
            unitDisplay: 'narrow',
            maximumFractionDigits: 0,
          }).format(4),
        lng,
      );
      const label = page
        .locator('[role="tabpanel"]:not([aria-hidden="true"])')
        .locator('.vol-timer-bar__label')
        .first();
      await expect(label).toContainText(unit);
    });
  });
}

test('iki dilin biçim çıktısı gerçekten farklı (biçim sistem yerelinden bağımsız)', async ({
  browser,
}) => {
  const read = async (tag: string): Promise<string> => {
    const context = await browser.newContext({ locale: tag, timezoneId: 'UTC' });
    const page = await context.newPage();
    await openShowcase(page);
    await selectTab(page, 'workbench');
    const text = await page
      .locator('[role="tabpanel"]:not([aria-hidden="true"])')
      .getByText(/^Zoom\s/)
      .first()
      .textContent();
    await context.close();
    return text ?? '';
  };
  const [tr, en] = [await read('tr-TR'), await read('en-US')];
  expect(tr).not.toBe(en);
});
