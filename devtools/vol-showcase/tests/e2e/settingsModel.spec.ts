import { expect, test, type Locator, type Page } from '@playwright/test';
import { selectTab } from './support/determinism';

/**
 * Ayar formu (UI-05.4): model + tarif gerçek tarayıcıda. Taslak, hata, Uygula/Geri al/Varsayılan, kapsam başına
 * kalıcılık (yeniden yüklemede kalır) ve ses satırlarının canlı bağı. Birim ayrıntıları `settingsModel.test.ts`.
 */
async function openForms(page: Page): Promise<Locator> {
  await page.goto('/');
  await page.waitForSelector('[role="tablist"]');
  await selectTab(page, 'forms');
  const form = page.locator('.vol-settings-model-demo');
  await form.scrollIntoViewIfNeeded();
  return form;
}

test('taslak → Uygula → kalıcılık: değişiklik duyurulur, yazılır, yeniden yüklemede kalır', async ({
  page,
}) => {
  const form = await openForms(page);
  const status = form.locator('.vol-settings-form__status');
  const apply = form.getByRole('button', { name: 'Apply', exact: true });
  const revert = form.getByRole('button', { name: 'Undo changes', exact: true });
  const name = form.getByRole('textbox');

  await expect(apply).toBeDisabled();
  await expect(revert).toBeDisabled();
  await expect(status).toHaveText('');

  await name.fill('Meriel');
  await expect(status).toHaveText('1 unsaved change');
  await expect(apply).toBeEnabled();
  await expect(form.locator('.vol-settings-row--dirty')).toHaveCount(1);

  await apply.click();
  await expect(status).toHaveText('Saved');
  await expect(apply).toBeDisabled();
  await expect(form.locator('.vol-settings-row--dirty')).toHaveCount(0);

  await page.reload();
  await page.waitForSelector('[role="tablist"]');
  await selectTab(page, 'forms');
  await expect(page.locator('.vol-settings-model-demo').getByRole('textbox')).toHaveValue('Meriel');
});

test('geçersiz ad satırda hata gösterir; Uygula yazmaz; geri al ve satırdaki Varsayılan düzeltir', async ({
  page,
}) => {
  const form = await openForms(page);
  const name = form.getByRole('textbox');
  const status = form.locator('.vol-settings-form__status');

  await name.fill('');
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(form.locator('[role="alert"]:not([hidden])')).toHaveText('Name can’t be empty');
  await form.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(status).toHaveText('Fix the highlighted settings first.');
  expect(await page.evaluate(() => localStorage.getItem('synced.volui:settings-demo'))).toBeNull();

  // Boş değer varsayılandan sapmadır: satırdaki "Varsayılan" düğmesi görünür ve hatayı düzeltir.
  const reset = form.getByRole('button', { name: 'Reset to default: Player name' });
  await expect(reset).toBeVisible();
  await reset.click();
  await expect(name).toHaveValue('Aldric');
  await expect(name).not.toHaveAttribute('aria-invalid', 'true');
  await expect(reset).toBeHidden();

  await name.fill('Toren');
  await form.getByRole('button', { name: 'Undo changes', exact: true }).click();
  await expect(name).toHaveValue('Aldric');
  await expect(status).toHaveText('');
});

test('klavyeyle: taslak sonrası Tab ile Uygula’ya gidilir, Enter uygular; düğmeler 44 px hedef taşır', async ({
  page,
}) => {
  const form = await openForms(page);
  const name = form.getByRole('textbox');
  await name.fill('Draven');
  const apply = form.getByRole('button', { name: 'Apply', exact: true });
  await apply.focus();
  await page.keyboard.press('Enter');
  await expect(form.locator('.vol-settings-form__status')).toHaveText('Saved');

  for (const button of await form.locator('.vol-settings-form__actions button').all()) {
    const box = (await button.boundingBox())!;
    expect(box.height, 'eylem düğmesi dokunma hedefi').toBeGreaterThanOrEqual(30);
  }
});

test('ses satırları canlıdır: kaydırıcı ses sistemine yazar, sessize alma anahtarı switch rolündedir', async ({
  page,
}) => {
  await openForms(page);
  const audio = page.locator('.vol-audio-settings-demo');
  await audio.scrollIntoViewIfNeeded();
  const rows = audio.locator('.vol-settings-row');
  await expect(rows).toHaveCount(6);

  const music = rows.nth(3).locator('input[type="range"]');
  await expect(music).toHaveAccessibleName('Music');
  await music.focus();
  await page.keyboard.press('Home');
  await expect(music).toHaveValue('0');

  const mute = audio.getByRole('switch', { name: 'Mute all' });
  await expect(mute).not.toBeChecked();
  await audio.getByText('Mute all').click();
  await expect(mute).toBeChecked();
});
