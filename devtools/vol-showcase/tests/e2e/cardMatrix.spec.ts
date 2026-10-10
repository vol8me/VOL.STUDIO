import { expect, test, type Page } from '@playwright/test';
import { selectTab } from './support/determinism';

/**
 * Kart durum matrisi (UI-04.1): nadirlik × normal / devre dışı / kilitli; salt sunum, kompakt, ikincil
 * eylem, sürüklenebilir ve sürüklenen kart; uzun metin + 6 haneli fiyat kartları. Sözleşme: eylem düğmesi her durumda kartın içinde görünür kalır, metin kartın dışına taşmaz,
 * nadirlik renk dışı işaretle (baklava sayısı) de okunur, kilitli kart kesikli çerçeve taşır, düğmeler
 * kartın adıyla adlandırılır. İki kaplama (default/aurum), iki görünüm alanı ve metin %200 büyütülmüş
 * ikinci geçiş (yerelleştirme/uzun içerik stresi) ölçülür; yerel dil +%30 taraması `pseudoLocale.spec.ts`te.
 */
const TIER: Record<string, number> = { rare: 1, epic: 2, legendary: 3 };
/** Eylem düğmesi sayısı sapan durumlar (varsayılan 1): salt sunumda yok, ikincil eylemli kartlarda iki. */
const ACTIONS: Record<string, number> = {
  display: 0,
  compact: 1,
  secondary: 2,
  draggable: 1,
  dragging: 1,
  stress: 2,
};

interface TileReport {
  state: string;
  rarity: string;
  pips: number;
  pipsHidden: boolean;
  actions: number;
  actionsInside: boolean;
  spill: string[];
  clipped: string[];
  outlineStyle: string;
  disabled: boolean;
  grouped: boolean;
}

async function measure(page: Page, grow: boolean): Promise<TileReport[]> {
  return page.evaluate((doubleText): TileReport[] => {
    const tiles = [...document.querySelectorAll<HTMLElement>('[data-card-matrix] .vol-card')];
    if (doubleText) {
      for (const tile of tiles) {
        for (const el of tile.querySelectorAll<HTMLElement>(
          '.vol-card__title, .vol-card__description, .vol-card__price, .vol-card__status, .vol-card__rarity, .vol-card__type, .vol-card__action',
        )) {
          const text = el.textContent ?? '';
          el.textContent = `${text} ${text}`;
        }
      }
    }
    return tiles.map((tile): TileReport => {
      const box = tile.getBoundingClientRect();
      const rarity = (['rare', 'epic', 'legendary'] as const).find((name) =>
        tile.classList.contains(`vol-card--${name}`),
      )!;
      const pips = tile.querySelector<HTMLElement>('.vol-card__pips');
      const actions = [...tile.querySelectorAll<HTMLElement>('.vol-card__action')];
      const spill: string[] = [];
      const clipped: string[] = [];
      for (const el of tile.querySelectorAll<HTMLElement>('*')) {
        if (!el.textContent?.trim() || el.children.length > 0) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (
          rect.left < box.left - 1 ||
          rect.right > box.right + 1 ||
          rect.bottom > box.bottom + 1
        ) {
          spill.push(`${el.className}: ${Math.round(rect.right)} > ${Math.round(box.right)}`);
        }
        if (el.scrollWidth > el.clientWidth + 1) clipped.push(el.className);
      }
      return {
        state: tile.dataset.cardState ?? '',
        rarity,
        pips: pips?.querySelectorAll('svg').length ?? 0,
        pipsHidden: pips?.getAttribute('aria-hidden') === 'true',
        actions: actions.length,
        actionsInside: actions.every((action) => {
          const rect = action.getBoundingClientRect();
          return (
            rect.height > 0 &&
            rect.left >= box.left - 1 &&
            rect.right <= box.right + 1 &&
            rect.top >= box.top - 1 &&
            rect.bottom <= box.bottom + 1
          );
        }),
        spill,
        clipped,
        outlineStyle: getComputedStyle(tile).outlineStyle,
        disabled: actions[0] instanceof HTMLButtonElement && actions[0].disabled,
        grouped:
          tile.getAttribute('role') === 'group' &&
          !!document.getElementById(tile.getAttribute('aria-labelledby') ?? ''),
      };
    });
  }, grow);
}

const VIEWPORTS = [
  { name: '1280x800', width: 1280, height: 800 },
  { name: '360x740', width: 360, height: 740 },
] as const;

