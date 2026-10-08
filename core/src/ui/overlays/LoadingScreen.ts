import { i18next } from '../../i18n/I18n';
import { Button } from '../primitives/Button';
import { buildLoadingEmblem } from './loadingEmblems';

/** Gösterge tipi — orbital-rings, energy-core, particle-orbit, hexagon-pulse veya bar. */
export type LoadingIndicatorType =
  'orbital-rings' | 'energy-core' | 'particle-orbit' | 'hexagon-pulse' | 'bar';

/** Arkaplan tipi — image, video veya CSS gradient (varsayılan). */
export type LoadingBackgroundType = 'image' | 'video' | 'css';

/** Geçiş efekti tipi. */
export type LoadingTransitionType = 'fade' | 'slide' | 'zoom';

/** İçerik (gösterge + yazı) konumu. */
export type LoadingContentPosition =
  'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const CONTENT_POSITION_MAP: Record<LoadingContentPosition, { align: string; justify: string }> = {
  center: { align: 'center', justify: 'center' },
  'top-left': { align: 'flex-start', justify: 'flex-start' },
  'top-right': { align: 'flex-start', justify: 'flex-end' },
  'bottom-left': { align: 'flex-end', justify: 'flex-start' },
  'bottom-right': { align: 'flex-end', justify: 'flex-end' },
};

export interface LoadingIndicatorOptions {
  type?: LoadingIndicatorType;
  /** Gösterge rengi — CSS custom property veya hex. Varsayılan: --vol-ui-accent-solid. */
  color?: string;
  /** Gösterge boyutu (px). Varsayılan: 120. */
  size?: number;
  /** Özel gösterge — type göz ardı edilir, verilen element doğrudan gösterge alanına yerleştirilir. */
  customElement?: HTMLElement;
}

export interface LoadingFontSizeOptions {
  /** Başlık font boyutu (px). Varsayılan: 24. */
  title?: number;
  /** Alt başlık font boyutu (px). Varsayılan: 14. */
  subtitle?: number;
  /** Yüzde metni font boyutu (px). Varsayılan: 16. */
  percent?: number;
}

export interface LoadingScreenOptions {
  /** Min. gösterim süresi (ms): çok kısa yüklemede ekranın yanıp sönmesini önler (öneri: 500). Varsayılan: 0 (kapalı). */
  minDisplayMs?: number;

  /** Arkaplan. Varsayılan: CSS gradient. */
  background?: { type: 'image'; src: string } | { type: 'video'; src: string } | { type: 'css' };

  /** Arkaplan rengi — CSS custom property veya hex. CSS gradient modunda kullanılır. Varsayılan: --vol-ui-bg. */
  backgroundColor?: string;

  /** Gösterge. Varsayılan: orbital-rings. */
  indicator?: LoadingIndicatorOptions;

  /** Başlık metni (opsiyonel). */
  title?: string;
  /** Alt başlık / ipucu metni (opsiyonel). */
  subtitle?: string;
  /** Yüzde gösterimi. Varsayılan: false. */
  showPercent?: boolean;

  /** Font boyutları (px). */
  fontSize?: LoadingFontSizeOptions;

  /** İçerik konumu. Varsayılan: center. */
  contentPosition?: LoadingContentPosition;

  /** Scrim (karartma) rengi — image/video modunda overlay. Varsayılan: --vol-ui-scrim. */
  scrimColor?: string;

  /** z-index. Varsayılan: 100. */
  zIndex?: number;

  /** Ek CSS class'ı — kullanıcı kendi CSS'ini geçersiz kılmak için. */
  className?: string;

  /** Geçiş süresi (ms). Varsayılan: 400. */
  transitionMs?: number;
  /** Geçiş efekti. Varsayılan: fade. */
  transitionType?: LoadingTransitionType;

  /** Progress animasyon süresi (ms). update() çağrısında değerin yumuşak geçiş hızı. Varsayılan: 300. */
  progressMs?: number;

  /** Hide animasyonu tamamlandığında çağrılır. */
  onComplete?: () => void;

