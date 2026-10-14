import { expect, test, type Page } from '@playwright/test';

/**
 * HUD işaretçi/girdi katmanı (UI-08.2): HUD kökü tuvalin üstünde tam ekran bir katmandır ve tıklamayı YUTMAMALIDIR.
 * Kural: yalnız etkileşimli parçalar (mini harita, tam ekran düğmesi, dokunmatik denetimler) kendi kutusunda işaretçi
 * yakalar; pasif plakalar (başlık, telemetri, ipuçları, iklim, FPS, can/ateş çubukları) ve boş alan altındaki oyun
 * tuvaline geçer. Kapalı duraklatma katmanı hiçbir noktayı yakalamaz. Ölçüm gerçek `document.elementFromPoint` iledir.
 */
const INTERACTIVE = [
  '.vt-hud__map',
  '.vt-hud__fullscreen',
  '.vt-hud__touch > *',
  '[data-testid="touch-controls"] > *',
].join(', ');

async function open(page: Page): Promise<void> {
  await page.goto('/?start=world');
  await expect(page.locator('#game > canvas')).toBeVisible();
  await expect(page.getByTestId('hud')).toBeVisible();
  // Açılış yükleme perdesi (kapanırken 240 ms geçiş) meşru olarak işaretçi yakalar; ölçüm perde kalktıktan sonra yapılır.
  await expect(page.locator('.vol-loading')).toHaveCount(0);
}

interface Hit {
  readonly label: string;
  readonly tag: string;
  /** Vurulan öğe oyun tuvali mi? */
  readonly canvas: boolean;
  /** Vurulan öğe HUD kökünün içinde mi? */
  readonly inHud: boolean;
  /** Vurulan öğe etkileşimli bir HUD parçasının içinde mi? */
  readonly inInteractive: boolean;
}

/** Viewport ızgarasındaki her noktanın vurduğu öğeyi sınıflandırır. */
async function sweep(page: Page, columns: number, rows: number): Promise<Hit[]> {
  return page.evaluate(
    ({ selector, columns, rows }) => {
      const hud = document.querySelector('[data-testid="hud"]')!;
      const hits: Hit[] = [];
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const x = ((column + 0.5) / columns) * window.innerWidth;
          const y = ((row + 0.5) / rows) * window.innerHeight;
          const hit = document.elementFromPoint(x, y);
          hits.push({
            label: `(${Math.round(x)},${Math.round(y)})`,
            tag: hit ? `${hit.tagName.toLowerCase()}.${hit.className}` : 'null',
            canvas: hit instanceof HTMLCanvasElement && hit.closest('#game') !== null,
            inHud: hit ? hud.contains(hit) : false,
            inInteractive: hit ? hit.closest(selector) !== null : false,
          });
        }
      }
      return hits;
    },
    { selector: INTERACTIVE, columns, rows },
  );
}

/** Pasif plakaların görünür kutularının merkezi ve ortası altındaki öğe. */
async function passiveReport(page: Page): Promise<
  Array<{
    selector: string;
    pointerEvents: string;
    hitInsideHud: boolean;
    hitIsCanvas: boolean;
    hitTag: string;
  }>
> {
  return page.evaluate(() => {
    const hud = document.querySelector('[data-testid="hud"]')!;
    const selectors = [
      '.vt-hud__title',
      '.vt-hud__telemetry',
      '.vt-hud__hints',
      '.vt-hud__climate',
      '.vol-fps-meter',
      '.vt-hud__boost-bar',
      '.vt-hud__fire-bar',
    ];
    const rows: Array<{
      selector: string;
      pointerEvents: string;
      hitInsideHud: boolean;
      hitIsCanvas: boolean;
      hitTag: string;
    }> = [];
    for (const selector of selectors) {
      for (const element of document.querySelectorAll<HTMLElement>(selector)) {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const hit = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        rows.push({
          selector,
          pointerEvents: getComputedStyle(element).pointerEvents,
          hitInsideHud: hit ? hud.contains(hit) : false,
          hitIsCanvas: hit instanceof HTMLCanvasElement,
          hitTag: hit ? `${hit.tagName.toLowerCase()}.${hit.className}` : 'null',
        });
      }
    }
    return rows;
  });
}

