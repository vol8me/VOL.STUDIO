import AxeBuilder from '@axe-core/playwright';
import type { ElementHandle, Locator, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { selectTab, type ShowcaseTab } from './determinism';

/**
 * Erişilebilirlik düzeneği. axe tek başına WCAG AA uygunluğunu ya da gerçek
 * yardımcı teknoloji deneyimini kanıtlamaz: ihlaller testi düşürür, eksik
 * değerlendirmeler (incomplete) gerekçeli elle inceleme kaydı ister. Her kayıt
 * kesin kural + hedef + sahip görev taşır; genel muafiyet ve anlık görüntü
 * muafiyeti yoktur, kayıt bayatlayınca (bulgu düzelince) test düşer.
 */
export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

export interface Finding {
  readonly rule: string;
  readonly target: string;
}

export interface AxeRecord extends Finding {
  readonly scope: string;
  readonly owner: string;
  readonly reason: string;
}

interface AxeRecords {
  readonly violations: readonly AxeRecord[];
  readonly incomplete: readonly AxeRecord[];
}

export const AXE_RECORDS_PATH = resolve(import.meta.dirname, 'axeExceptions.json');

export function loadAxeRecords(): AxeRecords {
  return JSON.parse(readFileSync(AXE_RECORDS_PATH, 'utf8')) as AxeRecords;
}

export const key = (finding: Finding): string => `${finding.rule} @ ${finding.target}`;

export interface Scan {
  readonly violations: Finding[];
  readonly incomplete: Finding[];
}

function toFindings(results: { id: string; nodes: { target: unknown[] }[] }[]): Finding[] {
  return results
    .flatMap((result) =>
      result.nodes.map((node) => ({ rule: result.id, target: node.target.join(' ') })),
    )
    .sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

/** Sayfanın (ya da verilen bölgenin) axe taraması: 5 WCAG etiketi. */
export async function scan(page: Page, region?: Locator): Promise<Scan> {
  let builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);
  if (region) {
    await region.first().evaluate((element) => element.setAttribute('data-axe-region', ''));
    builder = builder.include('[data-axe-region]');
  }
  const results = await builder.analyze();
  if (region)
    await region.first().evaluate((element) => element.removeAttribute('data-axe-region'));
  return { violations: toFindings(results.violations), incomplete: toFindings(results.incomplete) };
}

/** Kayıtta olmayan (yeni) ve kayıtta olup bulunmayan (bayat) bulgular. */
export function reconcile(
  found: readonly Finding[],
  records: readonly AxeRecord[],
  scope: string,
): { unexpected: string[]; stale: string[] } {
  const known = new Set(records.filter((r) => r.scope === scope).map(key));
  const seen = new Set(found.map(key));
  return {
    unexpected: [...seen].filter((k) => !known.has(k)),
    stale: [...known].filter((k) => !seen.has(k)),
  };
}

/**
 * Odaklı öğenin merkezi başka bir öğe tarafından örtülüyorsa örtenin tarifini,
 * değilse `null` döndürür (WCAG 2.4.11, odak örtülmemeli).
 */
export async function focusObscuredBy(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    if (!active || active === document.body) return 'odak yok (body)';
    const rect = active.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return 'odaklı öğenin kutusu boş';
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    if (top === null) return 'odaklı öğe görünür alan dışında';
    if (top === active || active.contains(top) || top.contains(active)) return null;
    return `${top.tagName.toLowerCase()}.${String(top.className).slice(0, 40)}`;
  });
}

/** Açık katman senaryosu: sekme, açan düğme ve katmanın kökü. */
export interface LayerScenario {
  readonly scope: string;
  readonly tab: ShowcaseTab;
  /** Katmanı açan ve kapanınca odağın dönmesi gereken öğe. */
  readonly trigger: (page: Page) => Locator;
  /** Taramanın sınırlandığı, açık ve görünür katman kökü. */
  readonly root: (page: Page) => Locator;
}

const en = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../src/i18n/en.json'), 'utf8'),
) as { panels: Record<string, string>; forms: Record<string, string> };

const button = (page: Page, name: string): Locator =>
  page.getByRole('button', { name, exact: true });

export const LAYER_SCENARIOS: readonly LayerScenario[] = [
  {
    scope: 'panels/modal',
    tab: 'panels',
    trigger: (page) => button(page, en.panels.openModal),
    root: (page) => page.locator('.vol-modal--visible:not(.vol-sheet)'),
  },
  {
    scope: 'panels/sheet',
    tab: 'panels',
    trigger: (page) => button(page, en.panels.openSheet),
    root: (page) => page.locator('.vol-modal--visible.vol-sheet'),
  },
  {
    scope: 'panels/popup',
    tab: 'panels',
    trigger: (page) => button(page, en.panels.openPopup),
    root: (page) => page.locator('.vol-popup--visible:not(.vol-popover)'),
  },
  {
    scope: 'panels/popover',
    tab: 'panels',
    trigger: (page) => button(page, en.panels.openPopover),
    root: (page) => page.locator('.vol-popover.vol-popup--visible'),
  },
  {
    scope: 'forms/select',
    tab: 'forms',
    trigger: (page) => page.locator('.vol-select').first(),
    root: (page) => page.locator('.vol-select__listbox.vol-popup--visible'),
  },
  {
    scope: 'forms/osk',
    tab: 'forms',
    trigger: (page) => button(page, en.forms.onScreenKeyboardOpen),
    root: (page) => page.locator('.vol-osk'),
  },
];

export async function openLayer(page: Page, scenario: LayerScenario): Promise<void> {
  await selectTab(page, scenario.tab);
  await scenario.trigger(page).click();
  await scenario.root(page).first().waitFor();
}

/**
 * Katmanı klavyeyle açar: tetikleyiciye odak verilir ve Enter basılır. Fare
 * tıklaması WebKit'te düğmeye odak vermez; odağın tetikleyiciye dönüşü ancak
 * odak tetikleyicideyken anlamlı sınanır.
 */
export async function openLayerByKeyboard(
  page: Page,
  scenario: LayerScenario,
): Promise<ElementHandle> {
  await selectTab(page, scenario.tab);
  const trigger = scenario.trigger(page);
  const handle = await trigger.elementHandle();
  await trigger.focus();
  await page.keyboard.press('Enter');
  await scenario.root(page).first().waitFor();
  return handle;
}
