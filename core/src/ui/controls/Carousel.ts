import { UI_RATIO } from '../../constants';
import { i18next } from '../../systems/I18n';

export interface CarouselSlide {
  id: string;
  element: HTMLElement;
}

export interface CarouselOptions {
  slides: CarouselSlide[];
  /** true ise altta tıklanabilir nokta göstergesi gösterilir (sayfa konumunu belirtir, tıklayınca o sayfaya zıplar). Varsayılan true. */
  showDots?: boolean;
  /** true ise sol/sağ ok düğmeleri gösterilir — kaydırmaya alternatif sağlar. Varsayılan true. */
  showArrows?: boolean;
  /** Belirtilirse bu ms aralığıyla otomatik sonraki sayfaya geçer (sürüklerken durur, bırakınca devam eder). Verilmezse kapalı. */
  autoPlayIntervalMs?: number;
  onSlideChange?: (index: number) => void;
}

/**
 * Yatayda sayfa sayfa kayan, snap'li görünüm. ScrollView'ın sürekli
 * kaydırmasından farkı: içerik her zaman tam bir "sayfa" birimine hizalanır.
 */
export class Carousel {
  readonly element: HTMLDivElement;
  private readonly track: HTMLDivElement;
  private readonly dotsEl: HTMLDivElement | null;
  private readonly slides: CarouselSlide[];
  private readonly onSlideChangeHandler?: (index: number) => void;
  private readonly autoPlayIntervalMs?: number;
  private currentIndex = 0;
  private autoPlayTimer: number | null = null;
  private dragStartX = 0;
  private dragDeltaX = 0;
  private isDragging = false;
  private activePointerId: number | null = null;
  private cleanups: (() => void)[] = [];
  private readonly onLanguageChanged = (): void => {
    const arrows = this.element.querySelectorAll<HTMLButtonElement>('.vol-carousel__arrow');
    arrows.forEach((btn) => {
      const isLeft = btn.classList.contains('vol-carousel__arrow--left');
      btn.setAttribute('aria-label', isLeft ? i18next.t('core:carousel.prev') : i18next.t('core:carousel.next'));
    });
    if (this.dotsEl) {
      const dots = this.dotsEl.querySelectorAll<HTMLButtonElement>('.vol-carousel__dot');
      dots.forEach((dot, i) => {
        dot.setAttribute('aria-label', i18next.t('core:carousel.page', { n: i + 1 }));
      });
    }
  };

  constructor(options: CarouselOptions) {
    this.slides = options.slides;
    this.onSlideChangeHandler = options.onSlideChange;
    this.autoPlayIntervalMs = options.autoPlayIntervalMs;

    this.element = document.createElement('div');
    this.element.className = 'vol-carousel';

    const viewport = document.createElement('div');
    viewport.className = 'vol-carousel__viewport';
    this.element.appendChild(viewport);

    this.track = document.createElement('div');
    this.track.className = 'vol-carousel__track';
    for (const slide of this.slides) {
      const slideEl = document.createElement('div');
      slideEl.className = 'vol-carousel__slide';
      slideEl.appendChild(slide.element);
      this.track.appendChild(slideEl);
    }
    viewport.appendChild(this.track);

    if (options.showArrows ?? true) {
      const prevBtn = this.buildArrowButton('left', () => this.goTo(this.currentIndex - 1));
      const nextBtn = this.buildArrowButton('right', () => this.goTo(this.currentIndex + 1));
      this.element.appendChild(prevBtn);
      this.element.appendChild(nextBtn);
    }

    if (options.showDots ?? true) {
      this.dotsEl = this.buildDots();
      this.element.appendChild(this.dotsEl);
    } else {
      this.dotsEl = null;
    }

    this.attachDragHandlers(viewport);
    this.updatePosition(false);

    if (this.autoPlayIntervalMs) {
      this.startAutoPlay();
      this.element.addEventListener('pointerenter', () => this.stopAutoPlay());
      this.element.addEventListener('pointerleave', () => this.startAutoPlay());
    }

    i18next.on('languageChanged', this.onLanguageChanged);
  }

  /** Belirtilen sayfaya geçer (aralık dışına taşarsa en yakın uca kenetlenir). */
  goTo(index: number): void {
    this.currentIndex = Math.max(0, Math.min(this.slides.length - 1, index));
    this.updatePosition(true);
    this.onSlideChangeHandler?.(this.currentIndex);
  }

