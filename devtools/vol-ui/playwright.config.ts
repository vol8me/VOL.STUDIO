import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.VOL_UI_E2E_PORT ?? 5181);
const BASE_URL = `http://127.0.0.1:${PORT}`;

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
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  reporter: [['list']],
  timeout: 60_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      /*
       * SIFIR TOLERANS, ölçümle: `determinism.spec.ts` on iki sekmenin ayrı
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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
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