  /** Başlangıç aşaması metni ("Varlıklar yükleniyor 3 / 8"); `setStage` ile güncellenir ve okuyucuya duyulur. */
  stage?: string;
  /** Yükleme boyunca dönen ipuçları; `tipIntervalMs` aralığıyla değişir. */
  tips?: readonly string[];
  /** İpucu değişim aralığı (ms). Varsayılan 6000. */
  tipIntervalMs?: number;
  /**
   * Gösterimden ÖNCE beklenen süre (ms): yükleme bundan kısa sürerse ekran hiç görünmez (yanıp sönme yok);
   * asgari gösterim süresi görünür olduktan sonra ölçülür. Varsayılan 0 (kapalı), öneri 150.
   */
  showDelayMs?: number;
  /** İlerleme bu süre boyunca değişmezse "beklenenden uzun sürüyor" bildirilir (ms; 0 kapatır). Varsayılan 15000. */
  stallMs?: number;
  /** Takılma bildirimi metni; verilmezse yerelleştirilmiş varsayılan. */
  stallMessage?: string;
  /** İlerleme `stallMs` boyunca durduğunda bir kez çağrılır (ilerleyince yeniden silahlanır). */
  onStall?: () => void;
  /**
   * Görünürken arkadaki sayfayı etkileşime kapatır (`inert`): odak, Tab, kol gezintisi ve okuyucu yükleme
   * ekranının arkasına ulaşamaz. Kapanınca önceki odak geri verilir. Varsayılan true.
   */
  blockBackground?: boolean;
}

export interface LoadingFailure {
  /** Hata metni; verilmezse yerelleştirilmiş "Yükleme başarısız". */
  message?: string;
  /** Verilirse "Tekrar dene" düğmesi çıkar; basınca hata temizlenir, ilerleme sıfırlanır, bu çağrılır. */
  onRetry?: () => void;
  /** Verilirse "Vazgeç" düğmesi çıkar; karar (kapat/geri dön) tüketicidedir, ekran kendini gizlemez. */
  onCancel?: () => void;
}

/**
 * Tam ekran yükleme ekranı — saf DOM + TypeScript.
 *
 * Özellikler:
 * - Beş gösterge tipi: orbital-rings, energy-core, particle-orbit, hexagon-pulse, bar
 * - Arkaplan: image, video veya CSS gradient
 * - Min. gösterim süresi garantisi
 * - Geçiş efektleri: fade, slide, zoom
 * - Tüm alanlar opsiyonel — sadece gösterge zorunlu (varsayılan: orbital-rings)
 */
export class LoadingScreen {
  readonly element: HTMLDivElement;
  private readonly contentEl: HTMLDivElement;
  private readonly indicatorEl: HTMLDivElement;
  private readonly percentEl: HTMLDivElement | null = null;
  private readonly backgroundEl: HTMLDivElement;
  private backgroundMedia?: HTMLImageElement | HTMLVideoElement;

  private readonly minDisplayMs: number;
  private readonly transitionMs: number;
  private readonly progressDurationMs: number;
  private readonly onComplete?: () => void;
  private hideCompleted = false;
  private readonly progressEl: HTMLDivElement;
  private readonly stageEl: HTMLDivElement;
  private readonly tipEl: HTMLDivElement | null = null;
  private readonly stallEl: HTMLDivElement;
  private readonly tips: readonly string[];
  private readonly tipIntervalMs: number;
  private readonly showDelayMs: number;
  private readonly stallMs: number;
  private readonly stallMessageOverride?: string;
  private readonly onStallHandler?: () => void;
  private readonly blockBackground: boolean;
  private tipIndex = 0;
  private tipTimer: ReturnType<typeof setInterval> | null = null;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;
  private showDelayTimer: ReturnType<typeof setTimeout> | null = null;
  private stalled = false;
  private determinate = false;
  private lastTarget = -1;
  private lastShownPercent = -1;
  private blockedSiblings: HTMLElement[] = [];
  private restoreFocusTo: HTMLElement | null = null;
  private titleIsI18n = false;
  private headingIsI18n = false;
  private headingEl: HTMLElement | null = null;
  private failureEl: HTMLDivElement | null = null;
  private failureButtons: Button[] = [];
  private failure: LoadingFailure | null = null;

  private showTime = 0;
  private animatedPercent = 0;
  private hideRequested = false;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private transitionTimer: ReturnType<typeof setTimeout> | null = null;
  private progressRafId = 0;
  private showRafId = 0;
  private progressFrom = 0;
  private progressStart = 0;
  private progressTarget = 0;

