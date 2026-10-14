import { expect, test, type Page } from '@playwright/test';

/**
 * Duraklatma/ayarlar tüketicisi: CORE Button/Slider/SegmentedControl/Modal'ın oyunun gerçek yerleşimindeki
 * davranışı (UI-03.3). Yeni menü yok; her denetim adlıdır, ekrana sığar ve merkezi başka öğe tarafından
 * örtülmez; klavye açar, Escape kapatır ve oyun devam eder.
 */
const OPEN = /vol-modal--visible/;
const CONTROLS = ['button', 'input', 'select', '[role="radio"]']
  .map((control) => `.vt-pause ${control}`)
  .join(', ');

async function openPause(page: Page): Promise<void> {
  await page.goto('/?start=world');
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

test('ayar satırı etiketi geniş denetimle (senaryo listesi) harf harf kırılmaz', async ({
  page,
}) => {
  await openPause(page);
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.vt-pause .vol-settings-row__label')]
      .map((el) => el.getBoundingClientRect())
      .filter((rect) => rect.width > 0)
      .map((rect) => rect.width),
  );
  expect(labels.length, 'etiketli ayar satırları bulundu').toBeGreaterThanOrEqual(3);
  for (const width of labels) expect(width, 'etiket sütunu sıkışmadı').toBeGreaterThanOrEqual(80);
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
  // Sürdürme basışı bastırır (`suppress`): oyun en az bir kare tuşun bırakıldığını görmeden Escape kenarı yutulur.
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
  // Basış bir kare sürmeli: kare başında okunan klavye, aynı karede basılıp bırakılan tuşu görmez (WebKit).
  await page.keyboard.down('Escape');
  await expect(page.locator('.vt-pause')).toHaveClass(OPEN);
  await page.keyboard.up('Escape');
});

test.describe('dokunmatik tablet (yatay, ~750 px CSS yükseklik)', () => {
  test.use({
    viewport: { width: 1250, height: 750 },
    deviceScaleFactor: 1.6,
    hasTouch: true,
    isMobile: true,
  });

  // Android'de ölçülen yerleşim: şeridin gövdesi kayar ama eylem şeridi (devam ve sürücü eylemleri)
  // hiçbir koşulda ekranın dışına düşmez ve gövdeyle üst üste binmez.
  test('duraklatma eylem şeridi ekran içindedir ve gövdeyi örtmez', async ({ page }) => {
    await openPause(page);
    const fit = await page.evaluate(() => {
      const box = (selector: string): DOMRect =>
        document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
      const footer = box('.vt-pause .vt-screen__actions');
      const body = box('.vt-pause .vt-screen__body');
      return {
        footerBottom: footer.bottom,
        bodyBottom: body.bottom,
        footerTop: footer.top,
        viewport: window.innerHeight,
      };
    });
    expect(fit.footerBottom).toBeLessThanOrEqual(fit.viewport);
    expect(fit.bodyBottom).toBeLessThanOrEqual(fit.footerTop + 1);
  });
});
