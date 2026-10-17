import { expect, test, type Locator, type Page } from '@playwright/test';
import { openShowcase, selectTab } from './support/determinism';

/**
 * Tema laboratuvarı (UI-07.4), gerçek tarayıcıda iki motorda: skin/yoğunluk değişimi yalnız nitelik yazar (DOM, metin, seçim,
 * kaydırma, odak sabit), kapsamlı önizlemeler küresel seçiciden bağımsızdır, kapsama bağlanan katmanlar kapsamın kaplamasını
 * giyer, canvas çizimleri (CurveEditor, Minimap) kaplamayı kendileri izler, Palette değerleri bayatlamaz, dil değişimi
 * sekmeyi, kaydırmayı ve odağı korur. Skin/yoğunluk × her sekme matrisi `themeMatrix.spec.ts`tedir.
 */
const brand = (locator: Locator): Promise<string> =>
  locator.evaluate((element) =>
    getComputedStyle(element).getPropertyValue('--vol-ui-brand-solid').trim(),
  );

const root = (page: Page): Locator => page.locator('html');
const scope = (page: Page, kind: 'global' | 'a' | 'b'): Locator =>
  page.locator(`[data-vol-scope="${kind}"]`);
const globalSkin = (page: Page): Locator =>
  page.getByRole('radiogroup', { name: 'Skin', exact: true });
const globalDensity = (page: Page): Locator => page.locator('.vol-theme-lab__global .vol-select');

async function open(page: Page): Promise<void> {
  await openShowcase(page);
  await selectTab(page, 'theme');
}

async function chooseDensity(page: Page, name: string): Promise<void> {
  await globalDensity(page).click();
  await page.getByRole('option', { name, exact: true }).click();
}

const canvasUrl = (locator: Locator): Promise<string> =>
  locator.evaluate((element) => (element as HTMLCanvasElement).toDataURL());

test.describe('skin ve yoğunluk anlıktır ve durumu korur', () => {
  test('DOM kimliği, yazılan metin, seçim, kaydırma ve odak değişmez', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page);
    const input = scope(page, 'a').getByRole('textbox', { name: 'Name' });
    await input.fill('Operator-07');
    await input.evaluate((element: HTMLInputElement) => element.setSelectionRange(2, 6));
    await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      w.lab = document.querySelector('.vol-theme-lab');
      w.input = document.querySelector(
        '[data-vol-scope="a"] input[type="text"], [data-vol-scope="a"] input:not([type])',
      );
      const panels = document.querySelector('.vol-tabs__panels') as HTMLElement;
      panels.scrollTop = 140;
    });
    const scrolled = await page.evaluate(
      () => (document.querySelector('.vol-tabs__panels') as HTMLElement).scrollTop,
    );
    expect(scrolled, 'sekme içeriği kaydırılabilir olmalı').toBeGreaterThan(0);

    // Skin: ok tuşuyla seçim değişir, odak AYNI düğmenin kardeşine geçer (DOM yeniden kurulmaz).
    const before = await brand(root(page));
    await globalSkin(page).getByRole('radio', { name: 'Steel' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(root(page)).toHaveAttribute('data-vol-theme', 'aurum');
    expect(await brand(root(page)), 'renk tokenı aynı çerçevede değişir').not.toBe(before);
    await expect(globalSkin(page).getByRole('radio', { name: 'Aurum' })).toBeFocused();
    // Skin geometriyi değiştirmez: kaydırma konumu BİREBİR aynı kalır.
    const afterSkin = await page.evaluate(
      () => (document.querySelector('.vol-tabs__panels') as HTMLElement).scrollTop,
    );
    expect(afterSkin).toBe(scrolled);

    await chooseDensity(page, 'Compact');
    await expect(root(page)).toHaveAttribute('data-vol-density', 'compact');
    await expect(globalDensity(page)).toBeFocused();

    const state = await page.evaluate(() => {
      const w = window as unknown as { lab: Element; input: HTMLInputElement };
      return {
        sameLab: w.lab === document.querySelector('.vol-theme-lab'),
        sameInput: w.input === document.querySelector('[data-vol-scope="a"] input'),
        value: w.input.value,
        selection: [w.input.selectionStart, w.input.selectionEnd],
        scrollTop: (document.querySelector('.vol-tabs__panels') as HTMLElement).scrollTop,
      };
    });
    expect(state.sameLab).toBe(true);
    expect(state.sameInput).toBe(true);
    expect(state.value).toBe('Operator-07');
    expect(state.selection).toEqual([2, 6]);
    // Yoğunluk boşluk ölçeğini değiştirir: üstteki içerik kısalır ve kaydırma çapası olmayan motorda (WebKit) görünen içerik
    // birkaç on piksel kayar. Konum sıfırlanmaz ya da başka yere atlamaz.
    expect(state.scrollTop).toBeGreaterThan(0);
    expect(Math.abs(state.scrollTop - scrolled)).toBeLessThanOrEqual(60);
  });

  test('seçim yeniden yüklemede kalır; üst çubuk skin düğmesi seçicilere yansır', async ({
    page,
  }) => {
    await open(page);
    await chooseDensity(page, 'Spacious');
    await page.locator('.vol-showcase-skin-button').click();
    await expect(root(page)).toHaveAttribute('data-vol-theme', 'aurum');
    // Başka yerden gelen değişim küresel seçiciye ve durum satırına düşer.
    await expect(globalSkin(page).getByRole('radio', { name: 'Aurum' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.locator('.vol-theme-lab__readout')).toContainText('Aurum');
    await expect(page.locator('.vol-theme-lab__readout')).toContainText('Spacious');
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('device.volui:density')))
      .toBe('"spacious"');

    await page.reload();
    await page.waitForSelector('[role="tablist"]');
    await expect(root(page)).toHaveAttribute('data-vol-theme', 'aurum');
    await expect(root(page)).toHaveAttribute('data-vol-density', 'spacious');
  });
});

