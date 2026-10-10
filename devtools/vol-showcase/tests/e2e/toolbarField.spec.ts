import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openShowcase, selectTab } from './support/determinism';

/**
 * Araç çubuğu ve özellik alanı (UI-10.4) gerçek tarayıcıda, iki motorda. Birim testleri sözleşmeyi kilitler
 * (`workbenchPrimitives.test.ts`, `workbenchRegressions.test.ts`); burada tarayıcının odak/ad hesabı sınanır:
 * araç çubuğu TEK sekme durağıdır ve oklar/Home/End aralarında gezer (devre dışı atlanır), seçim ile aksiyon ayrıdır;
 * özellik alanının etiketi ve açıklaması denetimin erişilebilir adı/açıklaması olur, sıfırlama taslağı geri alır.
 */
const en = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../src/i18n/en.json'), 'utf8'),
) as { forms: Record<string, string> };
const f = en.forms;

async function openForms(page: Page): Promise<void> {
  await openShowcase(page);
  await selectTab(page, 'forms');
}

const toolbarOf = (page: Page) => page.getByRole('toolbar', { name: f.toolbar });
const tool = (page: Page, name: string) =>
  toolbarOf(page).getByRole('button', { name, exact: true });

test.describe('Toolbar', () => {
  test('tek sekme durağı: yalnız etkin araç tabindex 0 taşır; oklar, Home ve End gezer ve baştan sarar', async ({
    page,
  }) => {
    await openForms(page);
    const toolbar = toolbarOf(page);
    await toolbar.scrollIntoViewIfNeeded();
    await expect(toolbar).toHaveAttribute('aria-orientation', 'horizontal');

    const stops = toolbar.locator('button[tabindex="0"]');
    await expect(stops).toHaveCount(1);
    await expect(tool(page, f.pencil)).toHaveAttribute('tabindex', '0');

    await tool(page, f.pencil).focus();
    await page.keyboard.press('ArrowRight');
    await expect(tool(page, f.eraser)).toBeFocused();
    await expect(stops).toHaveCount(1);
    await expect(tool(page, f.eraser)).toHaveAttribute('tabindex', '0');
    await expect(tool(page, f.pencil)).toHaveAttribute('tabindex', '-1');

    await page.keyboard.press('End');
    await expect(tool(page, f.trash)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(tool(page, f.pencil)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(tool(page, f.trash)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(tool(page, f.pencil)).toBeFocused();
  });

  test('seçim ile aksiyon ayrıdır: araç seçmek aria-pressed taşır, aksiyon seçimi değiştirmez', async ({
    page,
  }) => {
    await openForms(page);
    const toolbar = toolbarOf(page);
    await toolbar.scrollIntoViewIfNeeded();
    const status = toolbar.locator('xpath=following-sibling::*[1]');

    await expect(tool(page, f.pencil)).toHaveAttribute('aria-pressed', 'true');
    await tool(page, f.eraser).focus();
    await page.keyboard.press('Enter');
    await expect(tool(page, f.eraser)).toHaveAttribute('aria-pressed', 'true');
    await expect(tool(page, f.pencil)).toHaveAttribute('aria-pressed', 'false');
    await expect(status).toHaveText(f.toolbarSelected.replace('{{value}}', f.eraser));

    // Aksiyon düğmesi (Sil) bir seçim değildir: `aria-pressed` taşımaz, etkin araç yerinde kalır.
    await expect(tool(page, f.trash)).not.toHaveAttribute('aria-pressed', /.*/);
    await tool(page, f.trash).focus();
    await page.keyboard.press('Space');
    await expect(status).toHaveText(f.toolbarAction.replace('{{action}}', f.trash));
    await expect(tool(page, f.eraser)).toHaveAttribute('aria-pressed', 'true');
  });

  test('her araç adlıdır ve odak halkası görünür', async ({ page }) => {
    await openForms(page);
    const toolbar = toolbarOf(page);
    await toolbar.scrollIntoViewIfNeeded();
    for (const name of [f.pencil, f.eraser, f.eyedropper, f.trash]) {
      await expect(tool(page, name)).toBeVisible();
    }
    await tool(page, f.pencil).focus();
    await page.keyboard.press('ArrowRight');
    const ring = await tool(page, f.eraser).evaluate((element) => {
      const style = getComputedStyle(element);
      return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
    });
    expect(ring.style).not.toBe('none');
    expect(ring.width).toBeGreaterThan(0);
  });
});

test.describe('PropertyField', () => {
  const fieldOf = (page: Page) =>
    page.locator('.vol-property-field', { has: page.getByText(f.playerName, { exact: true }) });

  test('etiket denetimin adı, açıklama denetimin açıklamasıdır', async ({ page }) => {
    await openForms(page);
    const field = fieldOf(page).first();
    await field.scrollIntoViewIfNeeded();
    const input = field.locator('input');
    await expect(input).toHaveAccessibleName(f.playerName);
    await expect(input).toHaveAccessibleDescription(f.propertyFieldDescription);
  });

  test('kullanıcı taslağı Enter ile işlenir; sıfırlama değeri ve durumu geri alır', async ({
    page,
  }) => {
    await openForms(page);
    const field = fieldOf(page).first();
    await field.scrollIntoViewIfNeeded();
    const input = field.locator('input');
    const status = field.locator('xpath=following-sibling::*[1]');

    await expect(input).toHaveValue(f.playerNameValue);
    await expect(status).toHaveText(f.propertyFieldNoCommit);

    await input.fill('Mira');
    // Yazmak işlenmedir değil: Enter'a kadar işlenmiş değer yok.
    await expect(status).toHaveText(f.propertyFieldNoCommit);
    await page.keyboard.press('Enter');
    await expect(status).toHaveText(f.propertyFieldCommit.replace('{{value}}', 'Mira'));

    await field.getByRole('button', { name: f.reset, exact: true }).click();
    await expect(input).toHaveValue(f.playerNameValue);
    await expect(status).toHaveText(f.propertyFieldNoCommit);
  });
});
