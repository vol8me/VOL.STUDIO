import { FrameRateSampler } from '../../time/FrameRateSampler';
import { i18next } from '../../systems/I18n';

export type FpsMeterPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface FpsMeterOptions {
  /** Ekran köşesi; varsayılan sağ üst. */
  position?: FpsMeterPosition;
  /** Ek CSS class'ı. */
  className?: string;
  /** Altında sarı gösterilecek eşik. */
  warnFps?: number;
  /** Altında kırmızı gösterilecek eşik. */
  dangerFps?: number;
  /**
   * Metnin yenilenme aralığı (ms).
   *
   * Her karede yazmak sayıyı okunamaz hale getirir: 60 ile 59 arasında salınan
   * bir rakam gözle takip edilemez. Ölçüm her kare sürer, GÖSTERİM seyrelir.
   */
  refreshMs?: number;
}

const DEFAULT_WARN_FPS = 45;
const DEFAULT_DANGER_FPS = 30;
const DEFAULT_REFRESH_MS = 250;

/**
 * Yalnız FPS gösteren HUD göstergesi.
 *
 * `Diagnostics` DEĞİLDİR: kare min/max'ı, render/update sürelerini, sahne
 * adını ya da renderer bilgisini göstermez. Onlar bir teşhis panelinin işidir;
 * bu bileşen ürünün üstünde sürekli durabilen tek bir sayıdır.
 *
 * Ölçüm `Diagnostics` ile AYNI örnekleyiciden gelir (`FrameRateSampler`); iki
 * ayrı FPS hesabı aynı anda farklı sayı gösterirse hangisinin doğru olduğu
 * sorusunun cevabı olmaz.
 *
 * **Tek örnek varsayımıyla tasarlandı.** Dört köşeye dört metre koymak
 * desteklenen bir kullanım değildir; konum, göstergenin oyunun kendi HUD'unu
 * kapatmadığı köşeyi seçmek içindir.
 */
export class FpsMeter {
  readonly element: HTMLDivElement;
  private readonly sampler = new FrameRateSampler();
  private readonly warnFps: number;
  private readonly dangerFps: number;
  private readonly refreshMs: number;
  private position: FpsMeterPosition;
  private frameHandle?: number;
  private lastRenderMs = 0;
  /** Son yazılan değer; `NaN` = hiç yazılmadı, `-1` = ölçülmedi. */
  private lastShownFps = Number.NaN;
  private readonly onLanguageChanged = (): void => {
    // Etiket de çevrilir: yalnız metni yenilemek, ekran okuyucuyu ESKİ dilde
    // bırakırdı.
    this.element.setAttribute('aria-label', i18next.t('core:fpsMeter.ariaLabel'));
    this.lastShownFps = Number.NaN;
    this.render();
  };
  private readonly onVisibilityChange = (): void => {
    /*
     * Arka planda rAF durur; dönüşte aradaki boşluk bir kare aralığı DEĞİLDİR
     * ve pencereye girerse gösterge saniyelerce yanlış düşük kalır.
     */
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      this.sampler.markBaseline(performance.now());
    }
  };

  constructor(options: FpsMeterOptions = {}) {
    this.position = options.position ?? 'top-right';
    this.warnFps = options.warnFps ?? DEFAULT_WARN_FPS;
    this.dangerFps = options.dangerFps ?? DEFAULT_DANGER_FPS;
    this.refreshMs = Math.max(0, options.refreshMs ?? DEFAULT_REFRESH_MS);

    this.element = document.createElement('div');
    this.element.className = ['vol-fps-meter', options.className].filter(Boolean).join(' ');
    this.element.dataset.position = this.position;
    this.element.setAttribute('role', 'status');
    /*
     * Bölge okunabilir kalır ama DEĞİŞİMİ duyurulmaz: saniyede dört kez
     * "60 FPS" seslendiren bir gösterge ekran okuyucu kullanıcısı için
     * gürültüdür. `role="status"` varsayılan olarak `polite` duyurur; bu
     * yüzden açıkça kapatılır.
     */
    this.element.setAttribute('aria-live', 'off');
    this.element.setAttribute('aria-label', i18next.t('core:fpsMeter.ariaLabel'));
    this.render();

    i18next.on('languageChanged', this.onLanguageChanged);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
    this.scheduleFrame();
  }

  /** Göstergeyi başka bir köşeye taşır. */
  setPosition(position: FpsMeterPosition): void {
    this.position = position;
    this.element.dataset.position = position;
  }

  /** Son ölçülen FPS — test ve ölçüm için. */
  getFps(): number {
    return this.sampler.fps;
  }

  destroy(): void {
    if (this.frameHandle !== undefined) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = undefined;
    i18next.off('languageChanged', this.onLanguageChanged);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
    this.element.remove();
  }

  private scheduleFrame(): void {
    if (typeof requestAnimationFrame !== 'function') return;
    this.frameHandle = requestAnimationFrame((now) => {
      this.sampler.sample(now);
      if (now - this.lastRenderMs >= this.refreshMs) {
        this.lastRenderMs = now;
        this.render();
      }
      this.scheduleFrame();
    });
  }

  /**
   * SIFIR BİR ÖLÇÜM DEĞİLDİR. Örnek gelmeden — ve saatin durduğu ortamlarda,
   * ör. görsel regresyon koşusunda — kırmızı "0 FPS" yazmak var olmayan bir
   * sorunu bildirmek olurdu. O durumda gösterge nötr kalır ve tire yazar.
   */
  private render(): void {
    const fps = this.sampler.fps;
    const rounded = fps > 0 ? Math.round(fps) : -1;
    if (rounded === this.lastShownFps) return;
    this.lastShownFps = rounded;

    this.element.textContent = i18next.t('core:fpsMeter.value', {
      fps: rounded < 0 ? '—' : rounded,
    });
    this.element.dataset.level =
      rounded < 0
        ? 'normal'
        : rounded < this.dangerFps
        ? 'danger'
        : rounded < this.warnFps
        ? 'warn'
        : 'normal';
  }
}