test.describe('kapsamlı önizlemeler', () => {
  test('kapsamlar küresel seçiciden bağımsızdır; kendi seçicisi yalnız kendi kutusunu değiştirir', async ({
    page,
  }) => {
    await open(page);
    const a = scope(page, 'a');
    const b = scope(page, 'b');
    await expect(a).toHaveAttribute('data-vol-theme', 'aurum');
    await expect(b).toHaveAttribute('data-vol-theme', 'default');
    const [rootBrand, aBrand, bBrand] = [await brand(root(page)), await brand(a), await brand(b)];
    expect(aBrand).not.toBe(rootBrand);
    expect(bBrand).toBe(rootBrand);

    // Küresel skin aurum olunca B kendi varsayılanını korur, A zaten aurumdur, "küreseli izleyen" kutu aurum olur.
    await page.locator('.vol-showcase-skin-button').click();
    expect(await brand(root(page))).toBe(aBrand);
    expect(await brand(b)).toBe(bBrand);
    expect(await brand(scope(page, 'global'))).toBe(aBrand);

    // B'nin kendi seçicisi yalnız B'yi çevirir.
    await b.getByRole('radio', { name: 'Aurum' }).click();
    await expect(b).toHaveAttribute('data-vol-theme', 'aurum');
    await expect(a).toHaveAttribute('data-vol-theme', 'aurum');
    expect(await brand(b)).toBe(aBrand);
    await expect(root(page)).toHaveAttribute('data-vol-theme', 'aurum');
  });

  test('kutuya bağlanan katman kutunun kaplamasını giyer ve tetikleyicinin hemen altında açılır', async ({
    page,
  }) => {
    await open(page);
    await page.locator('.vol-showcase-skin-button').click(); // küresel = aurum; B = steel
    const b = scope(page, 'b');
    const trigger = b.getByRole('button', { name: /^Quality/ });
    await trigger.click();
    const listbox = b.locator('.vol-select__listbox');
    await expect(listbox).toBeVisible();
    expect(await brand(listbox), 'kutudaki katman B (steel) rengini giyer').toBe(await brand(b));
    expect(await brand(listbox)).not.toBe(await brand(root(page)));
    // `position: fixed` kapsayıcıya göre kaymaz: liste tetikleyicinin kenarına hizalı açılır.
    const t = (await trigger.boundingBox())!;
    const l = (await listbox.boundingBox())!;
    expect(Math.abs(l.x - t.x)).toBeLessThanOrEqual(8);
    expect(l.y - (t.y + t.height)).toBeLessThanOrEqual(12);
    expect(l.y).toBeGreaterThanOrEqual(t.y);
    await page.keyboard.press('Escape');
    await expect(listbox).toBeHidden();

    // Küresel kutunun listesi <body>ye iner ve küresel (aurum) rengi giyer.
    const globalTrigger = scope(page, 'global').getByRole('button', { name: /^Quality/ });
    await globalTrigger.click();
    const portal = page.locator('body > .vol-select__listbox');
    await expect(portal).toBeVisible();
    expect(await brand(portal)).toBe(await brand(root(page)));
  });

  test('canvas çizimleri kaplamayı izler: skin değişince ve kapsamlar arasında', async ({
    page,
  }) => {
    await open(page);
    const curve = (kind: 'global' | 'a' | 'b') =>
      scope(page, kind).locator('.vol-curve-editor__canvas');
    const minimap = (kind: 'global' | 'a' | 'b') =>
      scope(page, kind).locator('.vol-minimap__canvas');

    // A (aurum) ve B (steel) AYNI veriyi farklı kaplamayla çizer: piksel farklıdır.
    expect(await canvasUrl(curve('a'))).not.toBe(await canvasUrl(curve('b')));
    expect(await canvasUrl(minimap('a'))).not.toBe(await canvasUrl(minimap('b')));

    // B'yi aurum yapınca A ile aynı çizim olur (kaplama dışında hiçbir fark yok).
    const beforeCurve = await canvasUrl(curve('b'));
    const beforeMap = await canvasUrl(minimap('b'));
    await scope(page, 'b').getByRole('radio', { name: 'Aurum' }).click();
    await expect.poll(() => canvasUrl(curve('b'))).not.toBe(beforeCurve);
    await expect.poll(() => canvasUrl(minimap('b'))).not.toBe(beforeMap);
    await expect.poll(() => canvasUrl(curve('b'))).toBe(await canvasUrl(curve('a')));
    await expect.poll(() => canvasUrl(minimap('b'))).toBe(await canvasUrl(minimap('a')));

    // Küresel kutu: üst çubuk skin düğmesi kökü değiştirir, canvas yeniden çizilir.
    const globalBefore = await canvasUrl(curve('global'));
    await page.locator('.vol-showcase-skin-button').click();
    await expect.poll(() => canvasUrl(curve('global'))).not.toBe(globalBefore);
    await expect.poll(() => canvasUrl(curve('global'))).toBe(await canvasUrl(curve('a')));
  });
});

