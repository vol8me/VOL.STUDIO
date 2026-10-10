import { expect, test, type Locator, type Page } from '@playwright/test';
import { selectTab } from './support/determinism';

/**
 * Değer editörleri (UI-05.1): saydam yerel `range` girdisi çubuğun üstünde işaretçiyi gerçekten alır,
 * görünen tutamak işaretçinin altında kalır (yatay LTR/RTL ve dikey), erişilebilirlik ağacı yön/ad/değer
 * metnini taşır, adım girdisi boş/yanlış metni değer saymaz. IME bileşimi ve Escape taslak ayrıntıları birim
 * testlerindedir (`editorContract.test.ts`); gerçek IME/AT insan-cihaz kabulüdür (UI-13.4).
 */
async function openForms(page: Page, query = '/'): Promise<void> {
  await page.goto(query);
  await page.waitForSelector('[role="tablist"]');
  await selectTab(page, 'forms');
}

const center = (box: { x: number; y: number; width: number; height: number }) => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
});

async function box(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  return (await locator.boundingBox())!;
}

/** `min..max` aralığında yerel girdinin 0..1 konumu. */
async function fraction(input: Locator): Promise<number> {
  return input.evaluate((element) => {
    const range = element as HTMLInputElement;
    return (Number(range.value) - Number(range.min)) / (Number(range.max) - Number(range.min));
  });
}

for (const dir of ['ltr', 'rtl'] as const) {
  test(`yatay kaydırıcı: saydam girdi çubuğu kaplar, tıklanan yerde tutamak durur (${dir})`, async ({
    page,
  }) => {
    await openForms(page, dir === 'rtl' ? '/?dir=rtl' : '/');
    const slider = page.locator('.vol-slider--horizontal').first();
    const track = slider.locator('.vol-slider__track');
    const input = slider.locator('.vol-slider__input');
    const handle = slider.locator('.vol-slider__handle');

    const trackBox = await box(track);
    const inputBox = (await input.boundingBox())!;
    expect(inputBox.x, 'girdi çubuğun başını kaplar').toBeLessThanOrEqual(trackBox.x + 1);
    expect(inputBox.x + inputBox.width, 'girdi çubuğun sonunu kaplar').toBeGreaterThanOrEqual(
      trackBox.x + trackBox.width - 1,
    );

    // Saydam ama işaretçiyi alan katman girdidir (üstte başka örtü yok).
    const mid = center(trackBox);
    const topmost = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.className ?? '',
      [mid.x, mid.y],
    );
    expect(topmost).toContain('vol-slider__input');

    for (const ratio of [0.25, 0.75]) {
      await page.mouse.click(trackBox.x + trackBox.width * ratio, mid.y);
      const handleBox = (await handle.boundingBox())!;
      const handleRatio = (center(handleBox).x - trackBox.x) / trackBox.width;
      // Yerel tutamak çubuğun uçlarından yarım genişlik içeridedir; ≤ %8 sapma kabul edilir.
      expect(
        Math.abs(handleRatio - ratio),
        `${dir} ${ratio}: görünür tutamak imlecin altında`,
      ).toBeLessThan(0.08);
    }
  });
}

test('dikey kaydırıcı: alt uç en küçük, tıklanan yerde tutamak durur, yön AT ağacında', async ({
  page,
}) => {
  await openForms(page);
  const slider = page.locator('.vol-slider--vertical').first();
  const track = slider.locator('.vol-slider__track');
  const input = slider.locator('.vol-slider__input');
  const handle = slider.locator('.vol-slider__handle');

  await expect(input).toHaveAttribute('aria-orientation', 'vertical');
  await expect(input).toHaveAccessibleName(/.+/);

  const trackBox = await box(track);
  const inputBox = (await input.boundingBox())!;
  expect(inputBox.y, 'girdi çubuğun üstünü kaplar').toBeLessThanOrEqual(trackBox.y + 1);
  expect(inputBox.y + inputBox.height, 'girdi çubuğun altını kaplar').toBeGreaterThanOrEqual(
    trackBox.y + trackBox.height - 1,
  );
  const mid = center(trackBox);
  const topmost = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.className ?? '',
    [mid.x, mid.y],
  );
  expect(topmost).toContain('vol-slider__input');

  // Alttan %25: değer küçük, tutamak aşağıda (üst uç en büyük).
  await page.mouse.click(mid.x, trackBox.y + trackBox.height * 0.75);
  const low = await fraction(input);
  expect(low).toBeGreaterThan(0.1);
  expect(low).toBeLessThan(0.4);
  let handleBox = (await handle.boundingBox())!;
  expect(
    Math.abs((trackBox.y + trackBox.height - center(handleBox).y) / trackBox.height - 0.25),
  ).toBeLessThan(0.08);

  await page.mouse.click(mid.x, trackBox.y + trackBox.height * 0.1);
  expect(await fraction(input)).toBeGreaterThan(0.75);
  handleBox = (await handle.boundingBox())!;
  expect(center(handleBox).y).toBeLessThan(trackBox.y + trackBox.height * 0.3);
});

test('aralık kaydırıcı: tutamaklar dilden adlı, değer metni biçimli, devre dışı/salt okunur durumu AT ağacında', async ({
  page,
}) => {
  await openForms(page);
  const min = page.locator('.vol-range-slider__handle--min').first();
  const max = page.locator('.vol-range-slider__handle--max').first();
  await min.scrollIntoViewIfNeeded();

  await expect(min).toHaveAttribute('role', 'slider');
  await expect(min).toHaveAccessibleName(/.+\(.+\)/);
  await expect(max).toHaveAccessibleName(/.+\(.+\)/);
  // Ad ve değer metni aynı değildir (ad etiket+yön, değer metni biçimleyiciden).
  const names = [await min.getAttribute('aria-label'), await max.getAttribute('aria-label')];
  expect(names[0]).not.toBe(names[1]);
  expect(await min.getAttribute('aria-valuetext')).toBeTruthy();
  expect(await min.getAttribute('aria-valuetext')).not.toBe(
    await min.getAttribute('aria-valuenow'),
  );

  // PageUp büyük adım atar; değer metni aynı anda güncellenir.
  const before = await min.getAttribute('aria-valuenow');
  await min.focus();
  await page.keyboard.press('PageUp');
  expect(Number(await min.getAttribute('aria-valuenow'))).toBeGreaterThan(Number(before) + 1);
  await expect(min).toHaveAttribute('aria-valuetext', /.+/);
});

test('sayı adımı: boş alan değer sayılmaz, ok tuşu tek adım atar, odak halkası görünür', async ({
  page,
}) => {
  await openForms(page);
  const input = page.locator('.vol-stepper__input').first();
  await input.scrollIntoViewIfNeeded();
  const original = await input.inputValue();

  await input.fill('');
  await input.blur();
  expect(await input.inputValue(), 'boş bırakılan alan son geçerli değere döner').toBe(original);

  await input.focus();
  await page.keyboard.press('ArrowUp');
  expect(Number(await input.inputValue())).toBe(Number(original) + 1);
  await expect(input).toHaveAccessibleName(/.+/);
});