test.describe('masaüstü', () => {
  test('pasif plakalar tıklamayı yutmaz: işaretçi altındaki oyun tuvaline geçer', async ({
    page,
  }) => {
    await open(page);
    const rows = await passiveReport(page);
    expect(rows.length, 'pasif plakalar bulundu').toBeGreaterThanOrEqual(5);
    for (const row of rows) {
      expect(row.pointerEvents, `${row.selector} işaretçi olayı`).toBe('none');
      expect(row.hitInsideHud, `${row.selector} merkezi HUD tarafından yakalanıyor`).toBe(false);
      expect(
        row.hitIsCanvas,
        `${row.selector} merkezi tuvale geçiyor (vurulan: ${row.hitTag})`,
      ).toBe(true);
    }
  });

  test('ekranın her noktası ya oyun tuvalidir ya da etkileşimli bir HUD parçası', async ({
    page,
  }) => {
    await open(page);
    const hits = await sweep(page, 24, 14);
    const offenders = hits.filter((hit) => !hit.canvas && !hit.inInteractive);
    expect(
      offenders.map((hit) => `${hit.label} → ${hit.tag}`),
      'tuvali örten, etkileşimsiz HUD noktası yok',
    ).toEqual([]);
    expect(hits.filter((hit) => hit.canvas).length, 'tuvale geçen nokta çoğunluk').toBeGreaterThan(
      hits.length * 0.8,
    );
  });

  test('etkileşimli parçalar kendi kutularında işaretçiyi yakalar (örtülmez)', async ({ page }) => {
    await open(page);
    const rows = await page.evaluate((selector) => {
      const targets = [...document.querySelectorAll<HTMLElement>(selector)].filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && !element.hidden;
      });
      return targets.map((element) => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return {
          name: `${element.tagName.toLowerCase()}.${element.className}`.slice(0, 60),
          captured: hit !== null && (element === hit || element.contains(hit)),
        };
      });
    }, INTERACTIVE);
    expect(rows.length, 'etkileşimli parçalar bulundu (harita + tam ekran)').toBeGreaterThanOrEqual(
      2,
    );
    for (const row of rows)
      expect(row.captured, `${row.name} merkezi kendisini yakalar`).toBe(true);
  });

  test('kapalı duraklatma katmanı işaretçiyi yakalamaz; açılınca tüm ekranı yakalar', async ({
    page,
  }) => {
    await open(page);
    const blocking = await page.evaluate(() => {
      const hit = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      return (
        hit?.closest('.vt-pause, .vol-modal') !== null &&
        hit?.closest('.vt-pause, .vol-modal') !== undefined
      );
    });
    expect(blocking, 'kapalı katman merkezi yakalamaz').toBe(false);
    await page.keyboard.press('Escape');
    await expect(page.locator('.vt-pause')).toHaveClass(/vol-modal--visible/);
    const modal = await page.evaluate(() => {
      const corner = document.elementFromPoint(8, window.innerHeight - 8);
      return corner?.closest('.vt-pause, .vol-modal') !== null;
    });
    expect(modal, 'açık katman arka planı da yakalar (altındaki oyuna tıklama sızmaz)').toBe(true);
  });
});

test.describe('dokunmatik (telefon yatayı)', () => {
  test.use({ hasTouch: true });

  test('dokunmatik denetimler kendini yakalar, pasif plakalar ve boş alan tuvale geçer', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await open(page);
    await page.touchscreen.tap(420, 200);
    await expect(page.getByTestId('touch-brake')).toBeVisible();

    const touch = await page.evaluate(() => {
      const controls = [
        ...document.querySelectorAll<HTMLElement>('.vt-hud__touch > :not([hidden])'),
      ].filter((element) => element.getBoundingClientRect().width > 0);
      return controls.map((element) => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return {
          id: element.dataset.testid ?? element.className,
          pointerEvents: getComputedStyle(element).pointerEvents,
          captured: hit !== null && (element === hit || element.contains(hit)),
        };
      });
    });
    expect(touch.length, 'dokunmatik denetimler bulundu').toBeGreaterThanOrEqual(6);
    for (const control of touch) {
      expect(control.pointerEvents, `${control.id} işaretçi olayı`).toBe('auto');
      expect(control.captured, `${control.id} merkezi kendisini yakalar`).toBe(true);
    }

    const rows = await passiveReport(page);
    for (const row of rows) {
      expect(row.hitInsideHud, `${row.selector} dokunmatikte de tuvale geçer`).toBe(false);
    }

    const hits = await sweep(page, 20, 10);
    const offenders = hits.filter((hit) => !hit.canvas && !hit.inInteractive);
    expect(
      offenders.map((hit) => `${hit.label} → ${hit.tag}`),
      'dokunmatik kipte tuvali örten etkileşimsiz HUD noktası yok',
    ).toEqual([]);
  });
});
