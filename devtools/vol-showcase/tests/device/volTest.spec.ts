import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { OUT_DIR, expect, test } from './device';
import { centerOf, gesture, release, tap } from './touch';

/**
 * GERÇEK CİHAZ: VOL.TEST'in dokunmatik kontrolleri (UI-10.1): sol çubuk tankı sürer ve bırakınca durdurur, basılı-tut
 * düğmesi (hızlanma) basılıyken oyunda gerçekten hızlanma kipini açar. Android Chrome'da gerçek dokunuş (CDP
 * `Input.dispatchTouchEvent`, pointerType: touch); oyunun kendi HUD'u, gerçek Phaser döngüsü. Yalnız
 * `scripts/device-ui.mjs --game` ile koşar (oyunun yerel sunucusu ve `adb reverse` köprüsü o kurar).
 */
const GAME_URL = process.env.VOL_DEVICE_GAME_URL;
const serial = process.env.VOL_DEVICE_SERIAL;

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

/** Minimap'in bildirdiği tank konumu (metre). */
async function position(page: Page): Promise<{ x: number; y: number }> {
  const value = (await page.locator('.vt-hud__map').getAttribute('data-position')) ?? '0,0';
  const [x, y] = value.split(',').map(Number);
  return { x: x ?? 0, y: y ?? 0 };
}

async function openGame(page: Page): Promise<void> {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  await page.goto(GAME_URL!, { waitUntil: 'load' });
  await expect(page.locator('#game > canvas')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('hud')).toBeVisible({ timeout: 60_000 });
  // İlk gerçek dokunuş HUD'u dokunmatik kipe geçirir.
  await tap(page, page.locator('#game > canvas'));
  await expect(page.getByTestId('touch-boost')).toBeVisible();
  await expect(page.getByTestId('touch-brake')).toBeVisible();
  expect(problems, 'sayfa hatası').toEqual([]);
}

test.beforeEach(({}, info) => {
  info.skip(!GAME_URL, 'VOL_DEVICE_GAME_URL yok: `device-ui.mjs --game` ile koşun');
});

test('cihaz: VOL.TEST sol çubuğu gerçek dokunuşla tankı sürer ve bırakılınca durdurur', async ({
  device: page,
}) => {
  await openGame(page);
  const base = page.getByTestId('stick-move').locator('.vol-joystick__base');
  const center = await centerOf(base);
  const start = await position(page);

  const held = await gesture(
    page,
    [{ from: center, to: { x: center.x + 50, y: center.y } }],
    8,
    true,
  );
  await expect
    .poll(async () => (await position(page)).x, { timeout: 15_000 })
    .toBeGreaterThan(start.x + 2);
  const moving = await position(page);
  shot('voltest-stick-moving.png');
  await release(held);

  // Bırakınca tankın fiziksel sönümü 1,5 s gözlenir; sonraki bağımsız 700 ms pencerede konum değişmez.
  await page.waitForTimeout(1500);
  const settled = await position(page);
  await page.waitForTimeout(700);
  const later = await position(page);
  expect(Math.abs(later.x - settled.x) + Math.abs(later.y - settled.y)).toBeLessThan(0.5);

  save('voltest-stick.json', { start, whileHeld: moving, afterRelease: later });
});

test('cihaz: VOL.TEST hızlanma düğmesi (çubukla birlikte, çok parmak) hızlanma kipini açar, bırakınca kapatır', async ({
  device: page,
}) => {
  await openGame(page);
  const boost = page.getByTestId('touch-boost');
  const stick = await centerOf(page.getByTestId('stick-move').locator('.vol-joystick__base'));
  const boostPoint = await centerOf(boost);
  const boosting = page.locator('.vt-hud--boosting');
  await expect(boosting).toHaveCount(0);

  // Hızlanma yalnız ileri giderken sürer (oyun kuralı): bir parmak çubukta, bir parmak düğmede, aynı anda.
  const held = await gesture(
    page,
    [
      { from: stick, to: { x: stick.x + 50, y: stick.y } },
      { from: boostPoint, to: boostPoint },
    ],
    8,
    true,
  );
  await expect(boost).toHaveAttribute('aria-pressed', 'true');
  await expect(boosting).toHaveCount(1, { timeout: 10_000 });
  shot('voltest-boost-held.png');
  await release(held);
  await expect(boost).toHaveAttribute('aria-pressed', 'false');
  await expect(boosting).toHaveCount(0, { timeout: 10_000 });

  save('voltest-boost.json', {
    pressedWhileHeld: true,
    boostingWhileHeld: true,
    releasedAfter: true,
    note: 'hızlanma yalnız ileri giderken sürer: çubuk ve düğme iki parmakla birlikte',
  });
});