for (const skin of ['default', 'aurum'] as const) {
  for (const viewport of VIEWPORTS) {
    for (const grow of [false, true]) {
      const label = `${skin} ${viewport.name}${grow ? ' (metin ×2)' : ''}`;
      test(`kart matrisi: ${label}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto('/');
        await page.waitForSelector('[role="tablist"]');
        if (skin === 'aurum') {
          await page.locator('.vol-showcase-skin-button').click();
          await expect(page.locator('.vol-showcase-skin-button')).toHaveAttribute(
            'data-skin',
            'aurum',
          );
        }
        await page.evaluate(() => document.fonts.ready);
        await selectTab(page, 'cards');

        const reports = await measure(page, grow);
        expect(reports, 'matris: 9 durum + 5 varyant + 3 stres kartı').toHaveLength(17);
        expect(new Set(reports.map((r) => r.state))).toEqual(
          new Set([...Object.keys(ACTIONS), 'normal', 'disabled', 'locked']),
        );
        for (const r of reports) {
          const id = `${r.state}/${r.rarity}`;
          expect(r.pips, `${id} baklava sayısı`).toBe(TIER[r.rarity]);
          expect(r.pipsHidden, `${id} baklava okuyucudan gizli`).toBe(true);
          expect(r.grouped, `${id} grup + ad bağı`).toBe(true);
          expect(r.actions, `${id} eylem düğmesi sayısı`).toBe(ACTIONS[r.state] ?? 1);
          expect(r.actionsInside, `${id} eylem düğmeleri kartın içinde görünür`).toBe(true);
          expect(r.spill, `${id} metin kartın dışına taşmaz`).toEqual([]);
          expect(r.clipped, `${id} metin kırpılmaz`).toEqual([]);
          expect(r.outlineStyle, `${id} çerçeve`).toBe(r.state === 'locked' ? 'dashed' : 'none');
          expect(r.disabled, `${id} devre dışı`).toBe(r.state === 'disabled');
        }
      });
    }
  }
}

test('kart düğmeleri aynı etikete rağmen kartın adıyla ayrışır', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('[role="tablist"]');
  await selectTab(page, 'cards');
  const matrix = page.locator('[data-card-matrix="states"]');
  // Etiket aynı ("BUY"), kart adı farklı: okuyucu üç nadirliği ayırt eder.
  for (const title of ['Turret', 'Chain Lightning', 'Inferno']) {
    await expect(matrix.getByRole('button', { name: `BUY ${title}`, exact: true })).toHaveCount(3);
  }
  await expect(matrix.getByRole('group', { name: 'Turret', exact: true })).toHaveCount(3);
});

test.describe('seçici durumları (seviye atlama)', () => {
  const layer = '.vol-showcase-card-layer:not([hidden])';

  test('yükleniyor: nazik bildirim + aria-busy; teklifler gelince bildirim kalkar', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForSelector('[role="tablist"]');
    await selectTab(page, 'cards');
    await page.getByRole('button', { name: 'LEVEL-UP: LOADING', exact: true }).click();
    const notice = page.locator(`${layer} .vol-card-picker__notice`);
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute('role', 'status');
    await expect(notice).toHaveText('Loading offers');
    await expect(page.locator(`${layer} .vol-card-picker__grid`)).toHaveAttribute(
      'aria-busy',
      'true',
    );
    await expect(page.locator(`${layer} .vol-card`)).toHaveCount(0);
    await expect(page.locator(`${layer} .vol-card`)).toHaveCount(2, { timeout: 5000 });
    await expect(notice).toBeHidden();
  });

  test('hata: alert bildirimi son tekliflerle birlikte; seçim bildirimi sonraki açılışa sızdırmaz', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForSelector('[role="tablist"]');
    await selectTab(page, 'cards');
    await page.getByRole('button', { name: 'LEVEL-UP: ERROR', exact: true }).click();
    const notice = page.locator(`${layer} .vol-card-picker__notice`);
    await expect(notice).toHaveAttribute('role', 'alert');
    await expect(notice).toContainText('could not be refreshed');
    await expect(page.locator(`${layer} .vol-card`)).toHaveCount(2);
    await page.locator(`${layer} .vol-card__action`).first().click();
    // Seçim katmanı kapatır (kapanışta ikinci tıklama sayılmaz: birim testi `cardPickerStates`).
    await expect(page.locator('.vol-showcase-card-layer[hidden]')).toHaveCount(2);
    await page.getByRole('button', { name: 'OPEN LEVEL-UP', exact: true }).click();
    await expect(page.locator(`${layer} .vol-card-picker__notice`)).toBeHidden();
  });
});
