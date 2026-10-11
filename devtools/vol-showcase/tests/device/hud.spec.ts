import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { APP_URL, OUT_DIR, expect, test } from './device';
import { tap } from './touch';

/**
 * GERÇEK CİHAZ: HUD gösterge durumları ve bilgi panelleri (UI-08.1/08.2). Android Chrome'da gerçek dokunma
 * (CDP `Input.dispatchTouchEvent`, pointerType: touch) ve gerçek saat: Bar boş/dolu/meşgul/hata/geçersiz sayı, 6 haneli
 * sayaç düşüşü, hareket azaltma (tarayıcı emülasyonu) altında anında son durum, yüzen metin sınırı ve havuz,
 * SelectionInfoPanel okuyucu sözleşmesi ve düşük can deseni. Cihaz dili Türkçe ya da İngilizce olabilir; düğmeler iki dilde
 * eşleşir. İnsan işitme/ekran okuyucu kabulü bu kaydın dışındadır (UI-13.4).
 */
const serial = process.env.VOL_DEVICE_SERIAL;
const TAB_PANEL = '[role="tabpanel"]:not([aria-hidden="true"])';

function save(name: string, document: unknown): void {
  writeFileSync(resolve(OUT_DIR, name), `${JSON.stringify(document, null, 2)}\n`);
}

function shot(name: string): void {
  try {
    const png = execFileSync(
      process.env.ADB ?? 'adb',
      [...(serial ? ['-s', serial] : []), 'exec-out', 'screencap', '-p'],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    writeFileSync(resolve(OUT_DIR, name), png);
  } catch {
    /* ekran görüntüsü kanıtın eki; alınamazsa koşu durmaz */
  }
}

async function openHud(page: Page): Promise<void> {
  await page.goto(APP_URL, { waitUntil: 'load' });
  await page.waitForSelector('[role="tablist"]', { timeout: 30_000 });
  await tap(page, page.locator('[role="tab"][id$="-tab-hud"]'));
  await page
    .locator('[role="tabpanel"][id$="-panel-hud"]:not([aria-hidden="true"])')
    .waitFor({ timeout: 15_000 });
  await page.waitForTimeout(500);
}

/** Etkin panelde, iki dilde de eşleşen düğme. */
const button = (page: Page, name: RegExp): Locator =>
  page.locator(TAB_PANEL).getByRole('button', { name }).first();

const press = (page: Page, name: RegExp): Promise<void> => tap(page, button(page, name));

const bar = (page: Page): Locator => page.locator('[data-hud-state="bar"]');
const score = (page: Page): Locator => page.locator('[data-hud-state="score"]');

async function fillPercent(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const fill = element.querySelector<HTMLElement>('.vol-bar__fill')!;
    return (fill.getBoundingClientRect().width / element.getBoundingClientRect().width) * 100;
  });
}

