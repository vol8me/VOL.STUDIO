import { expect, test } from '@playwright/test';
import { openShowcase, selectTab } from './support/determinism';
import { installVirtualPad, pressButton, tiltStick } from './support/gamepad';

/**
 * KOL E2E kapısı — TODO D3'ün kapanış cümlesi: vitrindeki her etkileşimli
 * bileşen yalnız sanal kolla kullanılır. `installVirtualPad` sayfadan önce
 * tek `standard` kolu takar; vitrin gerçek donanım gördüğünü sanır.
 *
 * Düğme dizinleri CORE `GAMEPAD_BUTTON` sabitlerinin aynasıdır: E2E
 * sözleşmeyi dışarıdan sınadığı için core'u import etmez — drift olursa
 * bu test kırılır, ki amaç da budur. İddialar dile bağlı metne değil
 * sınıf/role işaretlerine bakar: i18n locale'i koşudan koşuya değişebilir.
 */
const PAD = {
  primary: 0,
  secondary: 1,
  leftBumper: 4,
  rightBumper: 5,
  start: 9,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
} as const;

const RING = '.vol-focusnav-current';
/** Vitrin ana sekme listesi — sayfadaki tek `vol-tabs` tablist'i. */
const ACTIVE_TAB = '[role="tablist"] .vol-tabs__tab[aria-selected="true"]';
/** `showConfirm` iletişim kutusu — vitrindeki tek onay eylem çifti taşıyan dialog. */
const CONFIRM_DIALOG = '[role="dialog"]:has(.vol-confirm__actions)';

test.beforeEach(async ({ page }) => {
  await installVirtualPad(page);
  await openShowcase(page);
});

test('D-pad ilk basışta ilk odaklanabilir elemana halka takar', async ({ page }) => {
  await pressButton(page, PAD.dpadDown);
  const ring = page.locator(RING);
  await expect(ring).toHaveCount(1);
  await expect(ring).toBeFocused();
  // DOM sırasında ilk aday başlıktaki dil düğmesidir.
  await expect(ring).toHaveClass(/vol-showcase-lang-button/);
});

test('D-pad odağı uzamsal taşır; A odaktaki elemanı etkinleştirir', async ({ page }) => {
  await pressButton(page, PAD.dpadDown);
  await pressButton(page, PAD.dpadRight);
  // Dil düğmesinin sağındaki uzamsal komşu tam ekran düğmesidir.
  await expect(page.locator(RING)).toHaveClass(/vol-showcase-fullscreen-button/);

  await pressButton(page, PAD.dpadLeft);
  const langBefore = await page.locator('html').getAttribute('lang');
  await pressButton(page, PAD.primary);
  // A, dil düğmesini tıklar → vitrin diğer dile geçer ve yeniden kurulur.
  await expect(page.locator('html')).not.toHaveAttribute('lang', langBefore ?? '');
});

test('RB/LB sekme sırasında ileri/geri sarar', async ({ page }) => {
  const activeId = () => page.locator(ACTIVE_TAB).getAttribute('id');
  const first = await activeId();
  await pressButton(page, PAD.rightBumper);
  const second = await activeId();
  expect(second).not.toBe(first);
  await pressButton(page, PAD.leftBumper);
  expect(await activeId()).toBe(first);
});

test('Menu duraklatma iletişim kutusu açar; B aynı geri yığınından kapatır', async ({ page }) => {
  await pressButton(page, PAD.start);
  const dialog = page.locator(CONFIRM_DIALOG);
  await expect(dialog).toBeVisible();
  await pressButton(page, PAD.secondary);
  await expect(dialog).toHaveCount(0);
});

test('sol çubuk da yön kenarı üretir', async ({ page }) => {
  await tiltStick(page, 0, 1);
  await expect(page.locator(RING)).toHaveCount(1);
  await tiltStick(page, 1, 0);
  await expect(page.locator(RING)).toHaveCount(1);
});

test('işaretçi tıklaması kol halkasını siler', async ({ page }) => {
  await pressButton(page, PAD.dpadDown);
  await expect(page.locator(RING)).toHaveCount(1);
  await page.mouse.click(700, 400);
  await expect(page.locator(RING)).toHaveCount(0);
});

