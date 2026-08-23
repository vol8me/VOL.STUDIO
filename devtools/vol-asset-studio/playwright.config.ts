import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.VOL_ASSET_STUDIO_E2E_PORT ?? 5176);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * Gerçek tarayıcı kapısı.
 *
 * jsdom testleri font yüklemesini, gerçek yerleşimi ve bundle içeriğini
 * göremez; bu proje o boşluğu kapatır. Sunucu Playwright tarafından gerçek
 * repo kökü üzerinde başlatılır — fixture değil, kullanıcının göreceği katalog.
 *
 * `test:e2e` yalnız Chromium kritik akışlarını, `test:e2e:full` Chromium +
 * Firefox tam matrisini koşar; `high` kapısına yalnız ilki girer ki push
 * öncesi bekleme kısa kalsın.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'list' : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ...(process.env.VOL_E2E_FULL === '1'
      ? [{ name: 'firefox', use: { ...devices['Desktop Firefox'] } }]
      : []),
  ],
  webServer: {
    command: `pnpm exec tsx server/cli.ts --port ${PORT}`,
    url: `${BASE_URL}/api/v1/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // İstek logu E2E çıktısını boğuyordu; hatalar stderr'de görünmeye devam eder.
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
