import { expect, test, type Page } from '@playwright/test';
import { LAYER_SCENARIOS, openLayer } from './support/accessibility';
import { openShowcase, selectTab, SHOWCASE_TABS, type ShowcaseTab } from './support/determinism';

/**
 * Malzeme maliyet bütçesi (UI-01.7): her sekmede ve iki skinde görünür öğelerin çizim maliyeti
 * yüksek özellikleri sayılır. CONTRACT: UI kökünde en çok 1 etkin blur yüzeyi (`backdrop-filter`
 * ya da `filter: blur`); bulanık dış gölge ve katman sayısı ölçülen tavanda tutulur (kapı bir
 * ratchettir: artış bilinçli karardır, bütçe kayıtla yükseltilir).
 */
const SKINS = ['default', 'aurum'] as const;

/**
 * Tavanlar ölçülen değerin (hepsi 0: malzeme dilinde sert gölge, blur yok) üstünde paylı durur;
 * artış bilinçli karardır. `blurSurfaces` sözleşme değeridir (MOTION_BUDGET.blur).
 */
const BUDGET = {
  blurSurfaces: 1,
  blurredOuterShadowElements: 6,
  blurredOuterShadowLayers: 6,
  maxBlurPx: 24,
  maxLayersOnOneElement: 6,
  blurredTextShadowElements: 8,
} as const;

interface Cost {
  /** Etkin blur yüzeyleri (backdrop-filter ya da filter blur). */
  blurSurfaces: string[];
  /** Bulanık (blur > 0) DIŞ gölge taşıyan öğe sayısı. */
  blurredOuterShadowElements: number;
  /** Bu öğelerdeki bulanık dış gölge katmanlarının toplamı. */
  blurredOuterShadowLayers: number;
  /** Tek öğedeki en çok gölge katmanı (iç + dış, bulanık ya da keskin). */
  maxLayersOnOneElement: number;
  /** En büyük gölge bulanıklığı (px). */
  maxBlurPx: number;
  /** Bulanık metin gölgesi taşıyan öğe sayısı. */
  blurredTextShadowElements: number;
  visibleElements: number;
}

/** `root` verilmezse etkin sekme paneli, verilirse o seçici (açık katmanlar için gövde) taranır. */
async function measure(page: Page, tab: ShowcaseTab, root?: string): Promise<Cost> {
  return page.evaluate(
    ([id, rootSelector]) => {
      const panel = document.querySelector<HTMLElement>(
        rootSelector || `[role="tabpanel"][id$="-panel-${id}"]:not([aria-hidden="true"])`,
      )!;
      const cost: Cost = {
        blurSurfaces: [],
        blurredOuterShadowElements: 0,
        blurredOuterShadowLayers: 0,
        maxLayersOnOneElement: 0,
        maxBlurPx: 0,
        blurredTextShadowElements: 0,
        visibleElements: 0,
      };
      const layersOf = (value: string): string[] => {
        const out: string[] = [];
        let depth = 0;
        let start = 0;
        for (let i = 0; i < value.length; i++) {
          const char = value[i];
          if (char === '(') depth++;
          else if (char === ')') depth--;
          else if (char === ',' && depth === 0) {
            out.push(value.slice(start, i).trim());
            start = i + 1;
          }
        }
        out.push(value.slice(start).trim());
        return out.filter((layer) => layer && layer !== 'none');
      };
      const lengths = (layer: string): number[] =>
        [...layer.replace(/rgba?\([^)]*\)/g, '').matchAll(/(-?\d*\.?\d+)px/g)].map((m) =>
          Number(m[1]),
        );
      const label = (el: Element): string =>
        `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join('.')}`;
      for (const el of [panel, ...panel.querySelectorAll<HTMLElement>('*')]) {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        cost.visibleElements += 1;
        const backdrop =
          style.getPropertyValue('backdrop-filter') ||
          style.getPropertyValue('-webkit-backdrop-filter');
        if ((backdrop && backdrop !== 'none') || /blur\(/.test(style.filter))
          cost.blurSurfaces.push(label(el));
        const shadows = layersOf(style.boxShadow);
        cost.maxLayersOnOneElement = Math.max(cost.maxLayersOnOneElement, shadows.length);
        let blurredOuter = 0;
        for (const layer of shadows) {
          const [, , blur = 0] = lengths(layer);
          cost.maxBlurPx = Math.max(cost.maxBlurPx, blur);
          if (blur > 0 && !layer.includes('inset')) blurredOuter += 1;
        }
        if (blurredOuter > 0) cost.blurredOuterShadowElements += 1;
        cost.blurredOuterShadowLayers += blurredOuter;
        if (layersOf(style.textShadow).some((layer) => (lengths(layer)[2] ?? 0) > 0))
          cost.blurredTextShadowElements += 1;
      }
      return cost;
    },
    [tab, root ?? ''] as const,
  );
}

