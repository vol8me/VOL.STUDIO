import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const PORT = 5189;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const KANIT_DIR = '/home/vol8me/vol-life-kanit/kabul/kamera';

async function waitForServer(url: string, maxRetries = 30): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // ignore
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Sunucuya bağlanılamadı: ${url}`);
}

async function main() {
  mkdirSync(KANIT_DIR, { recursive: true });

  console.log(`Vite dev sunucusu başlatılıyor (port ${PORT})...`);
  const server = spawn(
    'pnpm',
    ['exec', 'vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: 'ignore',
    },
  );

  try {
    await waitForServer(BASE_URL);
    console.log(`Sunucu hazır: ${BASE_URL}`);

    const browser = await chromium.launch({ headless: true });

    // 1) Yatay: 1280x800
    {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      await page.goto(BASE_URL);
      await page.waitForSelector('canvas');
      await page.waitForTimeout(4000);
      const landscapePath = `${KANIT_DIR}/tarayici-yatay-1280x800.png`;
      await page.screenshot({ path: landscapePath });
      console.log(`Tarayıcı yatay kaydedildi: ${landscapePath}`);
      await context.close();
    }

    // 2) Dikey: 800x1280
    {
      const context = await browser.newContext({
        viewport: { width: 800, height: 1280 },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      await page.goto(BASE_URL);
      await page.waitForSelector('canvas');
      await page.waitForTimeout(4000);
      const portraitPath = `${KANIT_DIR}/tarayici-dikey-800x1280.png`;
      await page.screenshot({ path: portraitPath });
      console.log(`Tarayıcı dikey kaydedildi: ${portraitPath}`);
      await context.close();
    }

    await browser.close();
  } finally {
    server.kill();
    console.log('Dev sunucusu durduruldu.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
