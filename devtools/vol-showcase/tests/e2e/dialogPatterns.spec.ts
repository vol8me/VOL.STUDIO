import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openShowcase, selectTab } from './support/determinism';

/**
 * Diyalog kalıpları, ilk kullanım turu ve kredi ekranı (UI-09.4) gerçek tarayıcıda, iki motorda: karar akışları,
 * bekleme/hata/yeniden deneme/iptal, odak ve klavye, hedef kaybolması. axe taraması, Escape/odak dönüşü ve
 * geometri `LAYER_SCENARIOS` içindeki panels/dialog, conflict, legal ve tour senaryolarındadır (axe, stateMatrix,
 * layout, materialBudget); burada o senaryoların görmediği davranışlar sınanır.
 */
const en = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../src/i18n/en.json'), 'utf8'),
) as { panels: Record<string, string> };
const t = en.panels;

const DIALOG = '.vol-dialog.vol-modal--visible';
const button = (scope: Locator | Page, name: string): Locator =>
  scope.getByRole('button', { name, exact: true });
const dialog = (page: Page): Locator => page.locator(DIALOG);
const resultOf = (page: Page, title: string): Locator =>
  page
    .locator('.vol-showcase-card', {
      has: page.locator('.vol-showcase-card__title', { hasText: title }),
    })
    .locator('.vol-showcase-dialog-result');

async function openPanels(page: Page): Promise<void> {
  await openShowcase(page);
  await selectTab(page, 'panels');
}

