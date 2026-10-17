import { expect, test, type Locator, type Page } from '@playwright/test';
import { openShowcase, selectTab } from './support/determinism';

/**
 * Düzenleme menüsü (UI-11.2) gerçek tarayıcıda: sağ tık / Shift+F10 yerel menü yerine çekirdeğin menüsünü açar;
 * kurallar alan durumuna göre (salt okunur, parola); pano eylemleri odak ve olay akışını bozmaz; izin reddi akışı
 * bozmaz ve nedenini söyler. Pano bağdaştırıcısı iki motorda aynı davransın diye sayfaya yerleşik, bellekte bir
 * `navigator.clipboard` konur; gerçek sistem panosu ayrıca Chromium'da (izinli) sınanır.
 *
 * Seçimli açılışlar `contextmenu` olayını doğrudan atar: gerçek sağ tık seçili aralığın dışına düşerse tarayıcı
 * seçimi daraltır (doğru davranış), bu da "seçili metni kopyala" senaryosunu fare konumuna bağımlı yapardı.
 */
const MENU = '.vol-edit-menu.vol-popup--visible';
const ITEM = `${MENU} .vol-context-menu__item`;
const CARD = '.vol-showcase-card:has(input[type="password"])';
const idx = { cut: 0, copy: 1, paste: 2, selectAll: 3 } as const;

/** Bellekte pano: yazılanı tutar; `deny` ise okuma/yazma izin reddiyle düşer. */
async function stubClipboard(
  page: Page,
  options: { deny?: boolean; text?: string } = {},
): Promise<void> {
  await page.addInitScript((init) => {
    const state = { text: init.text ?? '', deny: init.deny === true };
    const denied = (): Promise<never> =>
      Promise.reject(new DOMException('denied', 'NotAllowedError'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        readText: () => (state.deny ? denied() : Promise.resolve(state.text)),
        writeText: (value: string) => {
          if (state.deny) return denied();
          state.text = value;
          return Promise.resolve();
        },
      },
    });
    (window as unknown as { __clip: typeof state }).__clip = state;
  }, options);
}

const clipText = (page: Page): Promise<string> =>
  page.evaluate(() => (window as unknown as { __clip: { text: string } }).__clip.text);

interface Fields {
  card: Locator;
  normal: Locator;
  readOnly: Locator;
  password: Locator;
}

async function openFormsFields(page: Page): Promise<Fields> {
  await openShowcase(page);
  await selectTab(page, 'forms');
  const card = page.locator(CARD);
  await card.scrollIntoViewIfNeeded();
  return {
    card,
    normal: card.locator('input:not([type="password"]):not([readonly])'),
    readOnly: card.locator('input[readonly]'),
    password: card.locator('input[type="password"]'),
  };
}

async function selectRange(field: Locator, start: number, end: number): Promise<void> {
  await field.evaluate(
    (el, [from, to]) => {
      (el as HTMLInputElement).focus();
      (el as HTMLInputElement).setSelectionRange(from, to);
    },
    [start, end],
  );
}

/** Seçimi bozmadan, alanın içindeki bir noktada `contextmenu` olayı atar. */
async function openMenu(field: Locator): Promise<void> {
  await field.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    el.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + 10,
        clientY: rect.top + rect.height / 2,
      }),
    );
  });
}

test.describe('düzenleme menüsü: yapı ve kurallar', () => {
  test('sağ tık dört öğeli menüyü açar, yerel menü açılmaz; Escape kapatır ve odak alana döner', async ({
    page,
  }) => {
    await stubClipboard(page);
    const { normal } = await openFormsFields(page);
    await normal.click({ button: 'right' });
    await expect(page.locator(MENU)).toHaveCount(1);
    await expect(page.locator(ITEM)).toHaveCount(4);
    await expect(page.locator(MENU)).toHaveAttribute('role', 'menu');
    await page.keyboard.press('Escape');
    await expect(page.locator(MENU)).toHaveCount(0);
    await expect(normal).toBeFocused();
    await expect(page.locator('.vol-edit-menu-anchor')).toHaveCount(0);
  });

  test('koordinatsız (klavye kaynaklı) bağlam olayı menüyü alanın altında açar', async ({
    page,
  }) => {
    await stubClipboard(page);
    const { normal } = await openFormsFields(page);
    await normal.focus();
    // Shift+F10 / Menü tuşu koordinatsız (0, 0) `contextmenu` olayı üretir; motorlar kısayolu farklı sunar, olay doğrudan atılır.
    await normal.evaluate((el) => {
      el.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 0, clientY: 0 }),
      );
    });
    await expect(page.locator(MENU)).toHaveCount(1);
    const box = await normal.boundingBox();
    const menuBox = await page.locator(MENU).boundingBox();
    expect(menuBox!.y).toBeGreaterThanOrEqual(box!.y + box!.height - 2);
    // Menü klavyeyle kullanılır: ilk açık öğeye odak, Enter seçer.
    await expect(page.locator(`${ITEM}:focus`)).toHaveCount(1);
  });

  test('salt okunur alanda yalnız Kopyala ve Tümünü Seç; parolada Kes/Kopyala kapalı', async ({
    page,
  }) => {
    await stubClipboard(page);
    const { readOnly, password } = await openFormsFields(page);
    await selectRange(readOnly, 0, 4);
    await openMenu(readOnly);
    await expect(page.locator(ITEM)).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expect(page.locator(MENU)).toHaveCount(0);

    await selectRange(password, 0, 3);
    await openMenu(password);
    await expect(page.locator(ITEM)).toHaveCount(4);
    await expect(page.locator(ITEM).nth(idx.cut)).toBeDisabled();
    await expect(page.locator(ITEM).nth(idx.copy)).toBeDisabled();
    await expect(page.locator(ITEM).nth(idx.paste)).toBeEnabled();
  });

  test('metin alanı olmayan yerde menü açılmaz', async ({ page }) => {
    await stubClipboard(page);
    const { card } = await openFormsFields(page);
    await card.locator('.vol-showcase-card__title').click({ button: 'right' });
    await expect(page.locator(MENU)).toHaveCount(0);
  });
});

