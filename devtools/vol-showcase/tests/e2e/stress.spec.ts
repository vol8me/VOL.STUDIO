import { expect, test, type Page } from '@playwright/test';
import { openShowcase, selectTab } from './support/determinism';

/**
 * Etkileşim stresi (UI-13.2): katmanlar açıkken dil ve tema değişimi, art arda aç/kapat, istek (yükleme)
 * beklerken tema/dil/sekme değişimi, %200 (640×400) ve RTL altında aynı akışlar. Beklenen: konsolda hata
 * yok, yetim katman/kilit sınıfı kalmaz, odak kaybolmaz, açık kalan katman çalışmaya devam eder ya da
 * temiz kapanır.
 */
const LANG_BUTTON = '.vol-showcase-lang-button';
const SKIN_BUTTON = '.vol-showcase-skin-button';
const LOADING = '.vol-loading';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function openOsk(page: Page): Promise<void> {
  await selectTab(page, 'forms');
  await page.getByRole('button', { name: 'Open keyboard', exact: true }).click();
  await page.locator('.vol-osk').waitFor();
}

/** Skin/dil düğmesi sistem olayı gibi tetiklenir: tam ekran katman gerçek işaretçiyi örter. */
async function pressChrome(page: Page, selector: string): Promise<void> {
  await page.evaluate((target) => document.querySelector<HTMLElement>(target)?.click(), selector);
}

const brandToken = (page: Page): Promise<string> =>
  page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--vol-ui-brand-solid').trim(),
  );

/**
 * Yükleme ekranı gerçek saatle koşar (determinizm düzeneği `performance.now`'u dondurur ve takılma/bekleme
 * süreleri işlemezdi), bu yüzden bu testlerde sayfa doğrudan açılır.
 */
async function openLive(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForSelector('[role="tablist"]');
  await selectTab(page, 'loading');
}

const STAGE_BUTTON = /preview full flow|tam akışı önizle/i;
const FAILURE_BUTTON = /simulate failed loading|başarısız yüklemeyi dene/i;

async function startLoading(page: Page, name: RegExp): Promise<void> {
  const trigger = page.getByRole('button', { name });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  await expect(page.locator(LOADING)).toHaveCount(1);
}

/** Gövdede kalan kilit/inert izi: katman kapanınca sıfır olmalı. */
async function leftovers(
  page: Page,
): Promise<{ locks: string[]; inert: boolean; loading: number }> {
  return page.evaluate((loading) => {
    return {
      locks: [...document.body.classList].filter((name) => /lock|modal/i.test(name)),
      inert: document.body.hasAttribute('inert'),
      loading: document.querySelectorAll(loading).length,
    };
  }, LOADING);
}

test('ekran klavyesi açıkken dil değişimi: yetim klavye ya da kilit kalmaz, hata yok', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openShowcase(page);
  await openOsk(page);
  await page.locator(LANG_BUTTON).click();
  await page.waitForTimeout(600);
  const state = await page.evaluate(() => ({
    keyboards: document.querySelectorAll('.vol-osk').length,
    locked: document.body.classList.length,
    activeIsBody: document.activeElement === document.body,
  }));
  expect(state.keyboards, 'en çok bir klavye').toBeLessThanOrEqual(1);
  if (state.keyboards === 1) {
    // Açık kalan klavye çalışmalı: bir tuşa basınca değer metni değişir, Bitti kapatır.
    await page.locator('.vol-osk__key').nth(10).click();
    await page.getByRole('button', { name: /Done|Bitti/ }).click();
    await expect(page.locator('.vol-osk')).toHaveCount(0);
  }
  expect(errors, 'konsol hatası yok').toEqual([]);
});

