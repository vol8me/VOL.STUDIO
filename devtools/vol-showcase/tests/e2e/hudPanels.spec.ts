import { expect, test, type Locator, type Page } from '@playwright/test';
import { selectTab } from './support/determinism';
import { pixelContrast } from './support/finalContrast';

/**
 * HUD bilgi panelleri (UI-08.2) GERÇEK tarayıcıda, iki motorda: SelectionInfoPanel okuyucu sözleşmesi (adlı bölge,
 * yalnız seçili adı duyuran durum bölgesi, adlı can çubuğu), düşük canın renk DIŞI işaretleri (desen + "düşük" metni),
 * StatsPanel bölüm adları/liste anlamı ve FpsMeter uyarı/tehlike şekil işaretleri.
 *
 * Dondurma katmanı kullanılmaz: panel/çubuk zamanla değişir; sayfa varsayılan (İngilizce) dilde açılır.
 */
async function openHud(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('[role="tablist"]');
  await page.evaluate(() => document.fonts.ready);
  await selectTab(page, 'hud');
}

const press = (page: Page, name: string): Promise<void> =>
  page
    .locator('[role="tabpanel"]:not([aria-hidden="true"])')
    .getByRole('button', { name, exact: true })
    .first()
    .click();

const panel = (page: Page): Locator => page.locator('.vol-selection-panel').first();
const healthBar = (page: Page): Locator => panel(page).locator('.vol-bar');

test.describe('SelectionInfoPanel okuyucu', () => {
  test('kök adlı bölgedir; boşken durum bölgesi boş durumu söyler', async ({ page }) => {
    await openHud(page);
    const region = page.getByRole('region', { name: 'Selection', exact: true });
    await expect(region).toHaveCount(1);
    await expect(region).toBeAttached();
    await expect(region.locator('[role="status"]')).toHaveText('No selection');
  });

  test('seçimle durum bölgesi yalnız adı söyler (istatistik/düğme metni değil); temizleyince boş durum', async ({
    page,
  }) => {
    await openHud(page);
    await press(page, 'Select Tower');
    const status = panel(page).locator('[role="status"]');
    await expect(status).toHaveText('Selected: Arrow Tower Lv.2');
    await expect(status).toHaveAttribute('aria-live', 'polite');
    await press(page, 'Clear Selection');
    await expect(status).toHaveText('No selection');
  });

  test('durum bölgesi görünmez ama erişilebilirlik ağacındadır (sr-only, display:none değil)', async ({
    page,
  }) => {
    await openHud(page);
    await press(page, 'Select Tower');
    const style = await panel(page)
      .locator('[role="status"]')
      .evaluate((element) => {
        const computed = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return {
          display: computed.display,
          visibility: computed.visibility,
          width: box.width,
          height: box.height,
        };
      });
    expect(style.display).not.toBe('none');
    expect(style.visibility).toBe('visible');
    // Görsel olarak 1 piksellik kırpık kutu: yerleşimi bozmaz, okuyucudan gizlenmez.
    expect(style.width).toBeLessThanOrEqual(1.5);
    expect(style.height).toBeLessThanOrEqual(1.5);
  });

  test('can çubuğu adlıdır ve değer metnini taşır; istatistikler liste öğesidir', async ({
    page,
  }) => {
    await openHud(page);
    await press(page, 'Select Tower');
    const bar = healthBar(page);
    await expect(bar).toHaveAttribute('role', 'progressbar');
    await expect(bar).toHaveAttribute('aria-label', 'Health');
    await expect(bar).toHaveAttribute('aria-valuetext', '80 / 100');
    const list = panel(page).locator('.vol-selection-panel__stats');
    await expect(list).toHaveAttribute('role', 'list');
    await expect(list.getByRole('listitem')).toHaveCount(3);
  });

  test('düşük can: renk dışında desen (::after çizgi deseni) ve okuyucu metni "düşük" gelir', async ({
    page,
  }) => {
    await openHud(page);
    await press(page, 'Select Tower');
    const bar = healthBar(page);
    // Normalde desen yok.
    const patternOf = (): Promise<string> =>
      bar.evaluate(
        (element) =>
          getComputedStyle(element.querySelector('.vol-bar__fill')!, '::after').backgroundImage,
      );
    expect(await patternOf()).toBe('none');
    // 80 → 50 → 20: eşik %30 ⇒ 20/100 düşük.
    await press(page, 'Damage selected (-30)');
    await expect(bar).toHaveAttribute('aria-valuetext', '50 / 100');
    await press(page, 'Damage selected (-30)');
    await expect(bar).toHaveAttribute('aria-valuetext', '20 / 100, low');
    await expect(bar).toHaveClass(/vol-bar--low/);
    expect(await patternOf()).toContain('repeating-linear-gradient');
    // Gerçek bir 45° çizgi: tarayıcı gradyanı normalize eder ama açı korunur.
    expect(await patternOf()).toMatch(/45deg/);
    // Can yenilenince işaretler kalkar.
    await press(page, 'Select Tower');
    await expect(bar).toHaveAttribute('aria-valuetext', '80 / 100');
    expect(await patternOf()).toBe('none');
  });
});

