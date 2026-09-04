import type { Page } from '@playwright/test';

/**
 * Showcase'i ekran görüntüsü alınabilir hâle getiren DONDURMA katmanı.
 *
 * Görsel regresyonun bilinen ölüm sebebi kararsızlıktır: kapı gerçek bir
 * gerileme göstermeden kırılırsa ekip onu görmezden gelmeye başlar ve kapı
 * fiilen ölür. O yüzden buradaki iş "ekran görüntüsü al"maktan çok, görüntünün
 * ALINABİLİR olmasını sağlamaktır.
 *
 * Dondurma ÜRETİM kodunda değil, burada yaşar. Showcase'e bir `?seed=` kancası
 * açmak, yalnızca test için var olan bir dalı gönderilen koda sokardı; üstelik
 * kaynağı sonradan eklenen bir rastgeleliği kapsamazdı. `addInitScript` sayfa
 * betiklerinden ÖNCE koştuğu için kapsam otomatiktir: showcase hangi API'yi
 * çağırırsa çağırsın dondurulmuş olanı bulur.
 */

/** Sayfada koşan dondurma betiği — sayfa betiklerinden önce çalışır. */
function freezeEnvironment(seed: number): void {
  // mulberry32: 32 bitlik durum, hızlı ve ARDIŞIK koşularda birebir aynı dizi.
  let state = seed >>> 0;
  Math.random = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /*
   * Sabit an: 2026-01-01T00:00:00Z. Değeri önemli değil, DEĞİŞMEZ olması önemli
   * — showcase bir yerde tarih basıyor (`advancedTab` olay günlüğü) ve gerçek
   * saat her koşuda farklı piksel üretirdi.
   */
  const FIXED_EPOCH = Date.UTC(2026, 0, 1);
  const RealDate = Date;

  /*
   * Argümansız `new Date()` donar; argümanlı biçimler (ayrıştırma, bileşenden
   * kurma) DOKUNULMAZ — dondurma "şu an"ı sabitler, tarih aritmetiğini bozmaz.
   * Miras kullanılır: `prototype`a elle atama hem salt-okunurdur hem de
   * `instanceof` zincirini elle kurmayı gerektirirdi.
   */
  class FrozenDate extends RealDate {
    /*
     * `unknown[]` + tek elemanlı cast bilinçli: `Date`in aşırı yüklenmiş
     * kurucusunun tip düzeyinde tek bir imzası yoktur, ama çalışma zamanında
     * yayılım (`...`) argümanların hepsini olduğu gibi geçirir. Cast yalnızca
     * derleyiciyi susturur, davranışı değiştirmez.
     */
    constructor(...args: unknown[]) {
      if (args.length === 0) super(FIXED_EPOCH);
      else super(...(args as [number]));
    }

    static override now(): number {
      return FIXED_EPOCH;
    }
  }

  // `DateConstructor` `new`siz çağrıyı da (`Date()` → string) kapsar; bir sınıf
  // o imzayı sağlayamaz. Showcase o biçimi kullanmıyor.
  globalThis.Date = FrozenDate as unknown as DateConstructor;

  /*
   * SAAT VE rAF DAMGASI BİRLİKTE DONAR — biri olmadan diğeri daha kötüdür.
   *
   * `performance.now` tek başına dondurulduğunda CORE'un `animateValue`ı şöyle
   * davranıyordu: başlangıcı `performance.now()`tan (0) okuyor, ilerlemeyi rAF
   * damgasından (gerçek, sayfa açılışından beri geçen süre) okuyor. Aradaki
   * fark ilk karede doğrudan `elapsed` oluyor ve animasyon, sayfanın ne kadar
   * hızlı yüklendiğine bağlı RASTGELE bir ilerlemeye sıçrıyordu. Hiç
   * dondurulmamış hâli en azından tutarlıydı.
   *
   * Spec'e göre rAF damgası ile `performance.now` AYNI zaman kaynağıdır; o
   * yüzden ikisi ayrı dondurulamaz. Sabit değerde animasyonlar ilk karelerinde
   * durur — CSS geçişleri için `STILL_CSS`in yaptığının JS karşılığı.
   */
  Object.defineProperty(performance, 'now', { value: () => 0, configurable: true });

  const realRaf = globalThis.requestAnimationFrame.bind(globalThis);
  globalThis.requestAnimationFrame = (callback: FrameRequestCallback): number =>
    realRaf(() => callback(0));
}

/** Hareketi durduran stil — animasyon, geçiş ve kaydırma yumuşatması. */
const STILL_CSS = `
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  scroll-behavior: auto !important;
  caret-color: transparent !important;
}`;

export const SHOWCASE_TABS = [
  'buttons',
  'text',
  'panels',
  'hud',
  'cards',
  'forms',
  'workbench',
  'palette',
  'advanced',
  'scroll',
  'touch',
  'loading',
] as const;

export type ShowcaseTab = (typeof SHOWCASE_TABS)[number];

/** Sayfayı dondurulmuş bir ortamda açar ve yerleşimin oturmasını bekler. */
export async function openShowcase(page: Page, seed = 20260101): Promise<void> {
  await page.addInitScript(freezeEnvironment, seed);
  await page.goto('/');
  await page.addStyleTag({ content: STILL_CSS });

  // Yazı tipleri geç yüklenirse metin bir kare fallback ile çizilir ve ekran
  // görüntüsü koşudan koşuya kayar.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForSelector('[role="tablist"]');
}

/** Sekmeyi seçer ve panelinin görünür olmasını bekler. */
export async function selectTab(page: Page, tab: ShowcaseTab): Promise<void> {
  // Etiketle DEĞİL kimlikle seçilir: etiketler i18n'den gelir ve dil değişince
  // testin tamamı kırılırdı. `Tabs` kimliği örnek başına türettiği için
  // sabit önek yerine sonek eşleşmesi kullanılır.
  await page.locator(`[role="tab"][id$="-tab-${tab}"]`).click();
  await page.locator(`[role="tabpanel"][id$="-panel-${tab}"]:not([aria-hidden="true"])`).waitFor();
}

/**
 * Telefon koşulu — cihaz taklidi DEĞİL, ölçülecek iki özelliğin kendisi.
 *
 * `devices['Pixel 5']` gibi hazır bir tanım `defaultBrowserType` de taşır ve
 * bir `describe` içinde kullanılamaz. Ama kapının ihtiyacı zaten bir marka
 * değil: DAR bir görüntü alanı ve KABA bir işaretçi. İkisini açıkça yazmak
 * neyin sınandığını da görünür kılar.
 *
 * `deviceScaleFactor` 1'de tutulur: yerleşim CSS pikseliyle ölçülür ve yüksek
 * yoğunluk yalnızca görüntüyü büyütüp karşılaştırmayı makineye bağlardı.
 */
export const PHONE_VIEWPORT = {
  viewport: { width: 393, height: 851 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
} as const;
