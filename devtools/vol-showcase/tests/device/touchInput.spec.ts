import { settleFrames } from '../e2e/support/settle';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import type { ShowcaseTab } from '../e2e/support/determinism';
import { APP_URL, OUT_DIR, expect, test } from './device';
import { centerOf, gesture, release, tap } from './touch';

/**
 * GERÇEK CİHAZ dokunma kabulü (UI-10.1, UI-10.4): Android Chrome'da gerçek çok-parmaklı dokunma (CDP
 * `Input.dispatchTouchEvent`, pointerType: touch). Çubuk ve basılı-tut denetimleri sürülür/bırakılır, kaydırma jesti çekilir,
 * parmakla yakınlaştırma gerçek sıkıştırmayla çalışır VE aynı kamera dokunulan düğmelerle de yakınlaşır (parmakla büyütme
 * tek yol değildir). Fiziksel kol ve insan hissi bu kaydın dışındadır (UI-13.4).
 */
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

async function openTab(page: Page, tab: ShowcaseTab): Promise<void> {
  await page.goto(APP_URL, { waitUntil: 'load' });
  await page.waitForSelector('[role="tablist"]', { timeout: 30_000 });
  await tap(page, page.locator(`[role="tab"][id$="-tab-${tab}"]`));
  await page
    .locator(`[role="tabpanel"][id$="-panel-${tab}"]:not([aria-hidden="true"])`)
    .waitFor({ timeout: 15_000 });
  await settleFrames(page);
}

const demoOf = (page: Page, selector: string): Locator =>
  page
    .locator('.vol-showcase-panel-demo')
    .filter({ has: page.locator(selector) })
    .first();

const vectorOf = async (demo: Locator): Promise<{ x: number; y: number }> => {
  const text = (await demo.textContent()) ?? '';
  const match = /x:\s*(-?[\d.]+)\s+y:\s*(-?[\d.]+)/.exec(text);
  if (!match) throw new Error(`vektör okunamadı: ${text}`);
  return { x: Number(match[1]), y: Number(match[2]) };
};

const percentOf = async (locator: Locator): Promise<number> => {
  const match = /(\d+)/.exec((await locator.textContent()) ?? '');
  if (!match) throw new Error('yüzde okunamadı');
  return Number(match[1]);
};

test('cihaz: çubuklar ve basılı-tut gerçek dokunuşla sürülür ve bırakılınca sıfırlanır', async ({
  device: page,
}) => {
  await openTab(page, 'touch');

  const results: Record<string, unknown> = {};
  for (const [name, base] of [
    ['Joystick', '.vol-joystick__base'],
    ['SquareJoystick', '.vol-square-joystick__base'],
  ] as const) {
    const demo = demoOf(page, base);
    const stick = demo.locator(base);
    const center = await centerOf(stick);
    const held = await gesture(
      page,
      [{ from: center, to: { x: center.x + 40, y: center.y - 30 } }],
      8,
      true,
    );
    const moved = await vectorOf(demo);
    expect(Math.abs(moved.x) + Math.abs(moved.y), `${name} dokunuşla sürülmedi`).toBeGreaterThan(
      0.3,
    );
    expect(moved.x).toBeGreaterThan(0);
    expect(moved.y).toBeLessThan(0);
    await release(held);
    await expect.poll(() => vectorOf(demo)).toEqual({ x: 0, y: 0 });
    results[name] = { whileHeld: moved, afterRelease: { x: 0, y: 0 } };
  }

  const hold = page.locator('.vol-hold-button').first();
  const holdPoint = await centerOf(hold);
  const heldButton = await gesture(page, [{ from: holdPoint, to: holdPoint }], 1, true);
  await expect(hold).toHaveAttribute('aria-pressed', 'true');
  await release(heldButton);
  await expect(hold).toHaveAttribute('aria-pressed', 'false');
  results.HoldButton = { pressedWhileHeld: true, releasedAfter: true };

  shot('touch-sticks-hold.png');
  save('touch-sticks-hold.json', results);
});