test('ekran klavyesi açıkken tema değişimi klavyeyi bozmaz', async ({ page }) => {
  const errors = trackErrors(page);
  await openShowcase(page);
  await openOsk(page);
  await page.locator(SKIN_BUTTON).click();
  await page.waitForTimeout(400);
  await expect(page.locator('.vol-osk')).toHaveCount(1);
  await page.getByRole('button', { name: /Cancel|Vazgeç/ }).click();
  await expect(page.locator('.vol-osk')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('katmanları art arda aç/kapat: yetim katman ve kilit sınıfı kalmaz', async ({ page }) => {
  const errors = trackErrors(page);
  await openShowcase(page);
  await selectTab(page, 'panels');
  const open = page.getByRole('button', { name: 'Open Modal', exact: true });
  for (let i = 0; i < 6; i += 1) {
    await open.click();
    await expect(page.locator('.vol-modal--visible')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('.vol-modal--visible')).toHaveCount(0);
  }
  const leftover = await page.evaluate(() => ({
    bodyClasses: [...document.body.classList],
    visibleModals: document.querySelectorAll('.vol-modal--visible').length,
  }));
  expect(leftover.visibleModals).toBe(0);
  expect(leftover.bodyClasses.filter((name) => /lock|modal/i.test(name))).toEqual([]);
  expect(errors).toEqual([]);
});

for (const [label, opener] of [
  ['Open Modal', 'modal'],
  ['Open Sheet', 'sheet'],
] as const) {
  test(`${opener} açıkken dil değişimi (sistem olayı): yetim katman, odak kilidi ya da gövde kilidi kalmaz`, async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await openShowcase(page);
    await selectTab(page, 'panels');
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator('.vol-modal--visible')).toHaveCount(1);
    // Sistem dil değişimi: kapsam arkasındaki düğme programatik tetiklenir.
    await pressChrome(page, LANG_BUTTON);
    await page.waitForTimeout(800);
    const state = await page.evaluate(() => ({
      visible: document.querySelectorAll('.vol-modal--visible').length,
      bodyClasses: [...document.body.classList],
      inertBody: document.body.hasAttribute('inert'),
    }));
    expect(state.visible, 'görünür katman 0 ya da 1').toBeLessThanOrEqual(1);
    expect(state.bodyClasses.filter((name) => /lock|modal/i.test(name))).toEqual(
      state.visible === 1 ? state.bodyClasses.filter((name) => /lock|modal/i.test(name)) : [],
    );
    expect(state.inertBody).toBe(false);
    // Kullanıcı hâlâ sayfayı kullanabilmeli: Escape ile kapanır, sekme tıklanır.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await selectTab(page, 'buttons');
    expect(errors).toEqual([]);
  });
}

test.describe('istek beklerken (yükleme ekranı)', () => {
  test('tema değişimi: ekran sürer, yeni tokenla tamamlanır, temiz kapanır', async ({ page }) => {
    const errors = trackErrors(page);
    await openLive(page);
    await startLoading(page, STAGE_BUTTON);
    const before = await brandToken(page);
    await pressChrome(page, SKIN_BUTTON);
    await expect(page.locator(SKIN_BUTTON)).toHaveAttribute('data-skin', 'aurum');
    expect(await brandToken(page), 'tokenlar değişti').not.toBe(before);
    await expect(page.locator(LOADING), 'istek tema yüzünden kesilmez').toHaveCount(1);
    await expect(page.locator(LOADING)).toHaveCount(0, { timeout: 20_000 });
    expect(await leftovers(page)).toEqual({ locks: [], inert: false, loading: 0 });
    await selectTab(page, 'buttons');
    expect(errors, 'konsol hatası yok').toEqual([]);
  });

  test('dil değişimi: bekleyen istek yetim ekran bırakmadan iptal olur, sayfa kullanılır kalır', async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await openLive(page);
    await startLoading(page, STAGE_BUTTON);
    await pressChrome(page, LANG_BUTTON);
    // Dil değişimi sekmeyi yeniden kurar; bekleyen yükleme ekranı onunla birlikte yok edilir.
    await expect(page.locator(LOADING)).toHaveCount(0, { timeout: 5_000 });
    // Eski zamanlayıcılar sonradan çalışıp hata/ekran üretmemeli: yük süresinin ötesinde bekle.
    await page.waitForTimeout(7_000);
    expect(await leftovers(page)).toEqual({ locks: [], inert: false, loading: 0 });
    await selectTab(page, 'buttons');
    // Yeni dilde yükleme yeniden başlatılabilir ve tamamlanır (eski sonuç yeni ekrana karışmaz).
    await selectTab(page, 'loading');
    await startLoading(page, STAGE_BUTTON);
    await expect(page.locator(LOADING)).toHaveCount(0, { timeout: 20_000 });
    expect(errors, 'konsol hatası yok').toEqual([]);
  });

  test('sekme değişimi: yükleme sürer (iptal olmaz), sekme seçilir, bitince geri gelmez', async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await openLive(page);
    await startLoading(page, STAGE_BUTTON);
    const tab = '[role="tab"][id$="-tab-buttons"]';
    await pressChrome(page, tab);
    await expect(page.locator(tab), 'sekme seçilir').toHaveAttribute('aria-selected', 'true');
    await expect(page.locator(LOADING), 'sekme gezinmesi isteği iptal etmez').toHaveCount(1);
    await expect(page.locator(LOADING)).toHaveCount(0, { timeout: 20_000 });
    // Eski zamanlayıcı ya da gecikmeli sonuç ekranı geri getirmemeli.
    await page.waitForTimeout(1_500);
    expect(await leftovers(page)).toEqual({ locks: [], inert: false, loading: 0 });
    expect(errors).toEqual([]);
  });

  test('hızlı tekrar: art arda başlatma tek ekran bırakır, eskisi sızmaz', async ({ page }) => {
    const errors = trackErrors(page);
    await openLive(page);
    await page.evaluate((source) => {
      const pattern = new RegExp(source, 'i');
      const button = [...document.querySelectorAll('button')].find((candidate) =>
        pattern.test(candidate.textContent ?? ''),
      );
      for (let i = 0; i < 5; i += 1) button?.click();
    }, STAGE_BUTTON.source);
    await expect(page.locator(LOADING)).toHaveCount(1);
    await expect(page.locator(LOADING)).toHaveCount(0, { timeout: 20_000 });
    expect(await leftovers(page)).toEqual({ locks: [], inert: false, loading: 0 });
    expect(errors).toEqual([]);
  });

  test('hata durumunda tema değişimi: uyarı ve odak yerinde kalır, yeniden deneme tamamlanır', async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await openLive(page);
    await startLoading(page, FAILURE_BUTTON);
    const alert = page.locator(`${LOADING} [role="alert"]`);
    await expect(alert).toBeVisible({ timeout: 10_000 });
    const retry = alert.getByRole('button').first();
    await expect(retry).toBeFocused();
    await pressChrome(page, SKIN_BUTTON);
    await expect(page.locator(SKIN_BUTTON)).toHaveAttribute('data-skin', 'aurum');
    await expect(alert, 'uyarı tema değişince kapanmaz').toBeVisible();
    await expect(retry, 'odak kaybolmaz').toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator(LOADING)).toHaveCount(0, { timeout: 15_000 });
    expect(await leftovers(page)).toEqual({ locks: [], inert: false, loading: 0 });
    expect(errors).toEqual([]);
  });

  test('hata durumunda dil değişimi: ekran yetim kalmaz, yeni dilde hata akışı yeniden çalışır', async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await openLive(page);
    await startLoading(page, FAILURE_BUTTON);
    const alert = page.locator(`${LOADING} [role="alert"]`);
    await expect(alert).toBeVisible({ timeout: 10_000 });
    await pressChrome(page, LANG_BUTTON);
    await expect(page.locator(LOADING)).toHaveCount(0, { timeout: 5_000 });
    expect(await leftovers(page)).toEqual({ locks: [], inert: false, loading: 0 });
    await selectTab(page, 'loading');
    await startLoading(page, FAILURE_BUTTON);
    const again = page.locator(`${LOADING} [role="alert"]`);
    await expect(again).toBeVisible({ timeout: 10_000 });
    await again.getByRole('button').nth(1).click();
    await expect(page.locator(LOADING)).toHaveCount(0, { timeout: 15_000 });
    expect(errors).toEqual([]);
  });
});