  constructor(options: LoadingScreenOptions = {}) {
    const {
      minDisplayMs = 0,
      transitionMs = 400,
      transitionType = 'fade',
      progressMs = 300,
      onComplete,
    } = options;

    this.tips = options.tips ?? [];
    this.tipIntervalMs = options.tipIntervalMs ?? 6000;
    this.showDelayMs = options.showDelayMs ?? 0;
    this.stallMs = options.stallMs ?? 15000;
    this.stallMessageOverride = options.stallMessage;
    this.onStallHandler = options.onStall;
    this.blockBackground = options.blockBackground ?? true;
    this.minDisplayMs = minDisplayMs;
    this.transitionMs = transitionMs;
    this.progressDurationMs = progressMs;
    this.onComplete = onComplete;

    this.element = document.createElement('div');
    this.element.className = 'vol-loading';
    this.element.classList.add(`vol-loading--${transitionType}`);
    this.element.style.setProperty('--vol-loading-transition', `${transitionMs}ms`);
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');
    this.element.setAttribute('aria-busy', 'true');
    if (options.title) {
      this.element.setAttribute('aria-label', options.title);
    }

    // z-index
    this.element.style.zIndex = String(options.zIndex ?? 100);

    // Ek class
    if (options.className) {
      this.element.classList.add(options.className);
    }

    // Arkaplan rengi (CSS gradient modunda)
    if (options.backgroundColor) {
      this.element.style.setProperty('--vol-loading-bg', options.backgroundColor);
    }

    // Scrim rengi
    if (options.scrimColor) {
      this.element.style.setProperty('--vol-loading-scrim', options.scrimColor);
    }

    // Font boyutları
    const fontSize = options.fontSize;
    if (fontSize?.title) {
      this.element.style.setProperty('--vol-loading-title-size', `${fontSize.title}px`);
    }
    if (fontSize?.subtitle) {
      this.element.style.setProperty('--vol-loading-subtitle-size', `${fontSize.subtitle}px`);
    }
    if (fontSize?.percent) {
      this.element.style.setProperty('--vol-loading-percent-size', `${fontSize.percent}px`);
    }

    // İçerik konumu
    const pos = CONTENT_POSITION_MAP[options.contentPosition ?? 'center'];
    this.element.style.alignItems = pos.align;
    this.element.style.justifyContent = pos.justify;
    if (options.contentPosition && options.contentPosition !== 'center') {
      this.element.style.padding = '2rem';
    }

    // Arkaplan
    this.backgroundEl = document.createElement('div');
    this.backgroundEl.className = 'vol-loading__background';
    this.applyBackground(options.background);
    this.element.appendChild(this.backgroundEl);

    // İçerik: çerçeveli çelik plaka (başlık şeridi + gövde).
    this.contentEl = document.createElement('div');
    this.contentEl.className = 'vol-loading__content vol-frame';

    const header = document.createElement('div');
    header.className = 'vol-frame__header vol-loading__header';
    const heading = document.createElement('span');
    heading.className = options.title ? 'vol-loading__title' : 'vol-loading__heading';
    heading.textContent = options.title ?? i18next.t('core:loading.title');
    this.headingIsI18n = !options.title;
    this.headingEl = heading;
    header.appendChild(heading);
    // Yüzde yalnız istenirse; okuyucudan gizli (ilerleme `progressbar` ile hedef değerle duyulur).
    if (options.showPercent) {
      this.percentEl = document.createElement('div');
      this.percentEl.className = 'vol-loading__percent';
      this.percentEl.setAttribute('aria-hidden', 'true');
      this.percentEl.textContent = '0%';
      header.appendChild(this.percentEl);
    }
    this.contentEl.appendChild(header);

    const body = document.createElement('div');
    body.className = 'vol-loading__body';
    this.contentEl.appendChild(body);

    // Gösterge: süs (halkalar vb.) ya da yalnız çubuk; ilerleme semantiği burada.
    this.indicatorEl = document.createElement('div');
    this.indicatorEl.className = 'vol-loading__indicator';
    this.indicatorEl.setAttribute('role', 'progressbar');
    this.indicatorEl.setAttribute('aria-valuemin', '0');
    this.indicatorEl.setAttribute('aria-valuemax', '100');
    this.indicatorEl.setAttribute(
      'aria-label',
      options.title ?? i18next.t('core:loading.progress'),
    );
    this.titleIsI18n = !options.title;
    this.applyIndicator(options.indicator);
    body.appendChild(this.indicatorEl);

    // Segmentli ilerleme çubuğu (çekirdek HUD barı malzemesi); belirsiz başlar, ilk `update` ile kesinleşir.
    this.progressEl = document.createElement('div');
    this.progressEl.className = 'vol-bar vol-loading__progress';
    const fill = document.createElement('div');
    fill.className = 'vol-bar__fill vol-loading__fill vol-loading__fill--indeterminate';
    this.progressEl.appendChild(fill);
    body.appendChild(this.progressEl);

    this.stageEl = document.createElement('div');
    this.stageEl.className = 'vol-loading__stage';
    this.stageEl.textContent = options.stage ?? '';
    body.appendChild(this.stageEl);

    if (options.subtitle) {
      const subtitleEl = document.createElement('div');
      subtitleEl.className = 'vol-loading__subtitle';
      subtitleEl.textContent = options.subtitle;
      body.appendChild(subtitleEl);
    }

    this.stallEl = document.createElement('div');
    this.stallEl.className = 'vol-loading__stall';
    this.stallEl.hidden = true;
    body.appendChild(this.stallEl);

    if (this.tips.length > 0) {
      this.tipEl = document.createElement('div');
      this.tipEl.className = 'vol-loading__tip';
      this.tipEl.setAttribute('aria-hidden', 'true');
      this.tipIndex = Math.floor(Math.random() * this.tips.length);
      this.renderTip();
      body.appendChild(this.tipEl);
    }

    this.element.appendChild(this.contentEl);
    i18next.on('languageChanged', this.onLanguageChanged);
  }