test('cihaz: kaydırma jesti dokunuşla çekilir; yön düğmeleri aynı olayı üretir', async ({
  device: page,
}) => {
  await openTab(page, 'touch');
  const demo = demoOf(page, '.vol-swipe-zone');
  const zone = demo.locator('.vol-swipe-zone');
  const box = (await (async () => {
    await zone.scrollIntoViewIfNeeded();
    return zone.boundingBox();
  })())!;
  const y = box.y + box.height / 2;

  await gesture(
    page,
    [{ from: { x: box.x + box.width * 0.2, y }, to: { x: box.x + box.width * 0.85, y } }],
    8,
  );
  await expect(demo).toContainText(/(Right|Sağ).*\d+\s?px/);

  await tap(page, demo.getByRole('button').nth(0));
  await expect(demo).toContainText(/(Left|Sol).*40\s?px/);
  shot('touch-swipe.png');
  save('touch-swipe.json', { gestureRight: true, buttonLeft40px: true });
});

test('cihaz: parmakla büyütme gerçek sıkıştırmayla çalışır ve aynı kamera dokunulan düğmelerle de yakınlaşır', async ({
  device: page,
}) => {
  await openTab(page, 'touch');
  const demo = demoOf(page, '.vol-pinch-zoom');
  const label = demo.getByText(/Zoom:/);
  const viewport = demo.locator('.vol-pinch-zoom__viewport');
  await viewport.scrollIntoViewIfNeeded();
  const box = (await viewport.boundingBox())!;
  const mid = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  expect(await percentOf(label)).toBe(100);
  // İki parmak açılır: gerçek sıkıştırma (pinch-out) yakınlaştırır.
  await gesture(
    page,
    [
      { from: { x: mid.x - 20, y: mid.y }, to: { x: mid.x - 90, y: mid.y } },
      { from: { x: mid.x + 20, y: mid.y }, to: { x: mid.x + 90, y: mid.y } },
    ],
    10,
  );
  const pinched = await percentOf(label);
  expect(pinched, 'sıkıştırma yakınlaştırmadı').toBeGreaterThan(100);

  // Alternatif: sıfırla ve aynı zoom'a düğmelerle çık (parmak sıkıştırma gerekmez).
  await tap(page, demo.getByRole('button', { name: /^(Reset|Sıfırla)$/ }));
  await expect.poll(() => percentOf(label)).toBe(100);
  await tap(page, demo.getByRole('button', { name: /^(Zoom in|Yakınlaştır)$/ }));
  await expect.poll(() => percentOf(label)).toBe(125);
  await tap(page, demo.getByRole('button', { name: /^(Zoom out|Uzaklaştır)$/ }));
  await tap(page, demo.getByRole('button', { name: /^(Zoom out|Uzaklaştır)$/ }));
  await expect.poll(() => percentOf(label)).toBe(75);

  shot('touch-pinch-buttons.png');
  save('touch-pinch-buttons.json', {
    pinchOutPercent: pinched,
    buttons: { zoomIn: 125, zoomOutTwice: 75 },
  });
});

test('cihaz: dünya kamerası sıkıştırmayla ve düğmeyle yakınlaşır, sıfırla dünyayı sığdırır', async ({
  device: page,
}) => {
  await openTab(page, 'touch');
  const demo = demoOf(page, 'canvas.vol-showcase-world-camera');
  const canvas = demo.locator('canvas.vol-showcase-world-camera');
  const frame = () => canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
  await canvas.scrollIntoViewIfNeeded();
  const initial = await frame();
  const box = (await canvas.boundingBox())!;
  const mid = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  await gesture(
    page,
    [
      { from: { x: mid.x - 20, y: mid.y }, to: { x: mid.x - 80, y: mid.y } },
      { from: { x: mid.x + 20, y: mid.y }, to: { x: mid.x + 80, y: mid.y } },
    ],
    10,
  );
  await expect.poll(frame).not.toBe(initial);
  const pinched = await frame();

  await tap(page, demo.getByRole('button', { name: /^(Reset|Sıfırla)$/ }));
  await expect.poll(frame).toBe(initial);
  await tap(page, demo.getByRole('button', { name: /^(Zoom in|Yakınlaştır)$/ }));
  await expect.poll(frame).not.toBe(initial);
  expect(await frame()).not.toBe(pinched);

  shot('touch-world-camera.png');
  save('touch-world-camera.json', { pinchChangedFrame: true, buttonChangedFrame: true });
});
