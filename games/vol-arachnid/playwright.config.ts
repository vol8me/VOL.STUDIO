import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.VOL_ARACHNID_E2E_PORT ?? 5179);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * Gerçek tarayıcı kapısı.
 *
 * Birim testler Phaser'ın görüntü ağacını bir İKİZLE sürüyor; ikiz dönüşüm
 * matematiğinin bir kısmını kendi uygular ve tam da bu yüzden üretim koduna
 * fazla yakındır. İkisi birlikte yanlış olabilir ve hiçbir test bunu görmez.
 *
 * Buradaki kapı dar ve pahalı olmayan bir şeyi kanıtlar: oyun gerçek bir
 * tarayıcıda, gerçek Phaser ile açılıyor, 72 rig dokusunun HEPSİ yayımlanan
 * statik yollardan yükleniyor ve konsola hata düşmüyor. Asset'lerin bu paketin
 * sahipliğine taşınmasının uçtan uca kanıtı budur — yol, taban URL ve statik
 * sunum ancak burada birlikte sınanır.
 *
 * `preview` sunucusu kullanılır, `dev` değil: sınanan şey GÖNDERİLEN build'dir.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: { baseURL: BASE_URL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // `--host 127.0.0.1` AÇIKÇA verilir: varsayılan bağlama `localhost`tur ve
    // IPv6 önceliği olan bir makinede yalnız `::1`e oturur; Playwright'ın
    // `127.0.0.1` yoklaması hiç cevap alamaz ve sunucu "başlamadı" sayılır.
    command: `pnpm exec vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: BASE_URL,
    name: 'VOL.ARACHNID preview sunucusu',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