  private readonly onLanguageChanged = (): void => {
    if (this.titleIsI18n) {
      this.indicatorEl.setAttribute('aria-label', i18next.t('core:loading.progress'));
    }
    if (this.headingIsI18n && this.headingEl) {
      this.headingEl.textContent = i18next.t('core:loading.title');
    }
    if (this.stalled) this.stallEl.textContent = this.stallText();
    if (this.failure) this.renderFailure();
  };

  /**
   * Yüklemeyi başarısız gösterir: ilerleme durur, hata `role="alert"` ile okunur, verilen eylemlere göre
   * "Tekrar dene"/"Vazgeç" düğmeleri çıkar ve odak ilk düğmeye gider. Bekleyen gizleme iptal olur.
   */
  fail(failure: LoadingFailure = {}): void {
    if (this.hideCompleted) return;
    this.hideRequested = false;
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    cancelAnimationFrame(this.progressRafId);
    this.failure = failure;
    this.armStall();
    this.stopTips();
    this.element.setAttribute('aria-busy', 'false');
    this.element.classList.add('vol-loading--failed');
    this.renderFailure();
    this.failureButtons[0]?.element.focus();
  }

  /** Başarısızlık görünümünü kaldırır (yeniden denemede kendiliğinden çağrılır). */
  clearFailure(): void {
    if (!this.failure) return;
    this.failure = null;
    this.disposeFailureUi();
    this.element.classList.remove('vol-loading--failed');
    this.element.setAttribute('aria-busy', 'true');
  }

  private renderFailure(): void {
    const failure = this.failure;
    if (!failure) return;
    const hadFocus = this.failureEl?.contains(document.activeElement) ?? false;
    const focusedIndex = this.failureButtons.findIndex((b) => b.element === document.activeElement);
    this.disposeFailureUi();

    const box = document.createElement('div');
    box.className = 'vol-loading__failure';
    box.setAttribute('role', 'alert');
    const message = document.createElement('div');
    message.className = 'vol-loading__failure-message';
    message.textContent = failure.message ?? i18next.t('core:loading.failed');
    box.appendChild(message);

    const actions = document.createElement('div');
    actions.className = 'vol-loading__failure-actions';
    if (failure.onRetry) {
      const onRetry = failure.onRetry;
      const retry = new Button(i18next.t('core:loading.retry'), {
        variant: 'primary',
        fullWidth: false,
        onClick: () => {
          this.clearFailure();
          this.progressTarget = 0;
          this.animatedPercent = 0;
          this.element.style.setProperty('--vol-loading-progress', '0%');
          if (this.percentEl) this.percentEl.textContent = '0%';
          this.indicatorEl.removeAttribute('aria-valuenow');
          this.determinate = false;
          this.lastTarget = -1;
          this.lastShownPercent = -1;
          this.progressEl
            .querySelector('.vol-loading__fill')
            ?.classList.add('vol-loading__fill--indeterminate');
          this.armStall();
          this.startTips();
          onRetry();
        },
      });
      this.failureButtons.push(retry);
      actions.appendChild(retry.element);
    }
    if (failure.onCancel) {
      const onCancel = failure.onCancel;
      const cancel = new Button(i18next.t('core:loading.cancel'), {
        fullWidth: false,
        onClick: () => onCancel(),
      });
      this.failureButtons.push(cancel);
      actions.appendChild(cancel.element);
    }
    if (this.failureButtons.length > 0) box.appendChild(actions);
    this.failureEl = box;
    this.contentEl.appendChild(box);
    if (hadFocus) this.failureButtons[Math.max(0, focusedIndex)]?.element.focus();
  }

