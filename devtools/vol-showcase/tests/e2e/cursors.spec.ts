import { expect, test, type Page } from '@playwright/test';
import { selectTab } from './support/determinism';

/**
 * İmleç sistemi, gerçek tarayıcıda: arayüz imleçleri değişkenden okunur, RTS bağlamı şekil ve
 * ton değiştirir, nişangâh işaretçiyi aynı olayda izler. Headless ortam imleç görüntüsünü
 * çizmez; burada ölçülen hesaplanmış `cursor` değeri ve nişangâhın konumudur.
 */
async function openIdentity(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('[role="tablist"]');
  await selectTab(page, 'kimlik');
  await page.waitForSelector('[data-arena="rts"]');
  // Kayıt yüklenmeden imleç yoktur: galeri dolunca hazır.
  await page.waitForSelector('[data-cursor-id="attack"]');
}

const cursorOf = (page: Page, selector: string) =>
  page.locator(selector).evaluate((element) => getComputedStyle(element).cursor);

test('arayüz imleçleri: düğme eli ve sayfa oku değişkenden gelir', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('[role="tablist"]');
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.style.getPropertyValue('--vol-cursor-link')),
    )
    .toContain('data:image/svg+xml');
  const button = page.locator('button.vol-button').first();
  await expect(button).toBeVisible();
  expect(await cursorOf(page, 'button.vol-button >> nth=0')).toContain('data:image/svg+xml');
});

test('RTS arenası: bağlama göre şekil ve ton değişir, kenar kaydırma oku çıkar', async ({
  page,
}) => {
  await openIdentity(page);
  const arena = page.locator('[data-arena="rts"]');
  const readout = page.locator('[data-ses="arena-rts"]');
  await expect(readout).toHaveAttribute('data-value', 'idle/select/neutral');

  const expectations: Array<[string, string]> = [
    ['hostile', 'hostile/attack/hostile'],
    ['friendly', 'friendly/select/friendly'],
    ['resource', 'resource/mine/caution'],
    ['tree', 'tree/chop/caution'],
    ['blocked', 'blocked/denied/hostile'],
  ];
  const cursors = new Set<string>();
  for (const [context, value] of expectations) {
    await page.locator(`[data-ctx="${context}"]`).hover();
    await expect(readout).toHaveAttribute('data-value', value);
    const css = await cursorOf(page, '[data-arena="rts"]');
    expect(css).toContain('data:image/svg+xml');
    cursors.add(css);
  }
  // Her bağlam ayrı bir imleç görseli üretir.
  expect(cursors.size).toBe(expectations.length);

  const box = (await arena.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 3);
  await expect(readout).toHaveAttribute('data-value', 'scrollN/scrollN/neutral');
  await page.mouse.move(box.x + box.width - 3, box.y + box.height - 3);
  await expect(readout).toHaveAttribute('data-value', 'scrollSE/scrollSE/neutral');
});

test('nişangâh arenası: yerel imleç gizli, nişangâh işaretçiyi aynı olayda izler, tık atış ve isabet sayar', async ({
  page,
}) => {
  await openIdentity(page);
  const arena = page.locator('[data-arena="shooter"]');
  expect(await cursorOf(page, '[data-arena="shooter"]')).toBe('none');
  // Alan görünür bölgeye alınır: fare konumu görünüm alanı koordinatıdır.
  await arena.scrollIntoViewIfNeeded();
  const box = (await arena.boundingBox())!;
  const reticle = page.locator('.vol-reticle');
  await expect(reticle).toBeHidden();

  const x = box.x + 40;
  const y = box.y + 40;
  await page.mouse.move(x, y);
  await expect(reticle).toBeVisible();
  // Olay içinde yazılan konum, çizilen merkezle ≤1 CSS piksel örtüşür.
  const center = await reticle.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  expect(Math.abs(center.x - x)).toBeLessThanOrEqual(1);
  expect(Math.abs(center.y - y)).toBeLessThanOrEqual(1);
  for (const [dx, dy] of [
    [120, 90],
    [200, 150],
    [60, 200],
  ]) {
    await page.mouse.move(box.x + dx, box.y + dy);
    const rect = await reticle.evaluate((element) => {
      const r = element.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    expect(Math.abs(rect.x - (box.x + dx))).toBeLessThanOrEqual(1);
    expect(Math.abs(rect.y - (box.y + dy))).toBeLessThanOrEqual(1);
  }

  const shots = page.locator('[data-ses="arena-shooter"]');
  await expect(shots).toHaveAttribute('data-value', '0/0');
  await page.mouse.click(box.x + 5, box.y + box.height - 5); // boş alan: atış, isabet yok
  await expect(shots).toHaveAttribute('data-value', '1/0');
  await page.locator('[data-target="0"]').click(); // hedef: atış + isabet
  await expect(shots).toHaveAttribute('data-value', '2/1');

  await page.mouse.move(box.x - 40, box.y - 40);
  await expect(reticle).toBeHidden();
});

test('galeri: her kayıtlı imleç ve nişangâh bir önizleme taşır', async ({ page }) => {
  await openIdentity(page);
  await expect(page.locator('[data-cursor-id]')).toHaveCount(39 + 0, { timeout: 15_000 });
  await expect(page.locator('[data-reticle-id]')).toHaveCount(20);
  for (const cell of await page.locator('[data-cursor-id]').all()) {
    await expect(cell.locator('svg')).toHaveCount(1);
  }
});
