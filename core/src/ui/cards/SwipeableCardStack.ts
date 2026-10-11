import { DisposableScope } from '../../lifecycle/DisposableScope';
import { UI_RATIO, UI_THRESHOLD, UI_TIMING, UI_CAPACITY } from '../../constants';
import { i18next } from '../../i18n/I18n';
import { emitUiIntent } from '../feedback/uiIntent';
import { prefersReducedMotion } from '../motion/reducedMotion';

export type SwipeDirection = 'left' | 'right';

export interface SwipeableCardDefinition {
  id: string;
  element: HTMLElement;
  /** Okuyucu duyurusu için kısa ad (örn. kartın başlığı); `announce` açıkken sonuç cümlesine girer. */
  label?: string;
}

export interface SwipeableCardStackOptions {
  cards: SwipeableCardDefinition[];
  /** Bir kart sürüklenip bırakıldığında (eşik aşıldığında) çağrılır. */
  onSwipe?: (id: string, direction: SwipeDirection) => void;
  /** Deste tamamen boşaldığında (son kart da atıldığında) çağrılır. */
  onEmpty?: () => void;
  /** Kartın atılmış sayılması için gereken minimum yatay sürükleme mesafesi (piksel). Aşılmazsa kart merkeze geri döner. Varsayılan 120. */
  swipeThreshold?: number;
  /**
   * true ise kartın altında sol/sağ için ayrı aksiyon düğmeleri gösterilir — sürüklemeye alternatif.
   * Varsayılan false: düğmeler yokken yığının kendisi odaklanabilir ve sol/sağ okla yönetilir (klavye).
   * Kol (gamepad) etkinleştirmesi odaktaki düğmeyi tıkladığı için kol kullanıcıları düğmelere ihtiyaç duyar.
   * Yönler fiziksel ve RTL'den bağımsızdır: sol = ret, sağ = kabul (ipucu rozetleri ve düğme sırası da öyle).
   */
  showActionButtons?: boolean;
  /**
   * true ise her sonuç (kabul/ret, kalan kart sayısı) nazik bir canlı bölgeyle duyurulur; duyuru odaktan
   * bağımsızdır (odak düğmede ya da yığında kalır). Varsayılan false: DOM'a hiçbir şey eklenmez.
   */
  announce?: boolean;
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
  private readonly liveEl: HTMLDivElement | null;
  private dragPicked = false;
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
    if (!this.actionsEl) this.stackEl.setAttribute('aria-label', i18next.t('core:swipe.stack'));
  };

  /** Düğmesiz modda odaktaki yığın: sol/sağ ok fiziksel yönde karar verir (Ctrl/Alt/Meta ile değil). */
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.target !== this.stackEl) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    this.commitSwipe(event.key === 'ArrowRight' ? 'right' : 'left', event);
  };

  constructor(options: SwipeableCardStackOptions) {
    this.cards = [...options.cards];
    this.onSwipeHandler = options.onSwipe;
    this.onEmptyHandler = options.onEmpty;
    this.swipeThreshold = options.swipeThreshold ?? UI_THRESHOLD.CARD_SWIPE_DEFAULT_PX;

    this.element = document.createElement('div');
    this.element.className = 'vol-card-stack';

    this.stackEl = document.createElement('div');
    this.stackEl.className = 'vol-card-stack__stack';
    this.element.appendChild(this.stackEl);

    if (!options.showActionButtons) {
      this.stackEl.tabIndex = 0;
      this.stackEl.setAttribute('role', 'group');
      this.stackEl.setAttribute('aria-label', i18next.t('core:swipe.stack'));
      this.stackEl.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight');
      this.scope.addListener(this.stackEl, 'keydown', this.onKeyDown);
    }

    if (options.announce) {
      this.liveEl = document.createElement('div');
      this.liveEl.className = 'vol-sr-only';
      this.liveEl.setAttribute('role', 'status');
      this.liveEl.setAttribute('aria-live', 'polite');
      this.liveEl.setAttribute('aria-atomic', 'true');
      this.element.appendChild(this.liveEl);
    } else {
      this.liveEl = null;
    }

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
    rejectBtn.addEventListener('click', (event) => this.commitSwipe('left', event));
    row.appendChild(rejectBtn);

    const acceptBtn = document.createElement('button');
    acceptBtn.type = 'button';
    acceptBtn.className = 'vol-card-stack__action vol-card-stack__action--accept';
    acceptBtn.setAttribute('aria-label', i18next.t('core:swipe.accept'));
    acceptBtn.appendChild(this.buildCheckIcon());
    acceptBtn.addEventListener('click', (event) => this.commitSwipe('right', event));
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
      // Yalnız üstteki kart etkileşimli ve okunur; alttakiler dekor (okuyucu ve Tab oraya girmez).
      if (i > 0) {
        cardEl.inert = true;
        cardEl.setAttribute('aria-hidden', 'true');
      }

      // Kabul/red ipucu rozetleri yalnızca en üst karta eklenir — alttaki kartlar henüz sürüklenemez.
      if (i === 0) {
        const rejectHint = document.createElement('div');
        rejectHint.className = 'vol-card-stack__hint vol-card-stack__hint--reject';
        rejectHint.setAttribute('aria-hidden', 'true');
        rejectHint.appendChild(this.buildXIcon());
        cardEl.appendChild(rejectHint);

        const acceptHint = document.createElement('div');
        acceptHint.className = 'vol-card-stack__hint vol-card-stack__hint--accept';
        acceptHint.setAttribute('aria-hidden', 'true');
        acceptHint.appendChild(this.buildCheckIcon());
        cardEl.appendChild(acceptHint);
      }

      this.stackEl.appendChild(cardEl);
      this.cardElements.unshift(cardEl);
    }

    if (this.cards.length > 0) {
      this.attachDragHandlers(this.stackEl.lastElementChild as HTMLDivElement, this.cards[0].id);
      // Yeni kart geldi — action button'ları tekrar tıklanabilir yap.
      for (const btn of this.actionButtons) {
        btn.disabled = false;
        btn.removeAttribute('aria-disabled');
      }
    } else {
      // Deste boşaldı — butonlar kalıcı disable kalsın, tıklanacak kart yok. Odaktaki düğme kilitlenirse
      // tarayıcı odağı gövdeye atar (klavye/kol kullanıcısı yerini yitirir): odak destenin kendisine alınır.
      const focusedAction = this.actionButtons.some((btn) => btn === document.activeElement);
      for (const btn of this.actionButtons) {
        btn.removeAttribute('aria-disabled');
        btn.disabled = true;
      }
      // Düğmesiz modda yığın zaten odaktadır; karar verilecek kart kalmadığı için sekme sırasından çıkar.
      if (!this.actionsEl) this.stackEl.tabIndex = -1;
      if (focusedAction) {
        this.stackEl.tabIndex = -1;
        this.stackEl.focus({ preventScroll: true });
      }
      this.onEmptyHandler?.();
    }
  }

  private attachDragHandlers(topCardEl: HTMLDivElement, cardId: string): void {
    const onPointerDown = (event: PointerEvent): void => {
      // İkinci parmak ya da fare ek düğmesi sürüklemeyi çalmaz; yalnız birincil düğme/dokunma başlatır.
      if (this.isDragging || (event.pointerType === 'mouse' && event.button !== 0)) return;
      this.dragPicked = false;
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
      // Sürükleme gerçekten başlayınca (ipucu eşiği) kart "kaldırılmış" sayılır: tek bir pick niyeti.
      if (!this.dragPicked && Math.abs(this.dragOffsetX) > UI_THRESHOLD.CARD_SWIPE_HINT_PX) {
        this.dragPicked = true;
        emitUiIntent({ kind: 'pick', origin: 'SwipeableCardStack', target: topCardEl, event });
      }
      const rotation = this.dragOffsetX * UI_RATIO.CARD_SWIPE_ROTATION;
      topCardEl.style.transform = `translateX(${this.dragOffsetX}px) rotate(${rotation}deg)`;
      topCardEl.classList.toggle(
        'vol-card-stack__card--swipe-right',
        this.dragOffsetX > UI_THRESHOLD.CARD_SWIPE_HINT_PX,
      );
      topCardEl.classList.toggle(
        'vol-card-stack__card--swipe-left',
        this.dragOffsetX < -UI_THRESHOLD.CARD_SWIPE_HINT_PX,
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
      this.activePointerId = null;
      try {
        topCardEl.releasePointerCapture(event.pointerId);
      } catch {
        // Yakalama zaten bırakılmış (yakalama kaybı): kapatılacak bir şey yok.
      }
      topCardEl.classList.remove('vol-card-stack__card--dragging');

      // İptal edilen sürükleme (sistem jesti, kesilen dokunma, kaybolan yakalama) asla kabul/ret
      // sayılmaz: kart yerine döner.
      if (event.type === 'pointerup' && Math.abs(this.dragOffsetX) >= this.swipeThreshold) {
        this.commitSwipe(this.dragOffsetX > 0 ? 'right' : 'left', event);
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
    topCardEl.addEventListener('lostpointercapture', onPointerUp);
    this.scope.add({
      dispose: () => {
        topCardEl.removeEventListener('pointerdown', onPointerDown);
        topCardEl.removeEventListener('pointermove', onPointerMove);
        topCardEl.removeEventListener('pointerup', onPointerUp);
        topCardEl.removeEventListener('pointercancel', onPointerUp);
        topCardEl.removeEventListener('lostpointercapture', onPointerUp);
      },
    });
    void cardId;
  }

  private commitSwipe(direction: SwipeDirection, event?: Event): void {
    // Reentrant koruma: uçuş animasyonu (180ms) sırasında ikinci commit gelirse
    // this.stackEl.lastElementChild hala eski kartın element'idir (DOM henüz
    // yeniden çizilmemiş) — yanlış kart uçar. Ayrıca swipeTop() programatik
    // çağrısı da aynı pencerede çakışabilir.
    if (this.isCommitting) return;
    const [removed] = this.cards.splice(0, 1);
    if (!removed) return;

    this.isCommitting = true;
    // Uçuş sırasında düğmeler `aria-disabled` olur, `disabled` DEĞİL: odaktaki `disabled` düğmeyi tarayıcı
    // bulandırır ve klavye/kol kullanıcısı her kararda yerini yitirirdi. Tıklamayı `isCommitting` yutar.
    for (const btn of this.actionButtons) btn.setAttribute('aria-disabled', 'true');

    const topCardEl = this.stackEl.lastElementChild as HTMLDivElement | null;
    // Kabul "confirm", ret "cancel" sesidir; olaysız (programatik) karar sessiz kalır.
    if (event && topCardEl) {
      emitUiIntent({
        kind: direction === 'right' ? 'confirm' : 'cancel',
        origin: 'SwipeableCardStack',
        target: topCardEl,
        event,
      });
    }
    this.announceDecision(direction, removed);
    this.onSwipeHandler?.(removed.id, direction);

    // Azaltılmış harekette uçuş yok: son durum aynıdır, deste hemen yeniden çizilir.
    const reduceMotion = prefersReducedMotion();
    if (topCardEl && !reduceMotion) {
      const flyDistance = direction === 'right' ? window.innerWidth : -window.innerWidth;
      topCardEl.classList.add('vol-card-stack__card--flying');
      topCardEl.style.transform = `translateX(${flyDistance}px) rotate(${
        flyDistance * UI_RATIO.CARD_SWIPE_ROTATION
      }deg)`;
    }

    // Uçuş animasyonu görsel olarak başlasın diye kısa bir gecikme sonra deste yeniden çizilir.
    this.renderTimeoutId = window.setTimeout(
      () => {
        this.renderTimeoutId = null;
        this.isCommitting = false;
        this.renderStack();
      },
      reduceMotion ? 0 : UI_TIMING.CARD_FLY_ANIMATION_MS,
    );
  }

  /** Kararı ve kalan kart sayısını nazik canlı bölgeye yazar (opt-in `announce`). */
  private announceDecision(direction: SwipeDirection, card: SwipeableCardDefinition): void {
    if (!this.liveEl) return;
    const decision = i18next.t(
      direction === 'right' ? 'core:swipe.accepted' : 'core:swipe.rejected',
      { label: card.label ?? '' },
    );
    const left =
      this.cards.length > 0
        ? i18next.t('core:swipe.remaining', { count: this.cards.length })
        : i18next.t('core:swipe.done');
    this.liveEl.textContent = `${decision}. ${left}`;
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