  private disposeFailureUi(): void {
    for (const button of this.failureButtons) button.destroy();
    this.failureButtons = [];
    this.failureEl?.remove();
    this.failureEl = null;
  }

  /** Yükleme ekranını görünür yapar (`showDelayMs` varsa gecikmeli; o süreden kısa yüklemede hiç görünmez). */
  show(): void {
    // Varsa kalan hide timer ve geçiş zamanlayıcısını temizle
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    if (this.transitionTimer) {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }
    if (this.showDelayTimer) {
      clearTimeout(this.showDelayTimer);
      this.showDelayTimer = null;
    }

    this.hideRequested = false;
    this.hideCompleted = false;
    this.element.setAttribute('aria-busy', 'true');
    this.armStall();

    if (this.showDelayMs > 0) {
      this.element.classList.add('vol-loading--pending');
      this.showDelayTimer = setTimeout(() => {
        this.showDelayTimer = null;
        this.reveal();
      }, this.showDelayMs);
      return;
    }
    this.reveal();
  }

  private reveal(): void {
    this.element.classList.remove('vol-loading--pending');
    this.showTime = performance.now();

    // Kalan exit class'larını temizle
    this.element.classList.remove(
      'vol-loading--enter',
      'vol-loading--exit',
      'vol-loading--visible',
      'vol-loading--hidden',
    );

    // Varsa show rAF'ı iptal et
    cancelAnimationFrame(this.showRafId);

    // Önce DOM'a ekle, sonra bir frame bekle ki transition çalışsın
    this.element.classList.add('vol-loading--enter');
    this.showRafId = requestAnimationFrame(() => {
      this.showRafId = requestAnimationFrame(() => {
        if (!this.hideRequested) {
          this.element.classList.add('vol-loading--visible');
        }
      });
    });
    this.blockPage();
    this.startTips();
  }

  /** Arkadaki sayfayı kapatır ve odağı ekrana alır; kapanınca `unblockPage` geri verir. */
  private blockPage(): void {
    if (!this.blockBackground || this.blockedSiblings.length > 0) return;
    const active = document.activeElement;
    this.restoreFocusTo =
      active instanceof HTMLElement && active !== document.body && !this.element.contains(active)
        ? active
        : null;
    const own = this.element.closest('body > *') ?? this.element;
    for (const child of Array.from(document.body.children)) {
      if (child === own || !(child instanceof HTMLElement) || child.inert) continue;
      child.inert = true;
      this.blockedSiblings.push(child);
    }
    this.element.tabIndex = -1;
    this.element.focus({ preventScroll: true });
  }

  private unblockPage(): void {
    for (const child of this.blockedSiblings) child.inert = false;
    this.blockedSiblings = [];
    const target = this.restoreFocusTo;
    this.restoreFocusTo = null;
    const active = document.activeElement;
    const lost = !active || active === document.body || this.element.contains(active);
    if (target?.isConnected && lost) target.focus({ preventScroll: true });
  }

  /** Aşama metnini günceller; okuyucuya duyulur (`role="status"` kökü). Boş metin aşamayı gizler. */
  setStage(stage: string): void {
    this.stageEl.textContent = stage;
    this.armStall();
  }

  private renderTip(): void {
    if (this.tipEl) {
      this.tipEl.textContent = `${i18next.t('core:loading.tip')} · ${this.tips[this.tipIndex]}`;
    }
  }

  private startTips(): void {
    if (this.tipTimer || this.tips.length < 2) return;
    this.tipTimer = setInterval(() => {
      this.tipIndex = (this.tipIndex + 1) % this.tips.length;
      this.tipEl?.classList.add('vol-loading__tip--swap');
      setTimeout(() => {
        this.renderTip();
        this.tipEl?.classList.remove('vol-loading__tip--swap');
      }, 160);
    }, this.tipIntervalMs);
  }

