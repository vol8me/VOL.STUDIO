/**
 * Gerçek istemciyi uzak bir Chromium'da (Android Chrome, Deck'teki Chrome) açar, HUD veri
 * özniteliklerini örnekler ve dokunmatik yerleştirmeyi dener. Paketli uygulama değil, cihazdaki
 * tarayıcı motorudur. Dokunuş gerçek parmak değil, DevTools `Input.dispatchTouchEvent`tir.
 *
 *   APP_URL='http://127.0.0.1:5202/?server=http%3A%2F%2F127.0.0.1%3A2567&world=dense-1' \
 *   CDP=http://127.0.0.1:9222 LABEL=tablet SECONDS=300 \
 *   pnpm --filter @volstudio/vol-test2 exec tsx scripts/device-app.ts
 *
 * Sunucu `VOL_TEST2_METRICS_PORT` ile açılmalı (`METRICS`, kabul edilen komutları saymak için), istemci
 * sayfası ve sunucu cihazdan erişilebilir olmalı (`adb reverse`, `ssh -R`). Sonuç `records/devices/`
 * altına yazılır (git dışı).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const cdp = process.env.CDP ?? 'http://127.0.0.1:9222';
const appUrl = process.env.APP_URL;
if (!appUrl) throw new Error('APP_URL gerekli.');
const label = (process.env.LABEL ?? 'device').replace(/[^a-z0-9-]/gi, '');
const seconds = Number(process.env.SECONDS ?? 60);
const metricsUrl = process.env.METRICS ?? 'http://127.0.0.1:2999/metrics';
const world = process.env.WORLD ?? 'dense-1';

interface Metrics {
  worlds: { worldId: string; commands: { accepted: number; rejected: number } }[];
}

async function counters(): Promise<{ accepted: number; rejected: number }> {
  const body = (await (await fetch(metricsUrl)).json()) as Metrics;
  const found = body.worlds.find((entry) => entry.worldId === world);
  if (!found) throw new Error(`Dünya metriklerde yok: ${world}`);
  return found.commands;
}

const browser = await chromium.connectOverCDP(cdp);
const context = browser.contexts()[0] ?? (await browser.newContext());
const page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.goto(appUrl);
await page.waitForSelector('[data-testid="factory-status"][data-status="live"]', {
  timeout: 60_000,
});

const gpu = await page.evaluate(`(() => {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
  const info = gl && gl.getExtension('WEBGL_debug_renderer_info');
  return {
    renderer: info && gl ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null,
    dpr: window.devicePixelRatio,
    viewport: [window.innerWidth, window.innerHeight],
  };
})()`);

const session = await context.newCDPSession(page);
async function tap(x: number, y: number): Promise<void> {
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(60);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

// Araç seç, tuvale dokun; dolu karoya denk gelirse sunucu reddeder, boşa denk gelene dek dene.
const before = await counters();
const button = (await page.locator('[data-item-id="conveyor"]').boundingBox())!;
await tap(button.x + button.width / 2, button.y + button.height / 2);
await page.waitForTimeout(300);
const canvas = (await page.locator('#game canvas').boundingBox())!;
let taps = 0;
for (const [dx, dy] of [
  [90, 140],
  [37, 61],
  [-53, 29],
  [121, -77],
  [-141, 83],
  [23, -119],
  [173, 41],
  [-89, -61],
]) {
  await tap(canvas.x + canvas.width / 2 + dx, canvas.y + canvas.height / 2 + dy);
  taps++;
  await page.waitForTimeout(400);
  if ((await counters()).accepted > before.accepted) break;
}
await page.waitForTimeout(1000);
const after = await counters();

const read = (): Promise<Record<string, string | undefined>> =>
  page
    .getByTestId('factory-stats')
    .evaluate((element) => ({ ...(element as HTMLElement).dataset }));
const samples: Record<string, string | undefined>[] = [];
for (let elapsed = 0; elapsed < seconds; elapsed += 5) {
  samples.push(await read());
  await page.waitForTimeout(5000);
}

await mkdir('records/devices', { recursive: true });
await writeFile(`records/devices/${label}-screen.png`, await page.screenshot());
const report = {
  label,
  gpu,
  touch: {
    taps,
    accepted: after.accepted - before.accepted,
    rejected: after.rejected - before.rejected,
  },
  errors,
  samples,
};
await writeFile(`records/devices/${label}-app.json`, JSON.stringify(report, null, 2));
const numbers = (name: string): number[] => samples.map((sample) => Number(sample[name]));
console.log(
  JSON.stringify(
    {
      label,
      gpu,
      touch: report.touch,
      errors,
      last: samples[samples.length - 1],
      fpsMin: Math.min(...numbers('fps')),
      frameP99Max: Math.max(...numbers('frameP99')),
      stepP99Max: Math.max(...numbers('stepP99')),
    },
    null,
    2,
  ),
);
await page.close();
await browser.close();
