import type { Page } from '@playwright/test';

declare global {
  interface Window {
    __virtualPad: {
      timestamp: number;
      axes: number[];
      buttons: { pressed: boolean; touched: boolean; value: number }[];
    };
  }
}

/**
 * Sanal standart kol — gerçek donanım olmadan `navigator.getGamepads`
 * üzerinden sürer. Playwright'ın kol taklidi yok; `addInitScript` sayfa
 * betiklerinden önce koştuğu için vitrinin gördüğü tek kol budur.
 *
 * Pad nesnesi DEĞİŞKEN tutulur: `FocusNavController` her rAF'ta aynı
 * nesneyi yeniden okur, tarayıcının anlık görüntü semantiği taklit
 * edilmez. Basışlar `press`'in kenar üretmesiyle gerçek bas-bırak
 * döngüsünü yaşar.
 */

const PAD_SCRIPT = `
  const pad = {
    id: 'VOL.UI virtual pad (E2E)',
    index: 0,
    connected: true,
    mapping: 'standard',
    timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  };
  window.__virtualPad = pad;
  navigator.getGamepads = () => [pad, null, null, null];
`;

/** Sayfaya sanal kolu takar; `openShowcase`'tan ÖNCE çağrılır. */
export async function installVirtualPad(page: Page): Promise<void> {
  await page.addInitScript(PAD_SCRIPT);
}

/** Düğmeye basıp bırakır; iki rAF'lık kenar döngüsünü bekler. */
export async function pressButton(page: Page, index: number): Promise<void> {
  await page.evaluate((i) => {
    const pad = window.__virtualPad;
    pad.timestamp += 1;
    pad.buttons[i].pressed = true;
  }, index);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await page.evaluate((i) => {
    const pad = window.__virtualPad;
    pad.timestamp += 1;
    pad.buttons[i].pressed = false;
  }, index);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
}

/** Sol çubuğu bir yöne bastırıp bırakır (gezinme eşiği 0.6). */
export async function tiltStick(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(
    ([px, py]) => {
      const pad = window.__virtualPad;
      pad.timestamp += 1;
      pad.axes[0] = px;
      pad.axes[1] = py;
    },
    [x, y],
  );
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await page.evaluate(() => {
    const pad = window.__virtualPad;
    pad.timestamp += 1;
    pad.axes[0] = 0;
    pad.axes[1] = 0;
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
}
