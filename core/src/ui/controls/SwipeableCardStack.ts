import { DisposableScope } from '../../lifecycle/DisposableScope';
import { UI_RATIO, UI_THRESHOLD, UI_TIMING, UI_CAPACITY } from '../../constants';
import { i18next } from '../../systems/I18n';

export type SwipeDirection = 'left' | 'right';

export interface SwipeableCardDefinition {
  id: string;
  element: HTMLElement;
}

export interface SwipeableCardStackOptions {
  cards: SwipeableCardDefinition[];
  /** Bir kart sürüklenip bırakıldığında (eşik aşıldığında) çağrılır. */
  onSwipe?: (id: string, direction: SwipeDirection) => void;
  /** Deste tamamen boşaldığında (son kart da atıldığında) çağrılır. */
  onEmpty?: () => void;
  /** Kartın atılmış sayılması için gereken minimum yatay sürükleme mesafesi (piksel). Aşılmazsa kart merkeze geri döner. Varsayılan 120. */
  swipeThreshold?: number;
  /** true ise kartın altında sol/sağ için ayrı aksiyon düğmeleri gösterilir — sürüklemeye alternatif. Varsayılan false. */
  showActionButtons?: boolean;
}

/**
 * Üst üste duran kart destesini yana kaydırarak eleme/seçme görünümü.
 * ScrollView'ın "hepsi görünür" listesinden farklı olarak, her seferinde tek
 * kart odakta durur; sağa/sola sürükleyip atılır, bir sonraki kart öne çıkar.
 */
export class SwipeableCardStack {
  readonly element: HTMLDivElement;
  private readonly stackEl: HTMLDivElement;
  private readonly actionsEl: HTMLDivElement | null;
  private readonly onSwipeHandler?: (id: string, direction: SwipeDirection) => void;
  private readonly onEmptyHandler?: () => void;
  private readonly swipeThreshold: number;
  private cards: SwipeableCardDefinition[];
  private cardElements: HTMLDivElement[] = [];
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
  private dragStartX = 0;
  private dragOffsetX = 0;
  private isDragging = false;
  private activePointerId: number | null = null;
  /** commitSwipe sırasında uçuş animasyonu (180ms) oynar; bu pencerede ikinci commit
   *  gelirse eski kartın element'i yanlış uçar — reentrant koruma. */
  private isCommitting = false;
  private renderTimeoutId: number | null = null;
  private actionButtons: HTMLButtonElement[] = [];
  private readonly onLanguageChanged = (): void => {
    if (this.actionButtons[0])
      this.actionButtons[0].setAttribute('aria-label', i18next.t('core:swipe.reject'));
    if (this.actionButtons[1])
      this.actionButtons[1].setAttribute('aria-label', i18next.t('core:swipe.accept'));
  };

  constructor(options: SwipeableCardStackOptions) {
    this.cards = [...options.cards];
    this.onSwipeHandler = options.onSwipe;
    this.onEmptyHandler = options.onEmpty;
    this.swipeThreshold = options.swipeThreshold ?? UI_THRESHOLD.CARD_SWIPE_DEFAULT;

    this.element = document.createElement('div');
    this.element.className = 'vol-card-stack';

    this.stackEl = document.createElement('div');
    this.stackEl.className = 'vol-card-stack__stack';
    this.element.appendChild(this.stackEl);

    if (options.showActionButtons) {
      this.actionsEl = this.buildActionButtons();
      this.element.appendChild(this.actionsEl);
    } else {
      this.actionsEl = null;
    }

    this.renderStack();

    i18next.on('languageChanged', this.onLanguageChanged);
  }

  /** Kalan kart sayısı. */
  get remaining(): number {
    return this.cards.length;
  }

  /** En üstteki kartı programatik olarak atar. */
  swipeTop(direction: SwipeDirection): void {
    if (this.cards.length === 0) return;
    this.commitSwipe(direction);
  }

  destroy(): void {
    i18next.off('languageChanged', this.onLanguageChanged);
    if (this.renderTimeoutId !== null) {
      window.clearTimeout(this.renderTimeoutId);
      this.renderTimeoutId = null;
    }
    this.scope.dispose();
    this.element.remove();
  }

