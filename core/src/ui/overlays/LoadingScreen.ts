/** Gösterge tipi — orbital-rings, energy-core, particle-orbit, hexagon-pulse veya bar. */
export type LoadingIndicatorType =
  | 'orbital-rings'
  | 'energy-core'
  | 'particle-orbit'
  | 'hexagon-pulse'
  | 'bar';

/** Arkaplan tipi — image, video veya CSS gradient (varsayılan). */
export type LoadingBackgroundType = 'image' | 'video' | 'css';

/** Geçiş efekti tipi. */
export type LoadingTransitionType = 'fade' | 'slide' | 'zoom';

/** İçerik (gösterge + yazı) konumu. */
export type LoadingContentPosition =
  | 'center'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

const CONTENT_POSITION_MAP: Record<LoadingContentPosition, { align: string; justify: string }> = {
  'center': { align: 'center', justify: 'center' },
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
  /** Min. gösterim süresi (ms). Gerçek yükleme hızlı olsa bile en az bu kadar göster. Varsayılan: 2000. */
  minDisplayMs?: number;

  /** Arkaplan. Varsayılan: CSS gradient. */
  background?:
    | { type: 'image'; src: string }
    | { type: 'video'; src: string }
    | { type: 'css' };

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

  private readonly minDisplayMs: number;
  private readonly transitionMs: number;
  private readonly progressDurationMs: number;
  private readonly onComplete?: () => void;
  private hideCompleted = false;

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
      minDisplayMs = 2000,
      transitionMs = 400,
      transitionType = 'fade',
      progressMs = 300,
      onComplete,
    } = options;

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

    // İçerik
    this.contentEl = document.createElement('div');
    this.contentEl.className = 'vol-loading__content';

    // Gösterge
    this.indicatorEl = document.createElement('div');
    this.indicatorEl.className = 'vol-loading__indicator';
    this.applyIndicator(options.indicator);
    this.contentEl.appendChild(this.indicatorEl);

    // Yüzde
    if (options.showPercent) {
      this.percentEl = document.createElement('div');
      this.percentEl.className = 'vol-loading__percent';
      this.percentEl.textContent = '0%';
      this.contentEl.appendChild(this.percentEl);
    }

    // Başlık
    if (options.title) {
      const titleEl = document.createElement('div');
      titleEl.className = 'vol-loading__title';
      titleEl.textContent = options.title;
      this.contentEl.appendChild(titleEl);
    }

    // Alt başlık
    if (options.subtitle) {
      const subtitleEl = document.createElement('div');
      subtitleEl.className = 'vol-loading__subtitle';
      subtitleEl.textContent = options.subtitle;
      this.contentEl.appendChild(subtitleEl);
    }

    this.element.appendChild(this.contentEl);
  }

  /** Yükleme ekranını görünür yapar. */
  show(): void {
    // Önceki hide timer/temizlik
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    if (this.transitionTimer) {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }

    this.showTime = performance.now();
    this.hideRequested = false;
    this.hideCompleted = false;
    this.element.setAttribute('aria-busy', 'true');

    // Exit class'ları temizle (önceki hide'tan kalmış olabilir)
    this.element.classList.remove('vol-loading--enter', 'vol-loading--exit', 'vol-loading--visible');

    // Önceki show rAF'ı iptal et
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
  }

  /** Progress günceller (0-100). Değer yumuşak animasyonla hedefe ulaşır. */
  update(percent: number): void {
    const target = Math.max(0, Math.min(100, percent));

    // prefers-reduced-motion: animasyonu atla, değeri anında uygula
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.animatedPercent = target;
      if (this.percentEl) {
        this.percentEl.textContent = `${Math.round(target)}%`;
      }
      this.element.style.setProperty('--vol-loading-progress', `${target}%`);
      return;
    }

    this.progressFrom = this.animatedPercent;
    this.progressTarget = target;
    this.progressStart = performance.now();

    cancelAnimationFrame(this.progressRafId);
    this.progressRafId = requestAnimationFrame((t) => this.animateProgress(t));
  }

  private animateProgress(now: number): void {
    const elapsed = now - this.progressStart;
    const t = this.progressDurationMs <= 0 ? 1 : Math.min(1, elapsed / this.progressDurationMs);
    const eased = 1 - Math.pow(1 - t, 3);
    this.animatedPercent = this.progressFrom + (this.progressTarget - this.progressFrom) * eased;

    if (this.percentEl) {
      this.percentEl.textContent = `${Math.round(this.animatedPercent)}%`;
    }
    this.element.style.setProperty('--vol-loading-progress', `${this.animatedPercent}%`);

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
    this.hideRequested = true;

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
    this.element.classList.remove('vol-loading--visible');
    this.element.classList.add('vol-loading--exit');

    this.transitionTimer = setTimeout(() => {
      this.element.classList.remove('vol-loading--enter', 'vol-loading--exit');
      this.onComplete?.();
    }, this.transitionMs);
  }

  /** Arkaplan uygular. */
  private applyBackground(
    background: LoadingScreenOptions['background'],
  ): void {
    if (!background || background.type === 'css') {
      this.backgroundEl.classList.add('vol-loading__background--css');
      return;
    }

    if (background.type === 'image') {
      this.backgroundEl.classList.add('vol-loading__background--image');
      const img = new Image();
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
      video.src = background.src;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.autoplay = true;
      video.onerror = () => {
        this.backgroundEl.classList.remove('vol-loading__background--video');
        this.backgroundEl.classList.add('vol-loading__background--css');
        video.remove();
      };
      this.backgroundEl.appendChild(video);
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          this.backgroundEl.classList.remove('vol-loading__background--video');
          this.backgroundEl.classList.add('vol-loading__background--css');
          video.remove();
        });
      }
      return;
    }
  }

  /** Gösterge uygular. */
  private applyIndicator(indicator: LoadingIndicatorOptions | undefined): void {
    const {
      type = 'orbital-rings',
      color,
      size = 120,
      customElement,
    } = indicator ?? {};

    if (color) {
      this.element.style.setProperty('--vol-loading-color', color);
    }

    this.element.style.setProperty('--vol-loading-size', `${size}px`);

    if (customElement) {
      this.indicatorEl.appendChild(customElement);
      return;
    }

    if (type === 'orbital-rings') {
      this.buildOrbitalRings();
    } else if (type === 'energy-core') {
      this.buildEnergyCore();
    } else if (type === 'particle-orbit') {
      this.buildParticleOrbit();
    } else if (type === 'hexagon-pulse') {
      this.buildHexagonPulse();
    } else if (type === 'bar') {
      this.buildBar();
    }
  }

  /** Orbital Rings — 3 eş merkezli halka, dış halka progress arc. */
  private buildOrbitalRings(): void {
    this.indicatorEl.classList.add('vol-loading__indicator--orbital');

    const outer = document.createElement('div');
    outer.className = 'vol-loading__ring vol-loading__ring--outer';

    const mid = document.createElement('div');
    mid.className = 'vol-loading__ring vol-loading__ring--mid';

    const inner = document.createElement('div');
    inner.className = 'vol-loading__ring vol-loading__ring--inner';

    this.indicatorEl.appendChild(outer);
    this.indicatorEl.appendChild(mid);
    this.indicatorEl.appendChild(inner);
  }

  /** Energy Core — pulse çekirdek + dönen enerji yayları. */
  private buildEnergyCore(): void {
    this.indicatorEl.classList.add('vol-loading__indicator--energy');

    const core = document.createElement('div');
    core.className = 'vol-loading__core';

    const arc1 = document.createElement('div');
    arc1.className = 'vol-loading__arc vol-loading__arc--1';

    const arc2 = document.createElement('div');
    arc2.className = 'vol-loading__arc vol-loading__arc--2';

    const arc3 = document.createElement('div');
    arc3.className = 'vol-loading__arc vol-loading__arc--3';

    this.indicatorEl.appendChild(arc1);
    this.indicatorEl.appendChild(arc2);
    this.indicatorEl.appendChild(arc3);
    this.indicatorEl.appendChild(core);
  }

  /** Particle Orbit — ortada sabit nokta, etrafında partiküller döner, progress arttıkça çap büyür. */
  private buildParticleOrbit(): void {
    this.indicatorEl.classList.add('vol-loading__indicator--particle');

    const center = document.createElement('div');
    center.className = 'vol-loading__particle-center';

    const orbit = document.createElement('div');
    orbit.className = 'vol-loading__particle-orbit';

    const particleCount = 6;
    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.className = 'vol-loading__particle';
      particle.style.setProperty('--vol-loading-particle-angle', `${(360 / particleCount) * i}deg`);
      particle.style.setProperty('--vol-loading-particle-delay', `${(1.5 / particleCount) * i}s`);
      orbit.appendChild(particle);
    }

    this.indicatorEl.appendChild(orbit);
    this.indicatorEl.appendChild(center);
  }

  /** Hexagon Pulse — dönen altıgen, progress arttıkça kenarlar sırayla dolar. */
  private buildHexagonPulse(): void {
    this.indicatorEl.classList.add('vol-loading__indicator--hexagon');

    const hex = document.createElement('div');
    hex.className = 'vol-loading__hexagon';

    const hexInner = document.createElement('div');
    hexInner.className = 'vol-loading__hexagon-inner';

    this.indicatorEl.appendChild(hex);
    this.indicatorEl.appendChild(hexInner);
  }

  /** Bar — yatay progress bar. */
  private buildBar(): void {
    this.indicatorEl.classList.add('vol-loading__indicator--bar');

    const track = document.createElement('div');
    track.className = 'vol-loading__bar-track';

    const fill = document.createElement('div');
    fill.className = 'vol-loading__bar-fill';

    track.appendChild(fill);
    this.indicatorEl.appendChild(track);
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
    this.element.remove();
  }
}