  private stopTips(): void {
    if (this.tipTimer) clearInterval(this.tipTimer);
    this.tipTimer = null;
  }

  private stallText(): string {
    return this.stallMessageOverride ?? i18next.t('core:loading.stalled');
  }

  /** İlerleme/aşama her değiştiğinde takılma sayacı yeniden başlar; süre dolarsa bir kez bildirilir. */
  private armStall(): void {
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.stallTimer = null;
    if (this.stalled) {
      this.stalled = false;
      this.stallEl.hidden = true;
      this.stallEl.textContent = '';
    }
    if (this.stallMs <= 0 || this.hideRequested || this.failure) return;
    this.stallTimer = setTimeout(() => {
      this.stallTimer = null;
      this.stalled = true;
      this.stallEl.textContent = this.stallText();
      this.stallEl.hidden = false;
      this.onStallHandler?.();
    }, this.stallMs);
  }

  /** Progress günceller (0-100). Değer yumuşak animasyonla hedefe ulaşır; ilk çağrıda çubuk belirsizden kesine geçer. */
  update(percent: number): void {
    const target = Math.max(0, Math.min(100, percent));
    this.indicatorEl.setAttribute('aria-valuenow', String(Math.round(target)));
    if (!this.determinate) {
      this.determinate = true;
      this.progressEl
        .querySelector('.vol-loading__fill')
        ?.classList.remove('vol-loading__fill--indeterminate');
    }
    // Aynı hedef tekrar gelirse takılma sayacı sıfırlanmaz (ilerleme yok demektir).
    if (target !== this.lastTarget) this.armStall();
    this.lastTarget = target;

    // prefers-reduced-motion: animasyonu atla, değeri anında uygula
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      this.animatedPercent = target;
      this.paintProgress(target);
      return;
    }

    this.progressFrom = this.animatedPercent;
    this.progressTarget = target;
    this.progressStart = performance.now();

