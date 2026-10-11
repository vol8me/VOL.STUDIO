import { expect, test } from '@playwright/test';
import { openShowcase } from './support/determinism';

/**
 * `showFatalStartupError` yüzeyi (UI-09.1 denetimi): uzun hata ayrıntısı ekrandan taşar; yüzey kaydırılabilir
 * olmalı, başlık üstten kesilmemeli ve klavyeyle kaydırılabilmelidir. İşlevin ürettiği yapı (sınıflar, `h1`/`p`,
 * `tabindex=0`) birim testte sınanır; burada aynı yapı gerçek CSS ile gerçek tarayıcıda ölçülür. Öğe sayfaya
 * ELLE kurulur çünkü işlev tarayıcı paketinden çağrılamaz; yapı `FatalStartupError.ts`i yansıtır.
 */
test.describe('showFatalStartupError', () => {
  test('uzun ayrıntı yüzeyi kaydırılabilir kılar, başlık kesilmez ve klavyeyle kaydırılır', async ({
    page,
  }) => {
    await openShowcase(page);
    await page.setViewportSize({ width: 800, height: 400 });

    await page.evaluate(() => {
      const overlay = document.createElement('div');
      overlay.className = 'vol-fatal-startup';
      overlay.id = 'fatal-probe';
      overlay.setAttribute('role', 'alert');
      overlay.tabIndex = 0;
      const title = document.createElement('h1');
      title.className = 'vol-fatal-startup__title';
      title.textContent = 'Başlatılamadı';
      const detail = document.createElement('p');
      detail.className = 'vol-fatal-startup__detail';
      detail.textContent = Array.from(
        { length: 80 },
        (_, i) => `at frame ${i} (module.js:${i})`,
      ).join('\n');
      detail.style.whiteSpace = 'pre-wrap';
      overlay.append(title, detail);
      document.body.appendChild(overlay);
      overlay.focus();
    });

    const overlay = page.locator('#fatal-probe');
    const metrics = await overlay.evaluate((element) => ({
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      overflowY: getComputedStyle(element).overflowY,
      scrollTop: element.scrollTop,
      titleTop: element.querySelector('h1')!.getBoundingClientRect().top,
    }));
    expect(metrics.overflowY).toBe('auto');
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
    expect(metrics.scrollTop).toBe(0);
    expect(metrics.titleTop, 'başlık görüntü alanının üstünden kesilmemeli').toBeGreaterThanOrEqual(
      0,
    );

    await page.keyboard.press('End');
    await expect
      .poll(
        () =>
          overlay.evaluate(
            (element) => element.scrollTop + element.clientHeight >= element.scrollHeight - 1,
          ),
        { message: 'End yüzeyin sonuna kaydırmalı' },
      )
      .toBe(true);
  });

  test('kısa ayrıntıda yüzey ortalanır ve kaydırma çubuğu çıkmaz', async ({ page }) => {
    await openShowcase(page);
    await page.evaluate(() => {
      const overlay = document.createElement('div');
      overlay.className = 'vol-fatal-startup';
      overlay.id = 'fatal-short';
      const title = document.createElement('h1');
      title.className = 'vol-fatal-startup__title';
      title.textContent = 'Başlatılamadı';
      overlay.append(title);
      document.body.appendChild(overlay);
    });
    const overlay = page.locator('#fatal-short');
    const box = await overlay.evaluate((element) => {
      const heading = element.querySelector('h1')!.getBoundingClientRect();
      return {
        scrolls: element.scrollHeight > element.clientHeight,
        centerY: heading.top + heading.height / 2,
        viewport: window.innerHeight,
      };
    });
    expect(box.scrolls).toBe(false);
    expect(Math.abs(box.centerY - box.viewport / 2)).toBeLessThan(40);
  });
});