function expectWithinBudget(cost: Cost, where: string): void {
  expect(cost.visibleElements, `${where}: taranan öğe yok`).toBeGreaterThan(0);
  expect(cost.blurSurfaces, `${where}: etkin blur yüzeyi`).toHaveLength(
    Math.min(cost.blurSurfaces.length, BUDGET.blurSurfaces),
  );
  for (const key of [
    'blurredOuterShadowElements',
    'blurredOuterShadowLayers',
    'maxBlurPx',
    'maxLayersOnOneElement',
    'blurredTextShadowElements',
  ] as const)
    expect(cost[key], `${where}: ${key}`).toBeLessThanOrEqual(BUDGET[key]);
}

for (const skin of SKINS) {
  test.describe(`malzeme maliyeti: ${skin}`, () => {
    for (const tab of SHOWCASE_TABS) {
      test(tab, async ({ page }) => {
        if (skin !== 'default')
          await page.addInitScript((value) => {
            localStorage.setItem('device.volui:theme', JSON.stringify(value));
          }, skin);
        await openShowcase(page);
        await selectTab(page, tab);
        const cost = await measure(page, tab);
        if (process.env.COST_REPORT) console.log(`[${skin}] ${tab} ${JSON.stringify(cost)}`);
        expectWithinBudget(cost, `${skin} ${tab}`);
      });
    }
    for (const scenario of LAYER_SCENARIOS) {
      test(`açık katman ${scenario.scope}`, async ({ page }) => {
        if (skin !== 'default')
          await page.addInitScript((value) => {
            localStorage.setItem('device.volui:theme', JSON.stringify(value));
          }, skin);
        await openShowcase(page);
        await openLayer(page, scenario);
        const cost = await measure(page, scenario.tab, 'body');
        if (process.env.COST_REPORT)
          console.log(`[${skin}] ${scenario.scope} ${JSON.stringify(cost)}`);
        expectWithinBudget(cost, `${skin} ${scenario.scope}`);
      });
    }
  });
}

test.describe('ölçüm düzeneği maliyetli yüzeyi yakalar', () => {
  async function fixture(page: Page, css: string): Promise<Cost> {
    await openShowcase(page);
    await selectTab(page, 'buttons');
    await page.evaluate((style) => {
      const box = document.createElement('div');
      box.textContent = 'x';
      box.style.cssText = `width:40px;height:40px;${style}`;
      document.querySelector('[role="tabpanel"]:not([aria-hidden="true"])')!.append(box);
    }, css);
    return measure(page, 'buttons');
  }

  test('backdrop-filter ve filter blur etkin blur yüzeyi sayılır', async ({ page }) => {
    const backdrop = await fixture(page, 'backdrop-filter:blur(8px)');
    expect(backdrop.blurSurfaces.length).toBeGreaterThan(0);
    const filtered = await fixture(page, 'filter:blur(2px)');
    expect(filtered.blurSurfaces.length).toBeGreaterThan(0);
  });

  test('bulanık dış gölge katman olarak sayılır; sert ve iç gölge sayılmaz', async ({ page }) => {
    const blurred = await fixture(page, 'box-shadow:0 8px 24px #000,0 2px 6px #000');
    expect(blurred.blurredOuterShadowElements).toBe(1);
    expect(blurred.blurredOuterShadowLayers).toBe(2);
    expect(blurred.maxBlurPx).toBe(24);
    const hard = await fixture(page, 'box-shadow:0 2px 0 #000,inset 0 4px 12px #000');
    expect(hard.blurredOuterShadowLayers).toBe(0);
    expect(hard.maxLayersOnOneElement).toBeGreaterThanOrEqual(2);
  });

  test('bulanık metin gölgesi sayılır', async ({ page }) => {
    const shadowed = await fixture(page, 'text-shadow:0 1px 2px #000');
    expect(shadowed.blurredTextShadowElements).toBeGreaterThan(0);
  });
});
