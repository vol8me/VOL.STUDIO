import { expect, test, type Page } from '@playwright/test';

/**
 * Duraklatma/ayarlar tüketicisi: CORE Button/Slider/SegmentedControl/Modal'ın oyunun gerçek yerleşimindeki
 * davranışı (UI-03.3). Yeni menü yok; her denetim adlıdır, ekrana sığar ve merkezi başka öğe tarafından
 * örtülmez; klavye açar, Escape kapatır ve oyun devam eder.
 */
const DIALOG = '.vt-pause [role="dialog"], [role="dialog"].vt-pause, .vt-pause';
const OPEN = /vol-modal--visible/;
const CONTROLS = `${DIALOG} button, ${DIALOG} input, ${DIALOG} select, ${DIALOG} [role="radio"]`;

async function openPause(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('[data-testid="hud"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.vt-pause')).toHaveClass(OPEN);
}

test('duraklatma katmanı ekrana sığar; her denetim adlıdır ve merkezi hit-test ile kendisidir', async ({
  page,
}) => {
  await openPause(page);
  const report = await page.evaluate((selector) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const controls = [...document.querySelectorAll<HTMLElement>(selector)].filter(
      (el) => el.getBoundingClientRect().width > 0,
    );
    return controls.map((el) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      const labelled = el.getAttribute('aria-label') ?? el.getAttribute('aria-labelledby');
      const labels = (el as HTMLInputElement).labels;
      const name = (
        labelled ||
        el.textContent ||
        (labels && labels.length > 0 ? labels[0].textContent : '') ||
        el.closest('label')?.textContent ||
        el.parentElement?.getAttribute('aria-label') ||
        ''
      ).trim();
      return {
        tag: el.tagName.toLowerCase(),
        name,
        inside: rect.left >= -1 && rect.top >= -1 && rect.right <= vw + 1 && rect.bottom <= vh + 1,
        // Saydam yerel giriş (anahtar/kaydırıcı) kendi etiketi ya da adlı sarmalayıcısı tarafından karşılanır.
        hitIsSelf:
          hit === el ||
          el.contains(hit) ||
          (hit?.contains(el) ?? false) ||
          (el.closest('label, [data-testid]')?.contains(hit) ?? false),
      };
    });
  }, CONTROLS);

  expect(report.length, 'duraklatma denetimleri bulundu').toBeGreaterThanOrEqual(4);
  for (const control of report) {
    expect(control.inside, `${control.tag} "${control.name}" ekran içinde`).toBe(true);
    expect(control.name, `${control.tag} adı boş değil`).not.toBe('');
    expect(control.hitIsSelf, `${control.tag} "${control.name}" merkezi örtülmüyor`).toBe(true);
  }
});

test('klavye: odak katmanın içindedir, Escape kapatır ve oyun devam eder', async ({ page }) => {
  await openPause(page);
  const focusInside = await page.evaluate(
    () => document.querySelector('.vt-pause')?.contains(document.activeElement) ?? false,
  );
  expect(focusInside, 'odak duraklatma katmanında').toBe(true);

  await page.keyboard.press('Escape');
  await expect(page.locator('.vt-pause')).not.toHaveClass(OPEN);
  await expect
    .poll(
      () =>
        page.evaluate(
          () => !(document.querySelector('.vt-pause')?.contains(document.activeElement) ?? false),
        ),
      { message: 'kapanınca odak katmanda kalmaz' },
    )
    .toBe(true);
});

test('Devam düğmesi Enter ile katmanı kapatır; yeniden açılır', async ({ page }) => {
  await openPause(page);
  await page.locator('[data-testid="pause-resume"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.vt-pause')).not.toHaveClass(OPEN);
  // Kapanış geçişi bitip odak katmandan ayrılana kadar Escape oyuna ulaşmaz (insan eli bunu beklemez).
  await expect
    .poll(() =>
      page.evaluate(
        () => !(document.querySelector('.vt-pause')?.contains(document.activeElement) ?? false),
      ),
    )
    .toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('.vt-pause')).toHaveClass(OPEN);
});