test.describe('StatsPanel okuyucu', () => {
  test('bölüm başlığıyla adlanır; girdiler liste öğesidir', async ({ page }) => {
    await openHud(page);
    await press(page, 'Open Statistics');
    const group = page.locator('.vol-stats-panel__group').first();
    await expect(group).toBeVisible();
    const naming = await group.evaluate((element) => {
      const id = element.getAttribute('aria-labelledby');
      const heading = id ? document.getElementById(id) : null;
      return {
        id,
        headingText: heading?.textContent?.trim() ?? null,
        headingInside: heading ? element.contains(heading) : false,
      };
    });
    expect(naming.id).toMatch(/^vol-stats-group-\d+$/);
    expect(naming.headingInside).toBe(true);
    expect(naming.headingText).not.toBe('');
    const entries = group.locator('.vol-stats-panel__entries');
    await expect(entries).toHaveAttribute('role', 'list');
    await expect(entries.getByRole('listitem')).toHaveCount(4);
  });
});

test.describe('HUD işaretçi katmanı', () => {
  /**
   * Oyun HUD'u tuvalin üstünde `pointer-events: none` tam ekran bir köktür (VOL.TEST `.vt-hud`). Salt-gösterim plakaları
   * bu kökte tıklamayı yutmamalı; etkileşimli bileşenler kendi kutusunda yakalamalıdır. Sınıflar bileşenlerin gerçek
   * sınıflarıdır; kök ise HUD'un sözleşmesini kuran yalın bir kaptır.
   */
  test('salt-gösterim plakaları tıklamayı yutmaz, etkileşimli kutular yakalar', async ({
    page,
  }) => {
    await openHud(page);
    const report = await page.evaluate(() => {
      const root = document.createElement('div');
      root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483000';
      const make = (className: string, left: number): HTMLElement => {
        const element = document.createElement('div');
        element.className = className;
        element.textContent = className;
        element.style.cssText = `position:absolute;left:${left}px;top:200px;min-width:120px;min-height:40px`;
        root.appendChild(element);
        return element;
      };
      const plates = [
        make('vol-timer-bar', 20),
        make('vol-resource-bar', 180),
        make('vol-round-counter', 340),
      ];
      const interactive = [
        make('vol-minimap', 500),
        make('vol-action-bar', 660),
        make('vol-build-menu', 820),
      ];
      document.body.appendChild(root);
      const probe = (element: HTMLElement): { pointerEvents: string; captured: boolean } => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return {
          pointerEvents: getComputedStyle(element).pointerEvents,
          captured: hit === element || (hit !== null && element.contains(hit)),
        };
      };
      const result = {
        plates: plates.map(probe),
        interactive: interactive.map(probe),
      };
      root.remove();
      return result;
    });
    for (const plate of report.plates) {
      expect(plate.pointerEvents).toBe('none');
      expect(plate.captured).toBe(false);
    }
    for (const control of report.interactive) {
      expect(control.pointerEvents).toBe('auto');
      expect(control.captured).toBe(true);
    }
  });
});