test('glifler kiple eşleşir: kol kipinde pad glifi görünür, klavye glifi gizlenir', async ({
  browser,
}) => {
  /*
   * Bu test `openShowcase`'i kullanamaz: oradaki `freezeEnvironment`
   * `performance.now`'u 0'a dondurur; `InputModeArbiter`'ın kenar-zamanı
   * sıralaması donmuş saatte çalışmaz (tüm kenarlar 0'a eşitlenir). Kip
   * geçişi gerçek saatle sınanır; piksel determinizmi bu iddianın konusu
   * değildir. Taze bağlam açılır — beforeEach'in kurduğu init betikleri
   * (dondurma dahil) yeni bağlama sızmasın diye.
   */
  const context = await browser.newContext();
  const page = await context.newPage();
  await installVirtualPad(page);
  await page.goto('/');
  await page.waitForSelector('[role="tablist"]');
  await selectTab(page, 'touch');
  const glyphRow = page.locator('.vol-showcase-gamepad-glyphs');
  const images = glyphRow.locator('.vol-glyph__img');
  const visiblePads = glyphRow.locator(
    `.vol-glyph:not([hidden]) .vol-glyph__img[src*="assets/glyphs/xbox/"]`,
  );
  const visibleKeys = glyphRow.locator(
    `.vol-glyph:not([hidden]) .vol-glyph__img[src*="assets/glyphs/keyboard/"]`,
  );

  // Sekme tıklaması pc girdisidir → başlangıçta klavye/fare glifleri görünür.
  await expect(visibleKeys).toHaveCount(2);
  await expect(visiblePads).toHaveCount(0);

  // Tıklamanın etkinlik penceresi (250ms) kapansın: pencere açıkken hakem
  // etkin pc sağlayıcısını haklı olarak tutar, kol kenarı yeni gelince kazanır.
  await page.waitForTimeout(300);

  /*
   * Basılı TUTULUR: `pressButton`'ın tek karelik bas-bırak döngüsü vitrin
   * rAF tick'iyle yarışır; `pad.isActive` anlık duruma bakar. Glif iddiası
   * kol etkinken görünürlüktür — basılı tutarak kenarın yakalanmasını
   * garantiye alıyoruz.
   */
  await page.evaluate((i) => {
    const pad = window.__virtualPad;
    pad.timestamp += 1;
    pad.buttons[i].pressed = true;
  }, PAD.primary);
  await expect(visiblePads).toHaveCount(2);
  await expect(images.first()).toHaveAttribute('src', /assets\/glyphs\/xbox\//);
  await expect(visibleKeys).toHaveCount(0);
  await page.evaluate((i) => {
    const pad = window.__virtualPad;
    pad.timestamp += 1;
    pad.buttons[i].pressed = false;
  }, PAD.primary);

  // Klavye girdisi → klavye/fare ailesi görünür, pad glifleri gizlenir.
  await page.keyboard.press('w');
  await expect(visibleKeys).toHaveCount(2);
  await expect(visiblePads).toHaveCount(0);
  await context.close();
});

test('kol kipinde metin alanı odaklanınca ekran klavyesi açılır; yazılan değer işlenir', async ({
  browser,
}) => {
  /*
   * Glif testiyle aynı sebep: `openShowcase`'in `freezeEnvironment`'ı
   * `performance.now`'u dondurur, kip hakemi ölü saatte çalışamaz. Kip
   * geçişi gerçek saatle sınanır.
   */
  const context = await browser.newContext();
  const page = await context.newPage();
  await installVirtualPad(page);
  await page.goto('/');
  await page.waitForSelector('[role="tablist"]');
  await selectTab(page, 'touch');
  await page.waitForTimeout(300);

  // Kol kenarı → hakem 'gamepad' kipine geçer (basılı tutma gerekmez; son
  // anlamlı girdi kazanır ve başka kaynak kenar üretmedikçe kip kalır).
  await pressButton(page, PAD.primary);

  const input = page.locator(
    '.vol-showcase-panel-demo:has(.vol-showcase-gamepad-glyphs) input.vol-input',
  );
  await expect(input).toBeVisible();
  // FocusNavController'ın A'sı `.click()` çağırır ve odak focus olayı üretir;
  // burada odak doğrudan verilir — iddia "focus → klavye" zinciridir.
  await input.evaluate((el: HTMLInputElement) => el.focus());

  const osk = page.locator('.vol-osk');
  await expect(osk).toBeVisible();
  await expect(input).not.toBeFocused(); // klavye açıkken native caret durur

  // Kolla tuş yazımı: D-pad ilk halkayı kurar, A odaktaki tuşu basar.
  await pressButton(page, PAD.dpadDown);
  await expect(osk.locator(RING)).toHaveCount(1);
  await pressButton(page, PAD.dpadDown); // '1' → 'q' satırı
  await pressButton(page, PAD.primary); // odaktaki harfi yaz
  await expect(osk.locator('.vol-osk__value')).not.toHaveText('');

  // B = iptal: ortak geri yığını klavyeyi kapatır, değer uygulanmaz.
  await pressButton(page, PAD.secondary);
  await expect(osk).toHaveCount(0);
  await expect(input).toHaveValue('');

  // Tekrar aç → yaz → 'Bitti' ye in: son satırdaki tek geniş tuş.
  // İptalde klavye odağı alana geri vermişti; odaklı elemana focus() olay
  // üretmez, önce blur gerekir.
  await input.evaluate((el: HTMLInputElement) => {
    el.blur();
    el.focus();
  });
  await expect(osk).toBeVisible();
  await pressButton(page, PAD.dpadDown);
  await pressButton(page, PAD.dpadDown);
  await pressButton(page, PAD.primary);
  for (let i = 0; i < 4; i += 1) await pressButton(page, PAD.dpadDown);
  await pressButton(page, PAD.primary); // odak 'Bitti'de → commit
  await expect(osk).toHaveCount(0);
  const typed = await input.inputValue();
  expect(typed.length).toBe(1); // ilk tur iptal edildi; ikinci tur tek harf
  await context.close();
});