test('Palette değerleri skin değişince bayatlamaz', async ({ page }) => {
  await openShowcase(page);
  await selectTab(page, 'palette');
  const swatch = page.locator('.vol-palette-swatch', { hasText: /^brand-solid/ });
  const hex = swatch.locator('.vol-palette-swatch__hex');
  const chip = swatch.locator('.vol-palette-swatch__chip');
  const before = { text: await hex.textContent(), chip: await chip.evaluate(bg) };
  await page.locator('.vol-showcase-skin-button').click();
  await expect(hex).not.toHaveText(before.text ?? '');
  // Yazı güncel token değerini, çip de AYNI rengi gösterir.
  expect(await chip.evaluate(bg)).not.toBe(before.chip);
  expect(await hex.textContent()).toBe(await brand(root(page)));
});

function bg(element: Element): string {
  return getComputedStyle(element).backgroundColor;
}

test('dil değişimi sekmeyi, kaydırmayı ve odağı korur', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  await page.evaluate(() => {
    (document.querySelector('.vol-tabs__panels') as HTMLElement).scrollTop = 160;
  });
  const scrolled = await page.evaluate(
    () => (document.querySelector('.vol-tabs__panels') as HTMLElement).scrollTop,
  );
  expect(scrolled).toBeGreaterThan(0);
  await expect(page.locator('html')).toHaveAttribute('lang', /^en/);

  const language = page.getByRole('radiogroup', { name: 'Language', exact: true });
  await language.getByRole('radio', { name: 'English' }).focus();
  await page.keyboard.press('ArrowLeft'); // Türkçe
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr');

  // Sekme, kaydırma ve odak: aynı konum, aynı sıradaki denetim (yeni DOM'da).
  await expect(page.locator('[role="tab"][id$="-tab-theme"]')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const restored = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    return {
      scrollTop: (document.querySelector('.vol-tabs__panels') as HTMLElement).scrollTop,
      role: active?.getAttribute('role') ?? null,
      checked: active?.getAttribute('aria-checked') ?? null,
      group: active?.closest('[role="radiogroup"]')?.getAttribute('aria-label') ?? null,
    };
  });
  expect(Math.abs(restored.scrollTop - scrolled)).toBeLessThanOrEqual(2);
  expect(restored).toMatchObject({ role: 'radio', checked: 'true', group: 'Dil' });
});

test('oturum bilgisi gerçek tam ekran karşılığını söyler', async ({ page }) => {
  await open(page);
  await expect(page.locator('.vol-theme-lab__session')).toContainText(
    'web · web · fullscreen: browser',
  );
});

test('Fullscreen API yoksa oturum bilgisi "sunulmaz" der', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });
    Object.defineProperty(document, 'webkitFullscreenEnabled', {
      configurable: true,
      value: false,
    });
  });
  await open(page);
  await expect(page.locator('.vol-theme-lab__session')).toContainText('not offered');
});