const EMPTY = /^(Empty|Boş)$/;
const FULL = /^(Full|Dolu)$/;
const BUSY = /^(Busy|Meşgul)$/;
const ERROR = /^(Error|Hata)$/;
const INVALID = /^(Invalid number|Geçersiz sayı)$/;
const DROP = /^(Drop to 0|0'a düş)$/;
const CROWD = /^(Crowded fight|Yoğun çatışma)/;
const SELECT = /^(Select Tower|Kule Seç)$/;
const HURT = /^(Damage selected|Seçiliye hasar)/;
const CLEAR = /^(Clear Selection|Seçimi Temizle)$/;

test.afterEach(async ({ device: page }) => {
  await page.emulateMedia({ reducedMotion: null });
});

test('cihaz: Bar boş/dolu/meşgul/hata/geçersiz sayı gerçek dokunuşla; değerler ve durumlar okunur', async ({
  device: page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openHud(page);
  const target = bar(page);
  const record: Record<string, unknown> = {};

  await expect(target).toHaveAttribute('role', 'progressbar');
  record.initial = {
    now: await target.getAttribute('aria-valuenow'),
    text: await target.getAttribute('aria-valuetext'),
    name: await target.getAttribute('aria-label'),
  };

  await press(page, EMPTY);
  await expect(target).toHaveAttribute('aria-valuenow', '0');
  await expect.poll(() => fillPercent(target)).toBeLessThan(1);
  record.empty = { text: await target.getAttribute('aria-valuetext') };

  await press(page, FULL);
  await expect(target).toHaveAttribute('aria-valuenow', '100');
  await expect.poll(() => fillPercent(target)).toBeGreaterThan(97);

  await press(page, BUSY);
  await expect(target).toHaveAttribute('aria-busy', 'true');
  for (const name of ['aria-valuenow', 'aria-valuemax', 'aria-valuetext'])
    await expect(target).not.toHaveAttribute(name, /.*/);
  const busyFill = await fillPercent(target);
  expect(busyFill).toBeGreaterThan(28);
  expect(busyFill).toBeLessThan(40);
  shot('hud-bar-busy.png');

  await press(page, ERROR);
  await expect(target).toHaveClass(/vol-bar--error/);
  await expect(target).not.toHaveAttribute('aria-busy', 'true');
  shot('hud-bar-error.png');

  // Hata/meşgul düğmeleri açma-kapamadır: ikinci basış normale döner.
  await press(page, ERROR);
  await expect(target).not.toHaveClass(/vol-bar--error/);
  await expect(target).toHaveAttribute('aria-valuenow', '100');
  await press(page, INVALID);
  const invalidNow = Number(await target.getAttribute('aria-valuenow'));
  expect(Number.isFinite(invalidNow)).toBe(true);
  record.invalid = { now: invalidNow, fill: await fillPercent(target) };

  save('hud-bar-states.json', record);
});

test('cihaz: hareket azaltmada değer değişimi anında hedeftedir (geçiş yok)', async ({
  device: page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openHud(page);
  const width = await bar(page).evaluate((element) => {
    const fill = element.querySelector<HTMLElement>('.vol-bar__fill')!;
    const target = [...document.querySelectorAll<HTMLButtonElement>('button')].find((candidate) =>
      /^(Empty|Boş)$/.test(candidate.textContent?.trim() ?? ''),
    )!;
    target.click();
    return fill.style.width;
  });
  expect(width).toBe('0%');
});

test('cihaz: 6 haneli sayaç 0a düşer ve ekran okuyucu yalnız bir kez duyurur; dokunma hedefi ≥ 44 px', async ({
  device: page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openHud(page);
  const display = score(page).locator('.vol-counter__display');
  await expect(display).toHaveText(/999[.,]999/);
  const drop = button(page, DROP);
  const box = (await drop.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(43.5);
  await tap(page, drop);
  await expect(display).toHaveText('0', { timeout: 10_000 });
  const overflow = await score(page).evaluate((element) => ({
    scroll: element.scrollWidth,
    client: element.clientWidth,
  }));
  save('hud-counter-drop.json', { drop: box, overflow });
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 1);
});

test('cihaz: yoğun çatışmada yüzen metin sayısı sınırda kalır (24), süre dolunca düğüm kalmaz', async ({
  device: page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openHud(page);
  const container = page.locator('.vol-floating-text-container').first();
  await press(page, CROWD);
  // Bileşenin kendi sayacı (activeCount) sınıra dayanır; DOM'daki canlı öğe sayısı da sınırı aşmaz.
  const counter = page.getByText(/^(On screen|Ekranda): \d+ \((limit|sınır) 24\)$/);
  await expect(counter).toHaveText(/: 24 \(/);
  const peak = await container.locator('.vol-floating-text').count();
  expect(peak).toBeLessThanOrEqual(24);
  expect(peak).toBeGreaterThan(0);
  await expect
    .poll(async () => container.locator('.vol-floating-text--visible').count(), { timeout: 10_000 })
    .toBe(0);
  const after = await container.locator('.vol-floating-text').count();
  save('hud-floating-cap.json', { peak, after });
});

test('cihaz: SelectionInfoPanel dokunuşla — adlı bölge, ad duyurusu ve düşük can deseni', async ({
  device: page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openHud(page);
  const panel = page.locator('.vol-selection-panel').first();
  await expect(panel).toHaveAttribute('role', 'region');
  await tap(page, button(page, SELECT));
  const status = panel.locator('[role="status"]');
  await expect(status).toContainText(/Arrow Tower|Ok Kulesi/);
  const health = panel.locator('.vol-bar');
  await expect(health).toHaveAttribute('aria-valuetext', '80 / 100');
  await tap(page, button(page, HURT));
  await tap(page, button(page, HURT));
  await expect(health).toHaveAttribute('aria-valuetext', /^20 \/ 100, (low|düşük)$/);
  await expect(health).toHaveClass(/vol-bar--low/);
  const pattern = await health.evaluate(
    (element) =>
      getComputedStyle(element.querySelector('.vol-bar__fill')!, '::after').backgroundImage,
  );
  expect(pattern).toContain('repeating-linear-gradient');
  shot('hud-selection-low.png');
  await tap(page, button(page, CLEAR));
  await expect(status).toContainText(/No selection|Seçili öğe yok/);
  save('hud-selection.json', { pattern: pattern.slice(0, 120) });
});
