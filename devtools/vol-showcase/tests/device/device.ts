import { chromium, test as base, type Browser, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Cihazdaki Chrome'a CDP ile bağlanan fixture. Tarayıcı ve sayfa çalışma boyunca paylaşılır: sekme/yerleşim
 * kuruluşu pahalıdır ve cihazda her test için yeniden açmak ölçümü bozar.
 */
const CDP_URL = process.env.VOL_DEVICE_CDP ?? 'http://127.0.0.1:9222';
export const APP_URL = process.env.VOL_DEVICE_URL ?? 'http://localhost:4173/';
export const OUT_DIR = resolve(
  process.env.VOL_DEVICE_OUT ?? resolve(import.meta.dirname, '../../records/ui-device/adhoc'),
);

let browser: Browser | null = null;

export const test = base.extend<{ device: Page }>({
  device: async ({}, use) => {
    browser ??= await chromium.connectOverCDP(CDP_URL, { timeout: 30_000 });
    const context = browser.contexts()[0];
    const page = await context.newPage();
    mkdirSync(OUT_DIR, { recursive: true });
    await use(page);
    await page.close();
  },
});

export const expect = base.expect;
