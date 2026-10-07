import { expect, test, type Page } from '@playwright/test';
import { openShowcase, selectTab } from './support/determinism';

/**
 * Ekran klavyesi geometri ve kullanım sözleşmesi: dikey/yatay telefon, dikey/yatay tablet ve Deck boyutu.
 * Gerçek cihaz (Android IME, Steam Deck kolu) ayrı kayıttır: bu test yalnız düzenin her pencerede
 * ekrana sığdığını, tuşların dokunulabilir olduğunu ve klavye/işaretçi ile yazılabildiğini kanıtlar.
 */
const VIEWPORTS = [
  { name: 'telefon dikey', width: 393, height: 851, minKey: 24 },
  { name: 'telefon yatay', width: 851, height: 393, minKey: 24 },
  { name: 'tablet dikey', width: 800, height: 1280, minKey: 40 },
  { name: 'tablet yatay', width: 1280, height: 800, minKey: 40 },
] as const;

async function openKeyboard(page: Page): Promise<void> {
  await selectTab(page, 'forms');
  await page.getByRole('button', { name: 'Open keyboard', exact: true }).click();
  await page.locator('.vol-osk').waitFor();
}

for (const viewport of VIEWPORTS) {
  test(`ekran klavyesi ${viewport.name} (${viewport.width}×${viewport.height}) ekrana sığar ve tuşlar dokunulabilir`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openShowcase(page);
    await openKeyboard(page);

    const geometry = await page.evaluate(() => {
      const osk = document.querySelector('.vol-osk') as HTMLElement;
      const box = osk.getBoundingClientRect();
      const keys = [...osk.querySelectorAll<HTMLElement>('.vol-osk__key')].map((key) => {
        const rect = key.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width, height: rect.height };
      });
      return {
        box: { top: box.top, bottom: box.bottom, left: box.left, right: box.right },
        overflowX: osk.scrollWidth - osk.clientWidth,
        keys,
        vw: window.innerWidth,
        vh: window.innerHeight,
      };
    });

    expect(geometry.box.top, 'klavye ekranın üstüne taşmadı').toBeGreaterThanOrEqual(-1);
    expect(geometry.box.bottom, 'klavye ekranın altına taşmadı').toBeLessThanOrEqual(
      geometry.vh + 1,
    );
    expect(geometry.overflowX, 'yatay taşma yok').toBeLessThanOrEqual(1);
    expect(geometry.keys.length).toBeGreaterThan(40);
    for (const key of geometry.keys) {
      expect(key.left).toBeGreaterThanOrEqual(-1);
      expect(key.right).toBeLessThanOrEqual(geometry.vw + 1);
      expect(key.width).toBeGreaterThanOrEqual(viewport.minKey);
      expect(key.height).toBeGreaterThanOrEqual(viewport.minKey === 24 ? 30 : 40);
    }
  });
}

test('ekran klavyesi işaretçiyle yazılır, imleç ve dil/sembol katmanları çalışır', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openShowcase(page);
  await openKeyboard(page);

  const value = page.locator('.vol-osk__value');
  const before = (await value.textContent())?.trim() ?? '';
  await page.locator('.vol-osk__key[data-value="x"]').click();
  await expect(value).toContainText(`${before}x`);
  await page.locator('.vol-osk__key[data-action="left"]').click();
  await page.locator('.vol-osk__key[data-value="y"]').click();
  await page.locator('.vol-osk__key[data-action="backspace"]').click();

  await page.locator('.vol-osk__key[data-action="symbols"]').click();
  await expect(page.locator('.vol-osk__key[data-value="@"]')).toBeVisible();
  await page.locator('.vol-osk__key[data-action="letters"]').click();

  // Düzen arayüz diliyle açılır (vitrin İngilizce: EN); dil tuşu onu arayüz dilinden bağımsız çevirir.
  const code = page.locator('.vol-osk__layout-code');
  await expect(code).toHaveText('EN');
  await expect(page.locator('.vol-osk__key[data-value="ş"]')).toHaveCount(0);
  await page.locator('.vol-osk__key[data-action="layout"]').click();
  await expect(code).toHaveText('TR');
  await expect(page.locator('.vol-osk__key[data-value="ş"]')).toHaveCount(1);

  await page.locator('.vol-osk__key[data-action="cancel"]').click();
  await expect(page.locator('.vol-osk')).toHaveCount(0);
});

test('ekran klavyesi klavye odağıyla gezilir: Tab sırası tuşları dolaşır, Enter yazar, Escape kapatır', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openShowcase(page);
  await openKeyboard(page);

  const focused = page.locator('.vol-osk__key:focus');
  await expect(focused).toHaveCount(1);
  const first = await focused.getAttribute('data-value');
  await page.keyboard.press('Tab');
  const second = await page.locator('.vol-osk__key:focus').getAttribute('data-value');
  expect(second).not.toBe(first);

  const value = page.locator('.vol-osk__value');
  const typed = await page.locator('.vol-osk__key:focus').getAttribute('data-value');
  await page.keyboard.press('Enter');
  await expect(value).toContainText(typed ?? '');

  await page.keyboard.press('Escape');
  await expect(page.locator('.vol-osk')).toHaveCount(0);
});
