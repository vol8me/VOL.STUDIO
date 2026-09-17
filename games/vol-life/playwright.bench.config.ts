import { defineConfig, devices } from '@playwright/test';

/**
 * D4 ölçüm koşusu. `pnpm high` kapısına GİRMEZ: bu bir kapı değil referanstır
 * ve 60 saniyeden uzun sürer. Ölçüm sayfası yalnız `VOL_LIFE_BENCH=1` ile
 * derlenir, bu yüzden üretim derlemesi ölçüm kodunu taşımaz.
 */
const PORT = Number(process.env.VOL_LIFE_BENCH_PORT ?? 5183);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/bench',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  timeout: 300_000,
  expect: { timeout: 30_000 },
  use: { baseURL: BASE_URL, trace: 'off' },
  projects: [
    { name: 'masaüstü', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobil', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: `VOL_LIFE_BENCH=1 pnpm exec vite build && pnpm exec vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: BASE_URL,
    name: 'VOL.LIFE ölçüm sunucusu',
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