    cancelAnimationFrame(this.progressRafId);
    this.progressRafId = requestAnimationFrame((t) => this.animateProgress(t));
  }

  /** Çubuk genişliği ve yüzde metni; yüzde metni yalnız TAM sayı değişince yazılır (kare başına DOM yazımı yok). */
  private paintProgress(value: number): void {
    this.element.style.setProperty('--vol-loading-progress', `${value}%`);
    const whole = Math.round(value);
    if (this.percentEl && whole !== this.lastShownPercent) {
      this.percentEl.textContent = `${whole}%`;
    }
    this.lastShownPercent = whole;
  }

  private animateProgress(now: number): void {
    const elapsed = now - this.progressStart;
    const t = this.progressDurationMs <= 0 ? 1 : Math.min(1, elapsed / this.progressDurationMs);
    const eased = 1 - Math.pow(1 - t, 3);
    this.animatedPercent = this.progressFrom + (this.progressTarget - this.progressFrom) * eased;
    this.paintProgress(this.animatedPercent);

    if (t < 1) {
      this.progressRafId = requestAnimationFrame((t2) => this.animateProgress(t2));
    }
  }

  /**
   * Yükleme ekranını gizler.
   * Min. gösterim süresi dolmadıysa, kalan süre kadar bekler.
   */
  hide(): void {
    if (this.hideRequested) return;
    this.clearFailure();
    this.hideRequested = true;
    this.armStall();
    this.stopTips();
    // İş bitti: sayfa HEMEN etkileşime açılır. Asgari gösterim ve solma yalnız ekranı görsel olarak tutar;
    // arkadaki arayüzün klavyesi o süre boyunca ölü kalmamalı (ilk tuş vuruşu kaybolurdu).
    this.unblockPage();

    // Gösterim gecikmesi dolmadan biten yükleme hiç görünmez: animasyon ve asgari süre atlanır.
    if (this.showDelayTimer) {
      clearTimeout(this.showDelayTimer);
      this.showDelayTimer = null;
      this.element.classList.remove('vol-loading--pending');
      this.element.classList.add('vol-loading--hidden');
      this.element.setAttribute('aria-busy', 'false');
      this.hideCompleted = true;
      this.onComplete?.();
      return;
    }

    const elapsed = performance.now() - this.showTime;
    const remaining = this.minDisplayMs - elapsed;

    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
    }

    if (remaining > 0) {
      this.hideTimer = setTimeout(() => this.performHide(), remaining);
    } else {
      this.performHide();
    }
  }

  /** Hide animasyonunu uygular. */
  private performHide(): void {
    if (this.hideCompleted) return;
    this.hideCompleted = true;
    this.hideTimer = null;

    this.element.setAttribute('aria-busy', 'false');
    this.unblockPage();
    this.element.classList.remove('vol-loading--visible');
    this.element.classList.add('vol-loading--exit');

    this.transitionTimer = setTimeout(() => {
      this.element.classList.remove('vol-loading--enter', 'vol-loading--exit');
      this.element.classList.add('vol-loading--hidden');
      this.onComplete?.();
    }, this.transitionMs);
  }

  /** Arkaplan uygular. */
  private applyBackground(background: LoadingScreenOptions['background']): void {
    this.cleanupBackgroundMedia();
    this.backgroundEl.className = 'vol-loading__background';
    this.backgroundEl.style.backgroundImage = '';

    if (!background || background.type === 'css') {
      this.backgroundEl.classList.add('vol-loading__background--css');
      return;
    }

    if (background.type === 'image') {
      this.backgroundEl.classList.add('vol-loading__background--image');
      const img = new Image();
      this.backgroundMedia = img;
      img.onload = () => {
        this.backgroundEl.style.backgroundImage = `url(${background.src})`;
      };
      img.onerror = () => {
        this.backgroundEl.classList.remove('vol-loading__background--image');
        this.backgroundEl.classList.add('vol-loading__background--css');
      };
      img.src = background.src;
      return;
    }

    if (background.type === 'video') {
      this.backgroundEl.classList.add('vol-loading__background--video');
      const video = document.createElement('video');
      this.backgroundMedia = video;
      video.src = background.src;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.autoplay = true;

      const applyVideoFallback = (): void => {
        this.backgroundEl.classList.remove('vol-loading__background--video');
        this.backgroundEl.classList.add('vol-loading__background--css');
        video.remove();
      };

      video.onerror = applyVideoFallback;
      this.backgroundEl.appendChild(video);

      try {
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise.catch(applyVideoFallback);
        }
      } catch {
        // Bazı tarayıcılar/cihazlar `play()`'i senkron hata fırlatarak reddeder;
        // bu durumda da statik CSS arkaplanına düş.
        applyVideoFallback();
      }
      return;
    }
  }

  /** Arkaplan medya elementini durdurur ve referansı serbest bırakır. */
  private cleanupBackgroundMedia(): void {
    if (!this.backgroundMedia) return;

    if (this.backgroundMedia instanceof HTMLVideoElement) {
      try {
        this.backgroundMedia.pause();
      } catch {
        // ignore
      }
      this.backgroundMedia.removeAttribute('src');
      try {
        this.backgroundMedia.load();
      } catch {
        // JSDOM/HTMLMediaElement.load() desteklenmez; ignore
      }
      this.backgroundMedia.remove();
    } else if (this.backgroundMedia instanceof HTMLImageElement) {
      this.backgroundMedia.onload = null;
      this.backgroundMedia.onerror = null;
      this.backgroundMedia.removeAttribute('src');
      this.backgroundMedia.removeAttribute('srcset');
    }

    this.backgroundMedia = undefined;
  }

  /** Gösterge uygular: `bar` yalnız plakadaki çubuktur; diğerleri çubuğun üstünde süs olarak çizilir. */
  private applyIndicator(indicator: LoadingIndicatorOptions | undefined): void {
    const { type = 'bar', color, size = 96, customElement } = indicator ?? {};

    if (color) {
      this.element.style.setProperty('--vol-loading-color', color);
    }

    this.element.style.setProperty('--vol-loading-size', `${size}px`);

    if (customElement) {
      this.indicatorEl.appendChild(customElement);
      return;
    }

    if (type === 'bar') {
      this.indicatorEl.classList.add('vol-loading__indicator--bar');
    } else {
      buildLoadingEmblem(type, this.indicatorEl);
    }
  }

  destroy(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    if (this.transitionTimer) {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }
    cancelAnimationFrame(this.progressRafId);
    cancelAnimationFrame(this.showRafId);
    if (this.showDelayTimer) clearTimeout(this.showDelayTimer);
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.stopTips();
    this.unblockPage();
    i18next.off('languageChanged', this.onLanguageChanged);
    this.disposeFailureUi();
    this.cleanupBackgroundMedia();
    this.element.remove();
  }
}
