import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const PORT = 5188;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SCREENSHOT_DIR = 'benchmarks/results/screenshots';

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
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

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
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    // K2: V3 + V4 (?audition=1&seed=1&exp=reseed,hard-core)
    const k2Url = `${BASE_URL}/?audition=1&seed=1&exp=reseed,hard-core`;
    console.log(`K2 sayfası açılıyor: ${k2Url}`);
    await page.goto(k2Url);
    await page.waitForSelector('canvas');
    console.log('K2 simülasyonu çalışıyor, 8 saniye bekleniyor...');
    await page.waitForTimeout(8000);
    const k2Path = `${SCREENSHOT_DIR}/k2-1280x800.png`;
    await page.screenshot({ path: k2Path });
    console.log(`K2 ekran görüntüsü kaydedildi: ${k2Path}`);

    // K3: V3 + V4 + V0 (?audition=1&seed=1&exp=reseed,hard-core&tidal=0)
    const k3Url = `${BASE_URL}/?audition=1&seed=1&exp=reseed,hard-core&tidal=0`;
    console.log(`K3 sayfası açılıyor: ${k3Url}`);
    await page.goto(k3Url);
    await page.waitForSelector('canvas');
    console.log('K3 simülasyonu çalışıyor, 8 saniye bekleniyor...');
    await page.waitForTimeout(8000);
    const k3Path = `${SCREENSHOT_DIR}/k3-1280x800.png`;
    await page.screenshot({ path: k3Path });
    console.log(`K3 ekran görüntüsü kaydedildi: ${k3Path}`);

    await browser.close();
    console.log('Tarayıcı kapatıldı.');
  } finally {
    server.kill();
    console.log('Dev sunucusu durduruldu.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
