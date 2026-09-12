import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const server = await createServer({
  root: new URL('..', import.meta.url).pathname,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
});
await server.listen();
const baseUrl = server.resolvedUrls?.local[0];
if (!baseUrl) throw new Error('Render benchmark sunucusu adres üretmedi.');

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const results = [];
  for (const count of [100, 1000, 5000]) {
    await page.goto(`${baseUrl}benchmarks/particle-render.html?particles=${count}`);
    await page.waitForFunction(
      () =>
        (window as Window & { __VOL_LIFE_RENDER_RESULT__?: unknown })
          .__VOL_LIFE_RENDER_RESULT__ !== undefined,
      null,
      { timeout: 30_000 },
    );
    results.push(
      await page.evaluate(
        () =>
          (window as Window & { __VOL_LIFE_RENDER_RESULT__?: unknown })
            .__VOL_LIFE_RENDER_RESULT__,
      ),
    );
  }
  console.log(JSON.stringify({ renderer: 'Phaser.WebGL.Graphics', results }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
