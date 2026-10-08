import { DisposableScope } from '../../lifecycle/DisposableScope';
import { UI_RATIO } from '../../constants';
import { i18next } from '../../i18n/I18n';

const INTERACTIVE = 'button, a[href], input, select, textarea, [role="slider"], [contenteditable]';
let carouselSeq = 0;

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

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
  private readonly idBase = `vol-carousel-${++carouselSeq}`;
  private readonly slideElements: HTMLDivElement[] = [];
  private currentIndex = 0;
  private autoPlayTimer: number | null = null;
  private dragStartX = 0;
  private dragDeltaX = 0;
  private isDragging = false;
  private activePointerId: number | null = null;
  /**
   * Bu bileşenin ömrüne bağlı kaynaklar.
   *
   * Elle yönetilen bir `(() => void)[]` dizisiydi. `DisposableScope`in üç
   * farkı var ve üçü de davranışsal: kapatma TERS sırada yapılır (kaynaklar
   * arası bağımlılık genelde bu yönde kurulur), ikinci `dispose()` no-op'tur
   * ve bir kaynağın kapatılması FIRLATIRSA geri kalanlar yine kapatılır —
   * düz `for` döngüsü ilk hatada duruyor ve kalan her şeyi sızdırıyordu.
   */
  private readonly scope = new DisposableScope();
  private readonly onLanguageChanged = (): void => {
    const arrows = this.element.querySelectorAll<HTMLButtonElement>('.vol-carousel__arrow');
    arrows.forEach((btn) => {
      const isLeft = btn.classList.contains('vol-carousel__arrow--left');
      btn.setAttribute(
        'aria-label',
        isLeft ? i18next.t('core:carousel.prev') : i18next.t('core:carousel.next'),
      );
    });
    if (this.dotsEl) {
      const dots = this.dotsEl.querySelectorAll<HTMLButtonElement>('.vol-carousel__dot');
      dots.forEach((dot, i) => {
        dot.setAttribute('aria-label', i18next.t('core:carousel.page', { n: i + 1 }));
      });
    }
    this.labelSlides();
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
    const showDots = options.showDots ?? true;
    for (const slide of this.slides) {
      const slideEl = document.createElement('div');
      slideEl.className = 'vol-carousel__slide';
      slideEl.setAttribute('role', showDots ? 'tabpanel' : 'group');
      slideEl.appendChild(slide.element);
      this.slideElements.push(slideEl);
      this.track.appendChild(slideEl);
    }
    viewport.appendChild(this.track);

    if (options.showArrows ?? true) {
      const prevBtn = this.buildArrowButton('left', () => this.goTo(this.currentIndex - 1));
      const nextBtn = this.buildArrowButton('right', () => this.goTo(this.currentIndex + 1));
      this.element.appendChild(prevBtn);
      this.element.appendChild(nextBtn);
    }

    if (showDots) {
      this.dotsEl = this.buildDots();
      this.element.appendChild(this.dotsEl);
    } else {
      this.dotsEl = null;
    }

    this.attachDragHandlers(viewport);
    this.updatePosition(false);

    this.labelSlides();

    // WCAG 2.2.2: işaretçi veya klavye odağı içerideyken otomatik geçiş durur; azaltılmış harekette hiç başlamaz.
    if (this.autoPlayIntervalMs && !prefersReducedMotion()) {
      this.startAutoPlay();
      const onEnter = (): void => this.stopAutoPlay();
      const onLeave = (): void => {
        if (!this.element.matches(':focus-within')) this.startAutoPlay();
      };
      const onFocusOut = (event: FocusEvent): void => {
        const next = event.relatedTarget;
        if (!(next instanceof Node && this.element.contains(next))) this.startAutoPlay();
      };
      this.element.addEventListener('pointerenter', onEnter);
      this.element.addEventListener('pointerleave', onLeave);
      this.element.addEventListener('focusin', onEnter);
      this.element.addEventListener('focusout', onFocusOut);
      this.scope.add({
        dispose: () => {
          this.element.removeEventListener('pointerenter', onEnter);
          this.element.removeEventListener('pointerleave', onLeave);
          this.element.removeEventListener('focusin', onEnter);
          this.element.removeEventListener('focusout', onFocusOut);
        },
      });
    }

    i18next.on('languageChanged', this.onLanguageChanged);
  }

  /** Belirtilen sayfaya geçer (aralık dışına taşarsa en yakın uca kenetlenir). */
  goTo(index: number): void {
    const next = Math.max(0, Math.min(this.slides.length - 1, index));
    const changed = next !== this.currentIndex;
    this.currentIndex = next;
    this.updatePosition(true);
    if (changed) this.onSlideChangeHandler?.(next);
  }

  getCurrentIndex(): number {
    return this.currentIndex;
  }

  destroy(): void {
    i18next.off('languageChanged', this.onLanguageChanged);
    this.stopAutoPlay();
    this.scope.dispose();
    this.element.remove();
  }

  private buildArrowButton(direction: 'left' | 'right', onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `vol-carousel__arrow vol-carousel__arrow--${direction}`;
    button.setAttribute(
      'aria-label',
      direction === 'left' ? i18next.t('core:carousel.prev') : i18next.t('core:carousel.next'),
    );
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
      dot.id = `${this.idBase}-tab-${i}`;
      dot.setAttribute('aria-controls', `${this.idBase}-slide-${i}`);
      dot.setAttribute('aria-label', i18next.t('core:carousel.page', { n: i + 1 }));
      dot.addEventListener('click', () => this.goTo(i));
      dots.appendChild(dot);
    }
    const onKeydown = (event: KeyboardEvent): void => {
      const last = this.slides.length - 1;
      const target: Record<string, number> = {
        ArrowLeft: this.currentIndex - 1,
        ArrowRight: this.currentIndex + 1,
        Home: 0,
        End: last,
      };
      const index = target[event.key];
      if (index === undefined) return;
      event.preventDefault();
      this.goTo(index);
      this.dotElements()[this.currentIndex]?.focus();
    };
    dots.addEventListener('keydown', onKeydown);
    this.scope.add({ dispose: () => dots.removeEventListener('keydown', onKeydown) });
    return dots;
  }

  private dotElements(): HTMLButtonElement[] {
    return this.dotsEl
      ? [...this.dotsEl.querySelectorAll<HTMLButtonElement>('.vol-carousel__dot')]
      : [];
  }

  /** Slayt kimliği ve (noktalar varsa) sekme bağı; dil değişince etiket yenilenir. */
  private labelSlides(): void {
    this.slideElements.forEach((slideEl, index) => {
      slideEl.id = `${this.idBase}-slide-${index}`;
      if (this.dotsEl) slideEl.setAttribute('aria-labelledby', `${this.idBase}-tab-${index}`);
      else
        slideEl.setAttribute(
          'aria-label',
          i18next.t('core:carousel.slide', { n: index + 1, total: this.slides.length }),
        );
    });
  }

  private attachDragHandlers(viewport: HTMLDivElement): void {
    const onPointerDown = (event: PointerEvent): void => {
      // Slayt içindeki denetim kendi tıklamasını alır; yakalama onu viewport'a çalmaz.
      if (event.target instanceof Element && event.target.closest(INTERACTIVE)) return;
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
      if (event.type === 'pointercancel') {
        // İptal sayfa değiştirmez: bulunduğu sayfaya geri oturur.
        this.updatePosition(true);
      } else if (this.dragDeltaX > threshold) {
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
    this.scope.add({
      dispose: () => {
        viewport.removeEventListener('pointerdown', onPointerDown);
        viewport.removeEventListener('pointermove', onPointerMove);
        viewport.removeEventListener('pointerup', onPointerUp);
        viewport.removeEventListener('pointercancel', onPointerUp);
      },
    });
  }

  private updatePosition(animate: boolean): void {
    this.track.classList.toggle('vol-carousel__track--animated', animate);
    this.track.style.transform = `translateX(${-this.currentIndex * 100}%)`;

    this.slideElements.forEach((slideEl, index) => {
      const active = index === this.currentIndex;
      slideEl.toggleAttribute('inert', !active);
      slideEl.setAttribute('aria-hidden', String(!active));
    });
    this.dotElements().forEach((dot, index) => {
      const active = index === this.currentIndex;
      dot.classList.toggle('vol-carousel__dot--active', active);
      dot.setAttribute('aria-selected', String(active));
      dot.tabIndex = active ? 0 : -1;
    });
    const arrows = this.element.querySelectorAll<HTMLButtonElement>('.vol-carousel__arrow');
    arrows.forEach((arrow) => {
      const atEdge = arrow.classList.contains('vol-carousel__arrow--left')
        ? this.currentIndex === 0
        : this.currentIndex === this.slides.length - 1;
      arrow.setAttribute('aria-disabled', String(atEdge));
    });
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
