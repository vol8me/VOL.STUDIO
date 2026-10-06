import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import {
  LAYER_SCENARIOS,
  focusObscuredBy,
  key,
  loadAxeRecords,
  openLayer,
  reconcile,
  scan,
  type Scan,
} from './support/accessibility';
import { openShowcase, selectTab, SHOWCASE_TABS } from './support/determinism';

/**
 * axe (5 WCAG etiketi) her sekmede ve her açık katmanda koşar. Sonuç
 * `support/axeExceptions.json` ile BİREBİR eşleşmelidir: yeni bulgu testi
 * düşürür, kaydı olup artık bulunmayan (düzelmiş) bulgu da düşürür; böylece
 * kayıt ancak sahip görevin kapanışıyla silinir ve sessizce birikmez.
 * `AXE_RECORD=<dosya>` yalnız yeni kayıt taslağı için ham bulguları yazar.
 */
const records = loadAxeRecords();
const recordPath = process.env.AXE_RECORD;
const recorded: Record<string, Scan> = {};

test.afterAll(() => {
  if (recordPath) writeFileSync(recordPath, JSON.stringify(recorded, null, 2));
});

function expectReconciled(scope: string, found: Scan): void {
  if (recordPath) {
    recorded[scope] = found;
    return;
  }
  const violations = reconcile(found.violations, records.violations, scope);
  const incomplete = reconcile(found.incomplete, records.incomplete, scope);
  expect(violations.unexpected, `${scope}: kayıtsız axe ihlali`).toEqual([]);
  expect(violations.stale, `${scope}: bayat ihlal kaydı (bulgu düzelmiş, kaydı sil)`).toEqual([]);
  expect(incomplete.unexpected, `${scope}: incomplete bulgu elle incelenmedi`).toEqual([]);
  expect(incomplete.stale, `${scope}: bayat incomplete kaydı`).toEqual([]);
}

test.describe('axe: sekmeler', () => {
  for (const tab of SHOWCASE_TABS) {
    test(`${tab} sekmesi`, async ({ page }) => {
      await openShowcase(page);
      await selectTab(page, tab);
      expectReconciled(`tab/${tab}`, await scan(page));
    });
  }
});

test.describe('axe: açık katmanlar', () => {
  for (const scenario of LAYER_SCENARIOS) {
    test(scenario.scope, async ({ page }) => {
      await openShowcase(page);
      await openLayer(page, scenario);
      expectReconciled(`layer/${scenario.scope}`, await scan(page, scenario.root(page)));
    });
  }
});

test.describe('düzenek ihlali yakalar', () => {
  test('bilerek adsız bırakılan giriş alanı kayıtsız ihlal olarak düşer', async ({ page }) => {
    await openShowcase(page);
    await selectTab(page, 'forms');
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.type = 'text';
      input.setAttribute('data-negative-fixture', '');
      document.querySelector('[role="tabpanel"]:not([aria-hidden="true"])')!.append(input);
    });
    const found = await scan(page);
    const unexpected = reconcile(found.violations, records.violations, 'tab/forms').unexpected;
    expect(unexpected.some((entry) => /^label @ .*data-negative-fixture/.test(entry))).toBe(true);
    expect(found.violations.map(key).join('\n')).toContain('data-negative-fixture');
  });

  test('katman altında kalan odak örtülen odak olarak bildirilir', async ({ page }) => {
    await openShowcase(page);
    await page.evaluate(() => {
      const button = document.createElement('button');
      button.textContent = 'altta';
      button.style.cssText = 'position:fixed;left:20px;top:20px;width:80px;height:30px';
      const cover = document.createElement('div');
      cover.style.cssText =
        'position:fixed;left:0;top:0;width:200px;height:120px;background:#000;z-index:2147483647';
      document.body.append(button, cover);
      button.focus();
    });
    expect(await focusObscuredBy(page)).toMatch(/^div/);
  });

  test('örtülmeyen odak bildirilmez', async ({ page }) => {
    await openShowcase(page);
    await page.evaluate(() => {
      const button = document.createElement('button');
      button.textContent = 'üstte';
      button.style.cssText = 'position:fixed;left:20px;top:20px;width:80px;height:30px';
      document.body.append(button);
      button.focus();
    });
    expect(await focusObscuredBy(page)).toBeNull();
  });
});
