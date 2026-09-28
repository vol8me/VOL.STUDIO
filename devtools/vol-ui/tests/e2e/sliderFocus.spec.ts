import { expect, test } from '@playwright/test';
import { openShowcase, selectTab } from './support/determinism';

for (const orientation of ['horizontal', 'vertical']) {
  test(`${orientation} slider klavye halkası opak track üzerinde görünür`, async ({ page }) => {
    await openShowcase(page);
    await selectTab(page, 'forms');
    await page.keyboard.press('Tab');
    const input = page.locator(`.vol-slider--${orientation} .vol-slider__input`).first();
    await input.focus();
    await expect(input).toBeFocused();
    await expect
      .poll(() => input.evaluate((element) => element.matches(':focus-visible')))
      .toBe(true);
    expect(await input.evaluate((element) => getComputedStyle(element).opacity)).toBe('0');
    const track = input.locator('..');
    await expect
      .poll(() => track.evaluate((element) => getComputedStyle(element).outlineStyle))
      .toBe('solid');
    expect(
      await track.evaluate((element) => Number.parseFloat(getComputedStyle(element).outlineWidth)),
    ).toBeGreaterThanOrEqual(2);
    expect(await track.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe('none');
  });
}