  private buildActionButtons(): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'vol-card-stack__actions';

    const rejectBtn = document.createElement('button');
    rejectBtn.type = 'button';
    rejectBtn.className = 'vol-card-stack__action vol-card-stack__action--reject';
    rejectBtn.setAttribute('aria-label', i18next.t('core:swipe.reject'));
    rejectBtn.appendChild(this.buildXIcon());
    rejectBtn.addEventListener('click', () => this.commitSwipe('left'));
    row.appendChild(rejectBtn);

    const acceptBtn = document.createElement('button');
    acceptBtn.type = 'button';
    acceptBtn.className = 'vol-card-stack__action vol-card-stack__action--accept';
    acceptBtn.setAttribute('aria-label', i18next.t('core:swipe.accept'));
    acceptBtn.appendChild(this.buildCheckIcon());
    acceptBtn.addEventListener('click', () => this.commitSwipe('right'));
    row.appendChild(acceptBtn);

    this.actionButtons = [rejectBtn, acceptBtn];
    return row;
  }

  private renderStack(): void {
    this.stackEl.replaceChildren();
    this.cardElements = [];

    // Yalnızca üstteki 3 kart DOM'da tutulur — desteler büyük olsa bile gereksiz element birikmez.
    const visible = this.cards.slice(0, UI_CAPACITY.CARD_STACK_VISIBLE);
    for (let i = visible.length - 1; i >= 0; i--) {
      const def = visible[i];
      const cardEl = document.createElement('div');
      cardEl.className = 'vol-card-stack__card';
      cardEl.style.setProperty('--vol-card-stack-depth', String(i));
      cardEl.appendChild(def.element);

      // Kabul/red ipucu rozetleri yalnızca en üst karta eklenir — alttaki kartlar henüz sürüklenemez.
      if (i === 0) {
        const rejectHint = document.createElement('div');
        rejectHint.className = 'vol-card-stack__hint vol-card-stack__hint--reject';
        rejectHint.appendChild(this.buildXIcon());
        cardEl.appendChild(rejectHint);

        const acceptHint = document.createElement('div');
        acceptHint.className = 'vol-card-stack__hint vol-card-stack__hint--accept';
        acceptHint.appendChild(this.buildCheckIcon());
        cardEl.appendChild(acceptHint);
      }

      this.stackEl.appendChild(cardEl);
      this.cardElements.unshift(cardEl);
    }

    if (this.cards.length > 0) {
      this.attachDragHandlers(this.stackEl.lastElementChild as HTMLDivElement, this.cards[0].id);
      // Yeni kart geldi — action button'ları tekrar tıklanabilir yap.
      for (const btn of this.actionButtons) btn.disabled = false;
    } else {
      // Deste boşaldı — butonlar kalıcı disable kalsın, tıklanacak kart yok.
      for (const btn of this.actionButtons) btn.disabled = true;
      this.onEmptyHandler?.();
    }
  }

  private attachDragHandlers(topCardEl: HTMLDivElement, cardId: string): void {
    const onPointerDown = (event: PointerEvent): void => {
      this.isDragging = true;
      this.dragStartX = event.clientX;
      this.dragOffsetX = 0;
      this.activePointerId = event.pointerId;
      topCardEl.setPointerCapture(event.pointerId);
      topCardEl.classList.add('vol-card-stack__card--dragging');
    };
    const rejectHint = topCardEl.querySelector<HTMLDivElement>('.vol-card-stack__hint--reject');
    const acceptHint = topCardEl.querySelector<HTMLDivElement>('.vol-card-stack__hint--accept');

    const onPointerMove = (event: PointerEvent): void => {
      if (!this.isDragging || this.activePointerId !== event.pointerId) return;
      this.dragOffsetX = event.clientX - this.dragStartX;
      const rotation = this.dragOffsetX * UI_RATIO.CARD_SWIPE_ROTATION;
      topCardEl.style.transform = `translateX(${this.dragOffsetX}px) rotate(${rotation}deg)`;
      topCardEl.classList.toggle(
        'vol-card-stack__card--swipe-right',
        this.dragOffsetX > UI_THRESHOLD.CARD_SWIPE_HINT,
      );
      topCardEl.classList.toggle(
        'vol-card-stack__card--swipe-left',
        this.dragOffsetX < -UI_THRESHOLD.CARD_SWIPE_HINT,
      );

      // İpucu rozetlerinin opacity'si sürükleme mesafesinin eşiğe oranıyla kademeli büyür (on/off yerine).
      const progress = Math.min(Math.abs(this.dragOffsetX) / this.swipeThreshold, 1);
      if (this.dragOffsetX > 0) {
        if (acceptHint) acceptHint.style.opacity = String(progress);
        if (rejectHint) rejectHint.style.opacity = '0';
      } else if (this.dragOffsetX < 0) {
        if (rejectHint) rejectHint.style.opacity = String(progress);
        if (acceptHint) acceptHint.style.opacity = '0';
      } else {
        if (acceptHint) acceptHint.style.opacity = '0';
        if (rejectHint) rejectHint.style.opacity = '0';
      }
    };
    const onPointerUp = (event: PointerEvent): void => {
      if (!this.isDragging || this.activePointerId !== event.pointerId) return;
      this.isDragging = false;
      topCardEl.releasePointerCapture(event.pointerId);
      topCardEl.classList.remove('vol-card-stack__card--dragging');

      if (Math.abs(this.dragOffsetX) >= this.swipeThreshold) {
        this.commitSwipe(this.dragOffsetX > 0 ? 'right' : 'left');
      } else {
        topCardEl.style.transform = '';
        topCardEl.classList.remove(
          'vol-card-stack__card--swipe-right',
          'vol-card-stack__card--swipe-left',
        );
        if (acceptHint) acceptHint.style.opacity = '0';
        if (rejectHint) rejectHint.style.opacity = '0';
      }
    };

    topCardEl.addEventListener('pointerdown', onPointerDown);
    topCardEl.addEventListener('pointermove', onPointerMove);
    topCardEl.addEventListener('pointerup', onPointerUp);
    topCardEl.addEventListener('pointercancel', onPointerUp);
    this.scope.add({
      dispose: () => {
        topCardEl.removeEventListener('pointerdown', onPointerDown);
        topCardEl.removeEventListener('pointermove', onPointerMove);
        topCardEl.removeEventListener('pointerup', onPointerUp);
        topCardEl.removeEventListener('pointercancel', onPointerUp);
      },
    });
    void cardId;
  }

  private commitSwipe(direction: SwipeDirection): void {
    // Reentrant koruma: uçuş animasyonu (180ms) sırasında ikinci commit gelirse
    // this.stackEl.lastElementChild hala eski kartın element'idir (DOM henüz
    // yeniden çizilmemiş) — yanlış kart uçar. Ayrıca swipeTop() programatik
    // çağrısı da aynı pencerede çakışabilir.
    if (this.isCommitting) return;
    const [removed] = this.cards.splice(0, 1);
    if (!removed) return;

    this.isCommitting = true;
    // Animasyon sırasında action button'ları disable et — tıklama kaybolmaz,
    // kullanıcı görsel feedback alır (buton gri olur, tıklanmaz).
    for (const btn of this.actionButtons) btn.disabled = true;

    const topCardEl = this.stackEl.lastElementChild as HTMLDivElement | null;
    this.onSwipeHandler?.(removed.id, direction);

    if (topCardEl) {
      const flyDistance = direction === 'right' ? window.innerWidth : -window.innerWidth;
      topCardEl.classList.add('vol-card-stack__card--flying');
      topCardEl.style.transform = `translateX(${flyDistance}px) rotate(${
        flyDistance * UI_RATIO.CARD_SWIPE_ROTATION
      }deg)`;
    }

    // Uçuş animasyonu görsel olarak başlasın diye kısa bir gecikme sonra deste yeniden çizilir.
    this.renderTimeoutId = window.setTimeout(() => {
      this.renderTimeoutId = null;
      this.isCommitting = false;
      this.renderStack();
    }, UI_TIMING.CARD_FLY_ANIMATION);
  }

  private buildXIcon(): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M6 6l12 12 M18 6 6 18');
    svg.appendChild(path);
    return svg;
  }

  private buildCheckIcon(): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M5 13l4 4L19 7');
    svg.appendChild(path);
    return svg;
  }
}
