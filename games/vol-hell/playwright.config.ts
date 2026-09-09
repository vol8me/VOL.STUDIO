import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.VOL_HELL_E2E_PORT ?? 5185);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * Gerçek tarayıcı kapısı.
 *
 * Görsel doğrulama bir dönem İKİ UÇLUYDU: `devtools/vol-ui` piksel temelli bir
 * kapıya sahipti, `games/*` sahneleri ise yalnız elle (`pnpm dev`) bakılarak
 * doğrulanıyordu. Birim testler Phaser'ın görüntü ağacını bir İKİZLE sürer;
 * ikiz üretim koduna fazla yakındır ve ikisi birlikte yanlış olabilir.
 *
 * Buradaki kapı dar ve ucuz bir şeyi kanıtlar: oyun gerçek bir tarayıcıda,
 * gerçek Phaser ile açılıyor, ana menü çiziliyor, tema token'ları uygulanıyor
 * ve konsola hata düşmüyor.
 *
 * `preview` sunucusu kullanılır, `dev` değil: sınanan şey GÖNDERİLEN build'dir.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: { baseURL: BASE_URL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // `--host 127.0.0.1` AÇIKÇA verilir: varsayılan bağlama `localhost`tur ve
    // IPv6 önceliği olan bir makinede yalnız `::1`e oturur.
    command: `pnpm exec vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: BASE_URL,
    name: 'VOL.HELL preview sunucusu',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
