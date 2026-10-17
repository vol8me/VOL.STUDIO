import { defineConfig, devices } from '@playwright/test';
import { availableParallelism } from 'node:os';

const PORT = Number(process.env.VOL_UI_E2E_PORT ?? 5181);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/** Motor başına işçi; iki motor birlikte koşar. 8 çekirdekte 2 işçi kararlı, 3 işçi zaman aşımı üretti. */
const WORKERS = Math.min(2, Math.max(1, Math.floor(availableParallelism() / 4)));

/**
 * `scripts/e2e.mjs` her motoru kendi sunucusunda eşzamanlı koşar; sunucular
 * çakışmasın diye her motorun portu burada bildirilir (`devPorts` bekçisi bu
 * dosyadaki `_E2E_PORT ?? n` bildirimlerini okur).
 */
export const ENGINE_PORTS = {
  chromium: PORT,
  webkit: Number(process.env.VOL_UI_WEBKIT_E2E_PORT ?? 5182),
};

/**
 * Zamanlama ÖLÇEN ve süre sınırı koyan sınamalar (girdi→görünür gecikme, meşgul durum, flaş sınırı, maliyet raporu,
 * prob kalibrasyonu). Eşzamanlı yükte (iki motor, motor başına işçi) ölçümleri yük taşır ve düşer; bu yüzden
 * `scripts/e2e.mjs` önce geri kalan her şeyi eşzamanlı koşar, bunları ayrı bir SESSİZ şeritte, motor motor ve tek
 * işçiyle koşar. `VOL_UI_E2E_LANE` verilmezse (tek dosya, ad hoc koşu) hepsi tek şeritte koşar.
 * Yeni bir sınama zamanı SINIRLIYORSA buraya girer; `e2eConfig.test.mjs` adların gerçek dosya olduğunu sınar.
 */
export const QUIET_SPECS = [
  'busyFeedback',
  'latency',
  'motionMeasure',
  'performance',
  'probe',
  'responseSlice',
] as const;
const quietPattern = new RegExp(String.raw`[\\/](${QUIET_SPECS.join('|')})\.spec\.ts$`);
const lane = process.env.VOL_UI_E2E_LANE;
/**
 * Ana şeridin dışlaması. Proje düzeyindeki `testIgnore` üst düzeydekini EZER (birleşmez), bu yüzden kendi
 * `testIgnore`'u olan her proje bu listeyi AÇIKÇA katar; yoksa o projede sessiz spec'ler ana şeritte de koşar.
 */
const laneIgnore = lane === 'main' ? [quietPattern] : [];

/**
 * CORE'un GÖRSEL sözleşme kapısı. Birim testler yapıyı doğrular ama bileşenin
 * doğru GÖRÜNDÜĞÜNÜ görmez: silinen bir token ya da ters dönen bir `flex`
 * hepsi yeşilken gönderilebilir.
 *
 * `layout.spec.ts` geometriyi iddia eder (neden kırıldığını söyler),
 * `visual.spec.ts` piksel temeli tutar (sebebini söylemez ama renk/gölge/yazı
 * tipini o korur), `determinism.spec.ts` ise kapının KENDİSİNİ sınar.
 *
 * `preview` kullanılır, `dev` değil: sınanan şey GÖNDERİLEN build'dir.
 */
export default defineConfig({
  testDir: './tests/e2e',
  // Eşzamanlı motor/şerit süreçleri kendi çıktısını temizler. Çalıştırıcı her
  // sürece benzersiz dizin verir; doğrudan Playwright çağrıları eski yolu korur.
  outputDir: process.env.VOL_UI_E2E_OUTPUT_DIR ?? './test-results',
  ...(laneIgnore.length > 0 ? { testIgnore: laneIgnore } : {}),
  ...(lane === 'quiet' ? { testMatch: quietPattern } : {}),
  fullyParallel: false,
  workers: WORKERS,
  forbidOnly: true,
  reporter: process.env.VOL_UI_E2E_REPORT_FILE
    ? [
        ['list'],
        ['../../scripts/quality/countsReporter.mjs', { scope: 'vol-showcase' }],
        ['json', { outputFile: process.env.VOL_UI_E2E_REPORT_FILE }],
      ]
    : [['list'], ['../../scripts/quality/countsReporter.mjs', { scope: 'vol-showcase' }]],
  timeout: 60_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      /*
       * SIFIR TOLERANS, ölçümle: `determinism.spec.ts` her sekmenin ayrı
       * yüklemelerde birebir aynı çizildiğini gösteriyor, gürültü sıfırsa
       * tolerans da sıfır olabilir. Savunmacı bir `maxDiffPixelRatio: 0.002`
       * ile aynı renk kayması 12 sekmenin yalnız BİRİNDE yakalanıyordu.
       *
       * `threshold` piksel BAŞINA toleranstır; asıl körlük oradaydı (varsayılan
       * 0.2 koyu üstüne koyu değişimi yutuyordu).
       *
       * Temeller `-chromium-linux` ekiyle makine ailesine bağlıdır: fark
       * çıkarsa çözüm toleransı açmak değil, temeli o makinede yenilemektir.
       */
      threshold: 0,
      maxDiffPixelRatio: 0,
      animations: 'disabled',
      scale: 'css',
    },
  },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    // Görüntü alanı SÖZLEŞMEDİR: değişirse bütün temeller kayar. Cihaz ölçeği
    // 1'e sabit — HiDPI'da varsayılan 2 olur ve temeller taşınamaz hâle gelir.
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], deviceScaleFactor: 1 },
      // Piksel temeli yalnız Chromium'dadır; WebKit temeli bilinçli olarak ayrıca
      // kalibre edilmeden kurulmaz ve otomatik güncellemeyle saklanmaz.
      testIgnore: [/visual\.spec\.ts/, ...laneIgnore],
    },
  ],
  webServer: {
    // `--host 127.0.0.1` AÇIKÇA: varsayılan `localhost` IPv6 öncelikli bir
    // makinede yalnız `::1`e oturur ve yoklama cevap alamaz.
    command: `pnpm exec vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: BASE_URL,
    name: 'VOL.UI preview sunucusu',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
