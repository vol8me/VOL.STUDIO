import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LAYER_SCENARIOS, focusObscuredBy, openLayerByKeyboard } from './support/accessibility';
import { openShowcase } from './support/determinism';

/**
 * Durum fixture'ları. Veri `support/stateFixtures.json`dadır; her kayıt
 * registry'deki bir export'un uygulanabilir durumunu bir katman senaryosunda
 * sınar (registry kapısı export'un ve durumun uygulanabilirliğini doğrular).
 * Bilinen kusur `known` ile sahip göreve bağlanır ve `test.fail` ile izlenir:
 * kusur düzelince test BAŞARILI olup düşer ve kaydın silinmesini ister.
 */
interface Fixture {
  readonly scope: string;
  readonly export: string;
  readonly focus: 'inside' | 'trigger';
  readonly states: readonly ('focusVisible' | 'keyboard')[];
  readonly known: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

const fixtures = (
  JSON.parse(readFileSync(resolve(import.meta.dirname, 'support/stateFixtures.json'), 'utf8')) as {
    fixtures: Fixture[];
  }
).fixtures;

for (const fixture of fixtures) {
  const scenario = LAYER_SCENARIOS.find((candidate) => candidate.scope === fixture.scope);
  if (!scenario) throw new Error(`stateFixtures: bilinmeyen senaryo ${fixture.scope}`);

  test.describe(`${fixture.export} (${fixture.scope})`, () => {
    if (fixture.states.includes('focusVisible')) {
      test('odak katmana taşınır ve örtülmez', async ({ page }) => {
        await openShowcase(page);
        const trigger = await openLayerByKeyboard(page, scenario);
        const target =
          fixture.focus === 'inside' ? await scenario.root(page).first().elementHandle() : trigger;
        const placed = await page.evaluate(
          ([element, mode]) =>
            element !== null &&
            (mode === 'inside'
              ? (element as Element).contains(document.activeElement)
              : element === document.activeElement),
          [target, fixture.focus] as const,
        );
        expect(
          placed,
          `odak ${fixture.focus === 'inside' ? 'katmanın içinde' : 'tetikleyicide'} olmalı`,
        ).toBe(true);
        expect(await focusObscuredBy(page)).toBeNull();
      });
    }

    if (fixture.states.includes('keyboard')) {
      test('Escape katmanı kapatır ve odağı tetikleyiciye geri verir', async ({ page }, info) => {
        const engines = fixture.known.keyboard ?? {};
        const owner = engines[info.project.name] ?? engines['*'];
        test.fail(owner !== undefined, `bilinen kusur: ${owner}`);
        await openShowcase(page);
        const trigger = await openLayerByKeyboard(page, scenario);
        await page.keyboard.press('Escape');
        await expect(scenario.root(page)).toHaveCount(0);
        const restored = await trigger.evaluate((element) => document.activeElement === element);
        expect(restored, 'odak tetikleyiciye dönmeli').toBe(true);
      });
    }
  });
}

test('her fixture senaryosu axe kapsamındaki katman listesinde', () => {
  const known = new Set(LAYER_SCENARIOS.map((scenario) => scenario.scope));
  for (const fixture of fixtures) expect(known.has(fixture.scope)).toBe(true);
});