test.describe('MinimapPanel paleti', () => {
  /**
   * Tuvalin sabit renkleri (zemin, kamera çerçevesi, sınır, vurgu, metin, imleç) tema belirteçlerinden okunur
   * (`resolveMinimapPalette`). Her biri zemine karşı WCAG metin-dışı 3:1'i (metin 4.5:1) iki skinde sağlar. Oyunun
   * kendi işaret renkleri sözleşme gereği tüketicidedir; sağlanan belirteçler okunur kalmalıdır.
   */
  for (const skin of ['default', 'aurum'] as const) {
    test(`${skin}: palet zeminine karşı yeterli kontrast taşır`, async ({ page }) => {
      await page.addInitScript((theme) => {
        localStorage.setItem('device.volui:theme', JSON.stringify(theme));
      }, skin);
      await openHud(page);
      await expect(page.locator('html')).toHaveAttribute('data-vol-theme', skin);
      const palette = await page
        .locator('.vol-minimap')
        .first()
        .evaluate((element) => {
          const style = getComputedStyle(element);
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 1;
          const context = canvas.getContext('2d', { willReadFrequently: true })!;
          const resolve = (token: string): [number, number, number, number] => {
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = '#000';
            context.fillStyle = style.getPropertyValue(token).trim();
            context.fillRect(0, 0, 1, 1);
            const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
            return [r, g, b, a / 255];
          };
          return {
            page: resolve('--vol-ui-bg'),
            well: resolve('--vol-ui-well'),
            frustum: resolve('--vol-ui-text'),
            text: resolve('--vol-ui-text-secondary'),
            bounds: resolve('--vol-ui-brand-solid'),
            cursor: resolve('--vol-ui-focus-ring'),
          };
        });
      // Zemin (yarı saydamsa sayfa rengi üstüne) opak piksele indirilir.
      const flatten = (
        [r, g, b, a]: readonly number[],
        under: readonly [number, number, number],
      ): [number, number, number] => [
        r * a + under[0] * (1 - a),
        g * a + under[1] * (1 - a),
        b * a + under[2] * (1 - a),
      ];
      const page0: [number, number, number] = [palette.page[0], palette.page[1], palette.page[2]];
      const well = flatten(palette.well, page0);
      const ratio = (key: 'frustum' | 'text' | 'bounds' | 'cursor'): number => {
        const [r, g, b, a] = palette[key];
        return pixelContrast({ r, g, b, a }, 1, well);
      };
      const measured = Object.fromEntries(
        (['frustum', 'bounds', 'cursor', 'text'] as const).map((key) => [
          key,
          Number(ratio(key).toFixed(2)),
        ]),
      );
      await test.info().attach(`palet-kontrast-${skin}`, {
        body: JSON.stringify(measured),
        contentType: 'application/json',
      });
      expect(ratio('frustum'), `${skin} kamera çerçevesi`).toBeGreaterThanOrEqual(3);
      expect(ratio('bounds'), `${skin} dünya sınırı/vurgu`).toBeGreaterThanOrEqual(3);
      expect(ratio('cursor'), `${skin} klavye imleci`).toBeGreaterThanOrEqual(3);
      expect(ratio('text'), `${skin} ölçek/kuzey metni`).toBeGreaterThanOrEqual(4.5);
    });
  }
});

test.describe('FpsMeter renk dışı işaretleri', () => {
  /** Düzeyi doğrudan CSS sözleşmesiyle (`data-level`) zorlar; gerçek FPS düşürmeye gerek yok. */
  async function borderAndRing(
    page: Page,
    level: 'normal' | 'warn' | 'danger',
  ): Promise<{ style: string; width: string; shadow: string; min: number }> {
    return page.evaluate((target) => {
      const element = document.querySelector<HTMLElement>('.vol-showcase-fps-meter')!;
      // Ölçüm yüzeyi için canlı örneğin kendi yeniden yazımını beklemeden değeri sabitle.
      element.dataset.level = target;
      const computed = getComputedStyle(element);
      return {
        style: computed.borderTopStyle,
        width: computed.borderTopWidth,
        shadow: computed.boxShadow,
        min: element.getBoundingClientRect().width,
      };
    }, level);
  }

  test('uyarı kesikli, tehlike iç halkalı; kutu ölçüsü düzeye göre değişmez', async ({ page }) => {
    await openHud(page);
    await expect(page.locator('.vol-showcase-fps-meter')).toBeAttached();
    const normal = await borderAndRing(page, 'normal');
    const warn = await borderAndRing(page, 'warn');
    const danger = await borderAndRing(page, 'danger');
    expect(normal.style).toBe('solid');
    expect(warn.style).toBe('dashed');
    expect(danger.style).toBe('solid');
    // Tehlike: normalde olmayan, kenar renginde 2px iç halka.
    expect(danger.shadow).toMatch(/inset/);
    expect(danger.shadow).toMatch(/\b2px\b/);
    // Kenar kalınlığı sabit ⇒ gösterge yer oynatmaz.
    expect(warn.width).toBe(normal.width);
    expect(danger.width).toBe(normal.width);
    expect(warn.min).toBeCloseTo(normal.min, 1);
    expect(danger.min).toBeCloseTo(normal.min, 1);
  });
});
