import { expect, test, type Page } from '@playwright/test';
import { LAYER_SCENARIOS, openLayer } from './support/accessibility';
import { openShowcase } from './support/determinism';

/**
 * Odak örtülmez (WCAG 2.4.11, UI-05.3): katman açıkken Tab ile gezilen her denetim görünür pencerenin içinde
 * kalır ve merkez noktasında BAŞKA bir öğe (alt sheet, yapışkan altlık, klavye) değil kendisi vardır. Kısa
 * telefon pencereleri (360×740, 320×568) en kötü durumdur: uzun içerik kaydırılır, katman ekranı kaplar.
 */
const LAYERS = ['panels/modal', 'panels/sheet', 'forms/osk'] as const;
const VIEWPORTS = [
  { name: '1280x800', width: 1280, height: 800 },
  { name: '360x740', width: 360, height: 740 },
  { name: '320x568', width: 320, height: 568 },
];

async function focusProblem(page: Page, rootSelector: string): Promise<string | null> {
  return page.evaluate((selector) => {
    const active = document.activeElement as HTMLElement | null;
    const root = document.querySelector(selector);
    if (!active || active === document.body) return 'odak gövdede';
    if (!root?.contains(active)) return `odak katmanın dışında: ${active.className}`;
    const rect = active.getBoundingClientRect();
    const inside =
      rect.left >= -1 &&
      rect.top >= -1 &&
      rect.right <= window.innerWidth + 1 &&
      rect.bottom <= window.innerHeight + 1;
    if (!inside) return `görünür pencere dışında: ${active.className}`;
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    if (hit && !active.contains(hit) && !hit.contains(active)) {
      return `örtülü (${(hit as HTMLElement).className}): ${active.className}`;
    }
    return null;
  }, rootSelector);
}

for (const viewport of VIEWPORTS) {
  for (const layer of LAYERS) {
    test(`katman içinde Tab ile gezilen denetim örtülmez: ${layer} @ ${viewport.name}`, async ({
      page,
    }) => {
      const scenario = LAYER_SCENARIOS.find((candidate) => candidate.scope === layer)!;
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openShowcase(page);
      await openLayer(page, scenario);
      const rootSelector = await scenario
        .root(page)
        .first()
        .evaluate((element) => {
          element.setAttribute('data-focus-probe', '');
          return '[data-focus-probe]';
        });

      const problems: string[] = [];
      const seen = new Set<string>();
      // Döngüsel odak tuzağı: tekrar eden ilk denetime dönünce tur biter (üst sınır güvencesi).
      for (let step = 0; step < 60; step += 1) {
        await page.keyboard.press('Tab');
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            ),
        );
        const id = await page.evaluate(() => {
          const active = document.activeElement as HTMLElement | null;
          if (!active) return '';
          const parts: string[] = [];
          for (let node: HTMLElement | null = active; node; node = node.parentElement) {
            parts.push(`${node.tagName}.${node.className}:${node.parentElement?.children.length}`);
            if (parts.length > 3) break;
          }
          return `${parts.join('<')}|${active.textContent?.slice(0, 20)}|${active.getAttribute('aria-label')}`;
        });
        const problem = await focusProblem(page, rootSelector);
        if (problem) problems.push(`${step}: ${problem}`);
        if (seen.has(id) && seen.size > 1) break;
        seen.add(id);
      }
      expect(seen.size, `${layer}: katman içinde gezilecek denetim var`).toBeGreaterThan(0);
      expect(problems, `${layer} @ ${viewport.name}`).toEqual([]);
    });
  }
}