test.describe('düzenleme menüsü: pano eylemleri (bellekte pano)', () => {
  test('Kopyala seçimi panoya yazar; Kes siler; Yapıştır seçimin yerine koyar ve input olayı yayar', async ({
    page,
  }) => {
    await stubClipboard(page, { text: 'PANO' });
    const { normal } = await openFormsFields(page);
    await normal.fill('merhaba dünya');
    await page.evaluate(() => {
      const seen: string[] = [];
      (window as unknown as { __inputs: string[] }).__inputs = seen;
      document.addEventListener('input', (event) => seen.push(event.inputType));
    });

    await selectRange(normal, 0, 7);
    await openMenu(normal);
    await page.locator(ITEM).nth(idx.copy).click();
    await expect.poll(() => clipText(page)).toBe('merhaba');
    await expect(normal).toHaveValue('merhaba dünya');
    await expect(normal).toBeFocused();

    await selectRange(normal, 0, 8);
    await openMenu(normal);
    await page.locator(ITEM).nth(idx.cut).click();
    await expect(normal).toHaveValue('dünya');
    expect(await clipText(page)).toBe('merhaba ');

    await selectRange(normal, 0, 0);
    await openMenu(normal);
    await page.locator(ITEM).nth(idx.paste).click();
    await expect(normal).toHaveValue('merhaba dünya');
    const inputs = await page.evaluate(
      () => (window as unknown as { __inputs: string[] }).__inputs,
    );
    expect(inputs).toContain('deleteByCut');
    expect(inputs).toContain('insertFromPaste');
  });

  test('Tümünü Seç alanın tamamını seçer', async ({ page }) => {
    await stubClipboard(page);
    const { normal } = await openFormsFields(page);
    await normal.fill('abcdef');
    await selectRange(normal, 2, 2);
    await openMenu(normal);
    await page.locator(ITEM).nth(idx.selectAll).click();
    const range = await normal.evaluate((el) => [
      (el as HTMLInputElement).selectionStart,
      (el as HTMLInputElement).selectionEnd,
    ]);
    expect(range).toEqual([0, 6]);
  });

  test('izin reddi alanı değiştirmez, akışı bozmaz ve nedenini bildirir', async ({ page }) => {
    await stubClipboard(page, { deny: true, text: 'GİZLİ' });
    const { normal } = await openFormsFields(page);
    await normal.fill('abc');
    await selectRange(normal, 0, 3);
    await openMenu(normal);
    await page.locator(ITEM).nth(idx.cut).click();
    await expect(page.locator('.vol-toast__message')).toHaveCount(1);
    await expect(normal).toHaveValue('abc');

    await openMenu(normal);
    await page.locator(ITEM).nth(idx.paste).click();
    await expect(normal).toHaveValue('abc');
    await expect(normal).toBeFocused();
  });
});

test.describe('düzenleme menüsü: gerçek sistem panosu', () => {
  test.beforeEach(({ browserName }) => {
    // Playwright WebKit için pano izni veremez; gerçek panonun izinli yolu yalnız Chromium'da koşar.
    test.skip(browserName !== 'chromium', 'Pano izni yalnız Chromium bağlamında verilebilir');
  });

  test('Kes sonra Yapıştır gerçek panodan döner', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const { normal } = await openFormsFields(page);
    await normal.fill('gerçek pano');
    await selectRange(normal, 0, 7);
    await openMenu(normal);
    await page.locator(ITEM).nth(idx.cut).click();
    await expect(normal).toHaveValue('pano');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('gerçek ');

    await selectRange(normal, 4, 4);
    await openMenu(normal);
    await page.locator(ITEM).nth(idx.paste).click();
    await expect(normal).toHaveValue('panogerçek ');
  });
});
