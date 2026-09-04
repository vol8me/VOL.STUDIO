import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.VOL_UI_E2E_PORT ?? 5181);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * Görsel sözleşme kapısı.
 *
 * vol-ui, CORE'un DOM bileşen kütüphanesinin showcase'idir; yani CORE'un
 * GÖRSEL sözleşmesi burada yaşar. Birim testler yapıyı doğruluyor (sınıf adı,
 * ARIA, olay bağlama) ama hiçbiri bileşenin doğru GÖRÜNDÜĞÜNÜ görmez: bir
 * token'ın silinmesi, bir `flex` yönünün ters dönmesi ya da bir panelin
 * taşması bütün birim testler yeşilken gönderilebilir.
 *
 * Kapı iki katmanlıdır ve ikisi ayrı şeyleri yakalar:
 *   - `layout.spec.ts`  — GEOMETRİ iddiaları. Taşma, örtüşme, dokunma hedefi.
 *     Kırıldığında NEDEN kırıldığını söyler.
 *   - `visual.spec.ts`  — piksel temeli. "Bir şey değişti"yi yakalar, sebebini
 *     söylemez; geometrinin ifade edemediği her şeyi (renk, kenarlık, gölge,
 *     yazı tipi) tek başına o korur.
 *
 * `determinism.spec.ts` ise kapının KENDİSİNİ sınar: dondurma katmanı
 * çalışmazsa piksel temeli gerçek gerileme olmadan kırılır, ekip onu
 * görmezden gelmeye başlar ve kapı fiilen ölür.
 *
 * `preview` kullanılır, `dev` değil: sınanan şey GÖNDERİLEN build'dir.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list']],
  timeout: 60_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      /*
       * SIFIR TOLERANS — tahminle değil ÖLÇÜMLE.
       *
       * İlk hâli savunmacı bir `maxDiffPixelRatio: 0.002` idi. Gerçek bir
       * gerilemeyle sınandığında yanlış çıktı: metin renginin ~%5 kayması
       * on iki sekmenin yalnız BİRİNDE yakalanıyordu — kapı açık görünüp
       * fiilen kördü.
       *
       * `determinism.spec.ts` on iki sekmenin AYRI yüklemelerde birebir aynı
       * çizildiğini ölçtüğü için gevşetmeye gerek yok: gürültü sıfırsa tolerans
       * da sıfır olabilir. Bu ayarla aynı renk kayması 12/12 yakalanıyor,
       * temiz koşu ise hâlâ tertemiz geçiyor.
       *
       * `threshold` piksel BAŞINA renk toleransıdır ve asıl körlük oradaydı;
       * varsayılan 0.2, koyu üstüne koyu değişimleri yutuyordu.
       *
       * Bu sıkılık yerel kapılar için doğrudur (AGENTS.md Kural 8: bulut CI
       * yoktur). Temeller `-chromium-linux` ekiyle makine ailesine bağlıdır;
       * farklı bir yazı tipi kümesi fark üretirse çözüm toleransı açmak değil,
       * temeli o makinede yenilemektir.
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
    // Ekran görüntüsü kapısı için görüntü alanı SÖZLEŞMEDİR: değişirse bütün
    // temeller kayar. Cihaz ölçeği 1'e sabitlenir — HiDPI bir makinede
    // varsayılan 2 olur ve temeller makineden makineye taşınamaz hâle gelir.
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // `--host 127.0.0.1` AÇIKÇA verilir: varsayılan bağlama `localhost`tur ve
    // IPv6 önceliği olan bir makinede yalnız `::1`e oturur; Playwright'ın
    // `127.0.0.1` yoklaması cevap alamaz ve sunucu "başlamadı" sayılır.
    command: `pnpm exec vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: BASE_URL,
    name: 'VOL.UI preview sunucusu',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
