import { expect, test } from '@playwright/test';
import { selectTab } from './support/determinism';

/**
 * Düğme içi ikon ölçeği (UI-03.1): ikon kutusu düğme boyutunu izleyen TAMSAYI pikseldir
 * (sm 16, md 20, lg 24; `--vol-icon-*`). Kesirli kutu (eski 1,3 em → 18,2 px) dolu siluetin
 * kenarını bulandırıyordu. Oran da ölçülür: ikon, ikon düğmesinin yaklaşık yarısıdır; etiketli
 * düğmede ikon etiket yazısından büyük ama onu bastıracak kadar değildir.
 */
const SCALE: Record<string, number> = { sm: 16, md: 20, lg: 24 };

interface Measured {
  kind: 'icon-button' | 'button';
  size: 'sm' | 'md' | 'lg';
  iconWidth: number;
  iconHeight: number;
  buttonHeight: number;
  fontPx: number;
}

test('düğme içi ikonlar tamsayı ölçekte ve düğme boyutuyla orantılıdır', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('[role="tablist"]');
  await page.evaluate(() => document.fonts.ready);
  await selectTab(page, 'buttons');

  const measured = await page.evaluate((): Measured[] => {
    const out: Measured[] = [];
    for (const icon of document.querySelectorAll<HTMLElement>(
      '.vol-icon-button__icon, .vol-button__icon',
    )) {
      const button = icon.closest<HTMLElement>('.vol-icon-button, .vol-button');
      if (!button || button.offsetParent === null) continue;
      const kind = button.classList.contains('vol-icon-button') ? 'icon-button' : 'button';
      const size = button.classList.contains(`vol-${kind}--sm`)
        ? 'sm'
        : button.classList.contains(`vol-${kind}--lg`)
          ? 'lg'
          : 'md';
      const box = icon.getBoundingClientRect();
      out.push({
        kind,
        size,
        iconWidth: box.width,
        iconHeight: box.height,
        buttonHeight: button.getBoundingClientRect().height,
        fontPx: parseFloat(getComputedStyle(button).fontSize),
      });
    }
    return out;
  });

  expect(measured.length, 'ikonlu düğme bulunamadı: ölçüm geçersiz').toBeGreaterThan(8);
  expect(new Set(measured.map((m) => m.size)).size, 'sm/md/lg üçü de ölçülmeli').toBe(3);
  for (const m of measured) {
    const label = `${m.kind}/${m.size}`;
    expect(m.iconWidth, `${label} genişlik`).toBe(SCALE[m.size]);
    expect(m.iconHeight, `${label} yükseklik`).toBe(SCALE[m.size]);
    if (m.kind === 'icon-button') {
      const ratio = m.iconHeight / m.buttonHeight;
      expect(ratio, `${label} ikon/düğme oranı`).toBeGreaterThan(0.45);
      expect(ratio, `${label} ikon/düğme oranı`).toBeLessThan(0.65);
    } else {
      const ratio = m.iconHeight / m.fontPx;
      expect(ratio, `${label} ikon/yazı oranı`).toBeGreaterThanOrEqual(1);
      expect(ratio, `${label} ikon/yazı oranı`).toBeLessThanOrEqual(1.7);
    }
  }
});