test.describe('diyalog kalıpları: karar akışları', () => {
  test('yıkıcı onay: ilk odak iptal, Tab diyalog içinde döner, iptal ve onay sonuçları', async ({
    page,
  }) => {
    await openPanels(page);
    await button(page, t.dpDestructive).click();
    await expect(dialog(page)).toHaveCount(1);
    await expect(dialog(page).locator('[role="alertdialog"]')).toHaveCount(1);
    await expect(button(dialog(page), 'Cancel')).toBeFocused();

    // Odak tuzağı: iki düğme arasında dolaşılır, sayfaya sızmaz.
    await page.keyboard.press('Tab');
    await expect(button(dialog(page), t.dpDestructiveConfirm)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(button(dialog(page), 'Cancel')).toBeFocused();

    // Enter, odaktaki iptale basar: yıkıcı işlem yapılmaz.
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toHaveCount(0);
    await expect(resultOf(page, t.dialogPatterns)).toHaveText('Result: cancel');

    await button(page, t.dpDestructive).click();
    await button(dialog(page), t.dpDestructiveConfirm).click();
    await expect(resultOf(page, t.dialogPatterns)).toHaveText('Result: confirm');
  });

  test('çıkış istemi: ilk kaydetme başarısız → hata, odak düğmeye döner, yeniden deneme başarır', async ({
    page,
  }) => {
    await openPanels(page);
    await button(page, t.dpExitFails).click();
    await expect(button(dialog(page), 'Cancel, stay')).toBeFocused();
    await button(dialog(page), 'Save and exit').click();

    // Bekleme: duyuru, diğer eylemler kapalı, iptal açık ve odaklı.
    await expect(dialog(page).locator('.vol-dialog__status')).toHaveText('Working…');
    await expect(dialog(page).locator('[role$="dialog"]')).toHaveAttribute('aria-busy', 'true');
    await expect(button(dialog(page), 'Exit without saving')).toBeDisabled();
    await expect(button(dialog(page), 'Cancel, stay')).toBeEnabled();
    await expect(button(dialog(page), 'Cancel, stay')).toBeFocused();

    // Hata: role=alert bölgesi, eylemler geri döner, odak hatalı eylemde.
    await expect(dialog(page).locator('.vol-dialog__alert')).not.toBeEmpty();
    await expect(dialog(page).locator('.vol-dialog__alert')).toHaveAttribute('role', 'alert');
    await expect(dialog(page).locator('.vol-dialog__status')).toBeEmpty();
    await expect(button(dialog(page), 'Exit without saving')).toBeEnabled();
    await expect(button(dialog(page), 'Save and exit')).toBeFocused();

    // Yeniden deneme başarır ve diyalog kapanır.
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toHaveCount(0);
    await expect(resultOf(page, t.dialogPatterns)).toHaveText('Result: save');
  });

  test('izin istemi: gerekçe görünür, ilk odak "şimdi değil", Escape deny sayılır', async ({
    page,
  }) => {
    await openPanels(page);
    await button(page, t.dpPermission).click();
    await expect(dialog(page)).toContainText(t.dpPermissionReason);
    await expect(button(dialog(page), 'Not now')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await expect(resultOf(page, t.dialogPatterns)).toHaveText('Result: deny');

    await button(page, t.dpPermission).click();
    await button(dialog(page), 'Allow').click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(resultOf(page, t.dialogPatterns)).toHaveText('Result: allow');
  });

  test('kendiliğinden kapanan diyalog: tutaç üç saniye sonra kapatır ve sonucu bildirir', async ({
    page,
  }) => {
    await openPanels(page);
    await button(page, t.dpAuto).click();
    await expect(dialog(page)).toHaveCount(1);
    await expect(dialog(page)).toHaveCount(0, { timeout: 6000 });
    await expect(resultOf(page, t.dialogPatterns)).toHaveText('Result: timeout');
  });
});

test.describe('kayıt çakışması (benzetim)', () => {
  test('karşılaştırma, niyet notları, ilk odak iptal; bekleme sırasında iptal işi iptal eder', async ({
    page,
  }) => {
    await openPanels(page);
    await button(page, t.scOpen).click();
    await expect(dialog(page).locator('dd').nth(0)).toHaveText(t.scLocal);
    await expect(dialog(page).locator('dd').nth(1)).toHaveText(t.scRemote);
    await expect(dialog(page).locator('.vol-dialog__action-note')).toHaveCount(3);
    await expect(button(dialog(page), 'Cancel')).toBeFocused();
    // Kart, bu kalıbın gerçek bir bulut hizmeti olmadığını açıkça söyler.
    await expect(page.locator('.vol-showcase-card', { hasText: t.scNote })).toHaveCount(1);

    // Bekleme 700 ms sürer. Playwright'ın ardışık click/actionability RPC'leri
    // özellikle WebKit altında bu aralığı aşabiliyordu; iptal gerçekte iş
    // bitmeden tetiklenmeli. İki gerçek düğme handler'ını tek sayfa turunda sür.
    const busy = await button(dialog(page), 'Use the remote copy').evaluate((remote) => {
      const root = remote.closest('.vol-dialog');
      if (!root) throw new Error('Çakışma diyaloğu bulunamadı');
      const buttons = [...root.querySelectorAll<HTMLButtonElement>('button')];
      const local = buttons.find(
        (button) => button.textContent?.trim() === "Keep this device's save",
      );
      const cancel = buttons.find((button) => button.textContent?.trim() === 'Cancel');
      if (!local || !cancel) throw new Error('Çakışma eylemleri bulunamadı');
      (remote as HTMLButtonElement).click();
      const state = {
        localDisabled: local.disabled,
        cancelEnabled: !cancel.disabled,
        ariaBusy: root.querySelector('[role$="dialog"]')?.getAttribute('aria-busy'),
      };
      cancel.click();
      return state;
    });
    expect(busy).toEqual({ localDisabled: true, cancelEnabled: true, ariaBusy: 'true' });
    await expect(dialog(page)).toHaveCount(0);
    await expect(resultOf(page, t.syncConflict)).toHaveText('Result: cancel');
  });

  test('uzak kopya seçimi ve iptal gerçek işaretçiyle hedeflenir', async ({ page }) => {
    await openPanels(page);

    // 700 ms'lik iş süresiyle yarışmadan iki hedefin de gerçek Playwright
    // pointer eylemiyle tıklanabilir olduğunu sınar (örtülme/hit-testing).
    // Bekleme sırasındaki iptal yarışını yukarıdaki atomik test ayrıca korur.
    await button(page, t.scOpen).click();
    await button(dialog(page), 'Use the remote copy').click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(resultOf(page, t.syncConflict)).toHaveText('Result: remote');

    await button(page, t.scOpen).click();
    await expect(button(dialog(page), 'Cancel')).toBeFocused();
    await button(dialog(page), 'Cancel').click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(resultOf(page, t.syncConflict)).toHaveText('Result: cancel');
  });

  test('ilk deneme başarısız: açık hata, yeniden deneme başarır, seçilen kopya sonuçtur', async ({
    page,
  }) => {
    await openPanels(page);
    await button(page, t.scOpenFails).click();
    await button(dialog(page), "Keep this device's save").click();
    await expect(dialog(page).locator('.vol-dialog__alert')).not.toBeEmpty();
    await expect(button(dialog(page), "Keep this device's save")).toBeFocused();
    await button(dialog(page), "Keep this device's save").click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(resultOf(page, t.syncConflict)).toHaveText('Result: local');
  });
});

test.describe('ilk kullanım turu', () => {
  const popup = (page: Page): Locator => page.locator('.vol-tour.vol-popup--visible');
  const card = (page: Page): Locator =>
    page.locator('.vol-showcase-card', {
      has: page.locator('.vol-showcase-card__title', { hasText: t.guidedTour }),
    });

  test('hedefi işaretler, yanında durur, adımlar İleri/Geri ile gezilir ve Bitti completed yazar', async ({
    page,
  }) => {
    await openPanels(page);
    await button(page, t.tourStart).click();
    await expect(popup(page)).toHaveCount(1);
    await expect(popup(page)).toContainText('Step 1 / 3');
    await expect(popup(page)).toContainText(t.tourStep1Body);

    const target = button(card(page), t.tourSettings);
    await expect(target).toHaveClass(/vol-tour-target/);
    const outline = await target.evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(outline).toBe('solid');

    // Açıklama kutusu hedefi örtmez ve görünür alandadır.
    const targetBox = (await target.boundingBox())!;
    const popupBox = (await popup(page).boundingBox())!;
    const overlaps =
      popupBox.x < targetBox.x + targetBox.width &&
      popupBox.x + popupBox.width > targetBox.x &&
      popupBox.y < targetBox.y + targetBox.height &&
      popupBox.y + popupBox.height > targetBox.y;
    expect(overlaps, 'kutu hedefi örtmemeli').toBe(false);
    const viewport = page.viewportSize()!;
    expect(popupBox.x).toBeGreaterThanOrEqual(0);
    expect(popupBox.x + popupBox.width).toBeLessThanOrEqual(viewport.width);

    // Sayfa engellenmez: tur açıkken sayfadaki başka düğmeye tıklanabilir (scrim yok).
    await expect(page.locator('.vol-modal--visible')).toHaveCount(0);

    await expect(button(popup(page), 'Next')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(popup(page)).toContainText('Step 2 / 3');
    await expect(button(card(page), t.tourInventory)).toHaveClass(/vol-tour-target/);
    await expect(target).not.toHaveClass(/vol-tour-target/);
    await button(popup(page), 'Back').click();
    await expect(popup(page)).toContainText('Step 1 / 3');
    await button(popup(page), 'Next').click();
    await button(popup(page), 'Next').click();
    await expect(popup(page)).toContainText('Step 3 / 3');
    await button(popup(page), 'Done').click();
    await expect(popup(page)).toHaveCount(0);
    await expect(resultOf(page, t.guidedTour)).toHaveText('Tour: completed');
    await expect(page.locator('.vol-tour-target')).toHaveCount(0);
    await expect(button(page, t.tourStart)).toBeFocused();
  });

  test('Atla ve Escape turu skipped bitirir ve hedef işaretini kaldırır', async ({ page }) => {
    await openPanels(page);
    await button(page, t.tourStart).click();
    await button(popup(page), 'Skip').click();
    await expect(resultOf(page, t.guidedTour)).toHaveText('Tour: skipped');
    await expect(page.locator('.vol-tour-target')).toHaveCount(0);

    await button(page, t.tourStart).click();
    await page.keyboard.press('Escape');
    await expect(popup(page)).toHaveCount(0);
    await expect(resultOf(page, t.guidedTour)).toHaveText('Tour: skipped');
    await expect(page.locator('.vol-tour-target')).toHaveCount(0);
  });

  test('adım sürerken hedef kaybolursa tur takılmaz ve sonraki adıma geçer', async ({ page }) => {
    await openPanels(page);
    await button(page, t.tourStart).click();
    await expect(popup(page)).toContainText('Step 1 / 3');
    await button(card(page), t.tourSettings).evaluate((element) => {
      (element as HTMLElement).style.display = 'none';
    });
    await expect(popup(page)).toContainText('Step 2 / 3', { timeout: 3000 });
    await button(popup(page), 'Skip').click();
  });
});

test.describe('krediler ve yasal metin', () => {
  test('atıf listesi depo kayıtlarındaki satırlarla açılır; gövde klavyeyle kaydırılır; Escape kapatır', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 420 });
    await openPanels(page);
    await button(page, t.legalOpen).click();
    const sheet = page.locator('.vol-legal.vol-modal--visible');
    await expect(sheet).toHaveCount(1);
    await expect(sheet.locator('.vol-sheet__title')).toHaveText(t.legalTitle);
    await expect(sheet.locator('.vol-legal__attribution')).toHaveCount(6);
    await expect(
      sheet.locator('.vol-legal__name', { hasText: 'Phosphor Icons 2.1.1' }),
    ).toHaveCount(1);
    // Adresler bağlantı değil metindir: gezinti başlatılmaz.
    await expect(sheet.locator('a')).toHaveCount(0);

    // Gövde odaklanabilir ve klavyeyle kayar.
    const body = sheet.locator('.vol-sheet__body');
    await body.focus();
    await expect(body).toBeFocused();
    const before = await body.evaluate((element) => element.scrollTop);
    await page.keyboard.press('PageDown');
    await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(before);

    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(button(page, t.legalOpen)).toBeFocused();
  });
});
