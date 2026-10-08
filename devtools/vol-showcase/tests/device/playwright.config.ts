import { defineConfig } from '@playwright/test';

/**
 * GERÇEK CİHAZ koşusu (Android Chrome, CDP ile). Rutin `test:e2e` kapısının parçası DEĞİLDİR:
 * cihaz her zaman bağlı değildir ve sonuç cihaz kabul kaydıdır, kalite kapısı değildir.
 * `scripts/device-ui.mjs` yerel sunucuyu, `adb reverse` ve `adb forward` köprülerini kurar ve
 * bu yapılandırmayı çalıştırır.
 */
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  reporter: [['list']],
  timeout: 180_000,
  expect: { timeout: 20_000 },
});
