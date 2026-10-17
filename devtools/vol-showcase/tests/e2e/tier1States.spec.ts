import { expect, test, type Locator, type Page } from '@playwright/test';
import { selectTab } from './support/determinism';
import { settleTransitions } from './support/settle';

type ShowcaseTab = Parameters<typeof selectTab>[1];
interface Surface {
  tab: ShowcaseTab;
  selector: string;
  probe?: string;
  open?: string;
}

/** Canlı CSS sınanır: deterministik ekran görüntüsü dondurması hareketi gizlememeli. */
async function openSurface(page: Page, skin: string, surface: Surface): Promise<Locator> {
  await page.goto('/');
  await expect(page.locator('[role="tablist"]').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  if ((await page.locator('.vol-showcase-skin-button').getAttribute('data-skin')) !== skin) {
    await page.locator('.vol-showcase-skin-button').click();
  }
  await expect(page.locator('.vol-showcase-skin-button')).toHaveAttribute('data-skin', skin);
  await selectTab(page, surface.tab);
  if (surface.open) await page.getByRole('button', { name: surface.open, exact: true }).click();
  const scope = surface.open
    ? page.locator('body')
    : page.getByRole('tabpanel').filter({ visible: true });
  const target = scope.locator(surface.selector).filter({ visible: true }).first();
  await expect(target).toBeVisible();
  await target.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await settleTransitions(page);
  return target;
}

async function paint(target: Locator): Promise<string> {
  return target.evaluate((element) => {
    const style = getComputedStyle(element);
    return [
      style.backgroundColor,
      style.borderColor,
      style.color,
      style.boxShadow,
      style.transform,
    ].join('|');
  });
}

for (const skin of ['default', 'aurum']) {
  for (const group of [0, 1, 2]) {
    test(`${skin}/${group}: tier-1 hover gerçek yüzeyde boyayı değiştirir`, async ({ page }) => {
      const surfaces: Record<string, Surface> = {
        Button: { tab: 'buttons', selector: '.vol-button:not(:disabled)' },
        IconButton: { tab: 'buttons', selector: '.vol-icon-button:not(:disabled)' },
        HoldButton: { tab: 'touch', selector: '.vol-hold-button:not(:disabled)' },
        Checkbox: {
          tab: 'forms',
          selector: '.vol-checkbox:has(input:not(:disabled))',
          probe: '.vol-checkbox__track',
        },
        Input: { tab: 'forms', selector: 'input.vol-input:not(:disabled):not([readonly])' },
        SegmentedControl: {
          tab: 'forms',
          selector: '.vol-segmented__item:not(:disabled):not(.vol-segmented__item--active)',
        },
        Select: { tab: 'forms', selector: '.vol-select:not(:disabled)' },
        Slider: {
          tab: 'forms',
          selector: '.vol-slider:has(input:not(:disabled))',
          probe: '.vol-slider__track',
        },
        CardTile: {
          tab: 'cards',
          selector: '[data-card-matrix="states"] .vol-card:not(.vol-card--disabled)',
        },
        CardPicker: {
          tab: 'cards',
          open: 'OPEN LEVEL-UP',
          selector: '.vol-card-picker--levelup .vol-card',
        },
        LevelUpPicker: {
          tab: 'cards',
          open: 'OPEN LEVEL-UP',
          selector: '.vol-card-picker--levelup .vol-card',
        },
        ShopPicker: {
          tab: 'cards',
          open: 'OPEN SHOP',
          selector: '.vol-card-picker--shop .vol-card:not(.vol-card--disabled)',
        },
      };
      for (const [name, surface] of Object.entries(surfaces).slice(group * 4, group * 4 + 4)) {
        const target = await openSurface(page, skin, surface);
        const visible = surface.probe ? target.locator(surface.probe) : target;
        const before = await paint(visible);
        await target.hover();
        await settleTransitions(page);
        expect(await target.evaluate((element) => element.matches(':hover')), name).toBe(true);
        expect(await paint(visible), name + ' hover boyası').not.toBe(before);
      }
    });

    test(`${skin}/${group}: tier-1 reducedMotion kayma, ölçek ve genişlik geçişini durdurur`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const surfaces: Record<string, Surface> = {
        Button: { tab: 'buttons', selector: '.vol-button:not(:disabled)' },
        IconButton: { tab: 'buttons', selector: '.vol-icon-button:not(:disabled)' },
        HoldButton: { tab: 'touch', selector: '.vol-hold-button:not(:disabled)' },
        Joystick: { tab: 'touch', selector: '.vol-joystick' },
        Checkbox: { tab: 'forms', selector: '.vol-checkbox:has(input:not(:disabled))' },
        Input: { tab: 'forms', selector: 'input.vol-input:not(:disabled):not([readonly])' },
        SegmentedControl: { tab: 'forms', selector: '.vol-segmented' },
        Select: { tab: 'forms', selector: '.vol-select:not(:disabled)' },
        Slider: { tab: 'forms', selector: '.vol-slider:has(input:not(:disabled))' },
        Panel: { tab: 'panels', selector: '.vol-panel:visible' },
        Bar: { tab: 'hud', selector: '.vol-bar:not(.vol-xp-bar)' },
        XPBar: { tab: 'hud', selector: '.vol-xp-bar' },
        DataTable: { tab: 'advanced', selector: '.vol-datatable' },
        EventLog: { tab: 'advanced', selector: '.vol-event-log' },
        CardTile: { tab: 'cards', selector: '[data-card-matrix="states"] .vol-card' },
        CardPicker: { tab: 'cards', open: 'OPEN LEVEL-UP', selector: '.vol-card-picker--levelup' },
        LevelUpPicker: {
          tab: 'cards',
          open: 'OPEN LEVEL-UP',
          selector: '.vol-card-picker--levelup',
        },
        ShopPicker: { tab: 'cards', open: 'OPEN SHOP', selector: '.vol-card-picker--shop' },
      };
      for (const [name, surface] of Object.entries(surfaces).slice(group * 6, group * 6 + 6)) {
        const target = await openSurface(page, skin, surface);
        const problems = await target.evaluate((root) => {
          const findings: string[] = [];
          const spatial =
            /^(all|transform|translate|rotate|scale|width|height|max-height|max-width|left|right|top|bottom|margin.*|padding.*)$/;
          for (const element of [root, ...root.querySelectorAll('*')]) {
            const style = getComputedStyle(element);
            const properties = style.transitionProperty.split(',').map((value) => value.trim());
            const durations = style.transitionDuration.split(',').map((value) => parseFloat(value));
            properties.forEach((property, index) => {
              if (spatial.test(property) && (durations[index % durations.length] ?? 0) > 0)
                findings.push(element.className + ': transition ' + property);
            });
            if (style.animationName.split(',').some((value) => value.trim() !== 'none'))
              findings.push(element.className + ': animation ' + style.animationName);
          }
          return findings;
        });
        expect(problems, name + ' reducedMotion').toEqual([]);
      }
    });
  }
}