  getCurrentIndex(): number {
    return this.currentIndex;
  }

  destroy(): void {
    i18next.off('languageChanged', this.onLanguageChanged);
    this.stopAutoPlay();
    for (const cleanup of this.cleanups) cleanup();
    this.element.remove();
  }

  private buildArrowButton(direction: 'left' | 'right', onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `vol-carousel__arrow vol-carousel__arrow--${direction}`;
    button.setAttribute('aria-label', direction === 'left' ? i18next.t('core:carousel.prev') : i18next.t('core:carousel.next'));
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', direction === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6');
    svg.appendChild(path);
    button.appendChild(svg);
    button.addEventListener('click', onClick);
    return button;
  }

  private buildDots(): HTMLDivElement {
    const dots = document.createElement('div');
    dots.className = 'vol-carousel__dots';
    dots.setAttribute('role', 'tablist');
    for (let i = 0; i < this.slides.length; i++) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'vol-carousel__dot';
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', i18next.t('core:carousel.page', { n: i + 1 }));
      dot.addEventListener('click', () => this.goTo(i));
      dots.appendChild(dot);
    }
    return dots;
  }

  private attachDragHandlers(viewport: HTMLDivElement): void {
    const onPointerDown = (event: PointerEvent): void => {
      this.isDragging = true;
      this.dragStartX = event.clientX;
      this.dragDeltaX = 0;
      this.activePointerId = event.pointerId;
      viewport.setPointerCapture(event.pointerId);
      this.track.classList.add('vol-carousel__track--dragging');
      this.stopAutoPlay();
    };
    const onPointerMove = (event: PointerEvent): void => {
      if (!this.isDragging || this.activePointerId !== event.pointerId) return;
      this.dragDeltaX = event.clientX - this.dragStartX;
      const baseOffset = -this.currentIndex * viewport.clientWidth;
      this.track.style.transform = `translateX(${baseOffset + this.dragDeltaX}px)`;
    };
    const onPointerUp = (event: PointerEvent): void => {
      if (!this.isDragging || this.activePointerId !== event.pointerId) return;
      this.isDragging = false;
      viewport.releasePointerCapture(event.pointerId);
      this.track.classList.remove('vol-carousel__track--dragging');

      const threshold = viewport.clientWidth * UI_RATIO.CAROUSEL_SWIPE_THRESHOLD;
      if (this.dragDeltaX > threshold) {
        this.goTo(this.currentIndex - 1);
      } else if (this.dragDeltaX < -threshold) {
        this.goTo(this.currentIndex + 1);
      } else {
        this.updatePosition(true);
      }

      if (this.autoPlayIntervalMs) this.startAutoPlay();
    };

    viewport.addEventListener('pointerdown', onPointerDown);
    viewport.addEventListener('pointermove', onPointerMove);
    viewport.addEventListener('pointerup', onPointerUp);
    viewport.addEventListener('pointercancel', onPointerUp);
    this.cleanups.push(() => {
      viewport.removeEventListener('pointerdown', onPointerDown);
      viewport.removeEventListener('pointermove', onPointerMove);
      viewport.removeEventListener('pointerup', onPointerUp);
      viewport.removeEventListener('pointercancel', onPointerUp);
    });
  }

  private updatePosition(animate: boolean): void {
    this.track.classList.toggle('vol-carousel__track--animated', animate);
    this.track.style.transform = `translateX(${-this.currentIndex * 100}%)`;

    if (this.dotsEl) {
      const dots = this.dotsEl.querySelectorAll('.vol-carousel__dot');
      dots.forEach((dot, index) => {
        dot.classList.toggle('vol-carousel__dot--active', index === this.currentIndex);
        dot.setAttribute('aria-selected', String(index === this.currentIndex));
      });
    }
  }

  private startAutoPlay(): void {
    if (!this.autoPlayIntervalMs) return;
    this.stopAutoPlay();
    this.autoPlayTimer = window.setInterval(() => {
      const next = (this.currentIndex + 1) % this.slides.length;
      this.goTo(next);
    }, this.autoPlayIntervalMs);
  }

  private stopAutoPlay(): void {
    if (this.autoPlayTimer !== null) {
      window.clearInterval(this.autoPlayTimer);
      this.autoPlayTimer = null;
    }
  }
}