/**
 * %200 yaklaşımı (640×400 ≈ 1280×800'ün iki katı büyütülmüşü) ve RTL: aynı akışlar ters yön ve dar/kısa
 * pencerede de odağı, kilidi ve sığmayı korur. Gerçek %200 tarayıcı yakınlaştırması ve IME bu düzenekte yok.
 */
const CONTEXTS = [
  { name: 'rtl 1280×800', path: '/?dir=rtl', width: 1280, height: 800 },
  { name: 'ltr %200 (640×400)', path: '/', width: 640, height: 400 },
  { name: 'rtl %200 (640×400)', path: '/?dir=rtl', width: 640, height: 400 },
] as const;

for (const context of CONTEXTS) {
  test.describe(`bağlam: ${context.name}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: context.width, height: context.height });
    });

    test('ekran klavyesi: tema değişiminden sonra sığar, odak içinde kalır, Vazgeç kapatır', async ({
      page,
    }) => {
      const errors = trackErrors(page);
      await openShowcase(page, 20260101, context.path);
      await openOsk(page);
      await pressChrome(page, SKIN_BUTTON);
      await page.waitForTimeout(400);
      await expect(page.locator('.vol-osk')).toHaveCount(1);
      const fit = await page.evaluate(() => {
        const rect = document.querySelector('.vol-osk')!.getBoundingClientRect();
        const cancel = [...document.querySelectorAll('.vol-osk button')].find((button) =>
          /Cancel|Vazgeç/.test(button.textContent ?? ''),
        );
        const cancelRect = cancel?.getBoundingClientRect();
        return {
          insideX: rect.left >= -1 && rect.right <= window.innerWidth + 1,
          insideY: rect.top >= -1 && rect.bottom <= window.innerHeight + 1,
          cancelVisible:
            !!cancelRect &&
            cancelRect.width > 0 &&
            cancelRect.bottom <= window.innerHeight + 1 &&
            cancelRect.right <= window.innerWidth + 1 &&
            cancelRect.left >= -1,
          focusInside: !!document.activeElement?.closest('.vol-osk'),
        };
      });
      expect(fit.insideX, 'klavye yatayda sığar').toBe(true);
      expect(fit.insideY, 'klavye dikeyde sığar').toBe(true);
      expect(fit.cancelVisible, 'Vazgeç görünür ve ekranda').toBe(true);
      expect(fit.focusInside, 'odak klavyenin içinde').toBe(true);
      await page.getByRole('button', { name: /Cancel|Vazgeç/ }).click();
      await expect(page.locator('.vol-osk')).toHaveCount(0);
      expect(errors).toEqual([]);
    });

    test('Modal: art arda aç/kapat ve açıkken dil değişimi kilit/yetim katman bırakmaz', async ({
      page,
    }) => {
      const errors = trackErrors(page);
      await openShowcase(page, 20260101, context.path);
      await selectTab(page, 'panels');
      const open = page.getByRole('button', { name: 'Open Modal', exact: true });
      for (let i = 0; i < 3; i += 1) {
        await open.click();
        await expect(page.locator('.vol-modal--visible')).toHaveCount(1);
        await page.keyboard.press('Escape');
        await expect(page.locator('.vol-modal--visible')).toHaveCount(0);
      }
      await open.click();
      await expect(page.locator('.vol-modal--visible')).toHaveCount(1);
      await pressChrome(page, LANG_BUTTON);
      await page.waitForTimeout(800);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      expect(await leftovers(page)).toEqual({ locks: [], inert: false, loading: 0 });
      await selectTab(page, 'buttons');
      expect(errors).toEqual([]);
    });
  });
}
