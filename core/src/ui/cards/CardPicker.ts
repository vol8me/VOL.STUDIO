import { CardTile, type CardTileData, type CardTileOptions } from './CardTile';
import { DisposableScope } from '../../lifecycle/DisposableScope';
import { pushBackHandler } from '../../platform/backNavigation';
import { FOCUSABLE_SELECTOR } from '../focus/focusable';
import { ActivationIntentGuard } from '../focus/ActivationIntentGuard';

export interface CardPickerOptions {
  /** Panel başlığı. */
  title?: string;
  /** Başlığın altındaki kısa yönlendirme. */
  hint?: string;
  /** Ek CSS class'ı. */
  className?: string;
  /** Panel açıkken modal odak ve geri sınırı kurar; varsayılan false. */
  modal?: boolean;
  /** Her sunumda yeni klavye/işaretçi/kol seçim niyeti ister; varsayılan false. */
  requireFreshActivation?: boolean;
}

/**
 * `.vol-card-picker--leaving` CSS süresiyle (`--vol-transition-medium`,
 * 240ms) eşleşir. `hide()` `element.hidden = true`'yu bu kadar ERTELER —
 * aksi halde `display: none` anında uygulanır ve panel "birden kapanıyor"
 * gibi görünürdü (opacity/transform geçişine hiç zaman kalmazdı).
 */
export const HIDE_ANIMATION_MS = 240;

/**
 * Kart seçim panellerinin ortak tabanı — başlık, ipucu ve kart ızgarası.
 *
 * Kasıtlı olarak `Modal`'a BAĞLI DEĞİLDİR: yalnızca kendi panelini çizer.
 * `modal` odak ve geri sınırını opt-in kurar; karartma isteyen çağıran
 * paneli kendi Modal'ının içine yerleştirebilir.
 */
export abstract class CardPicker {
  readonly element: HTMLDivElement;
  protected readonly grid: HTMLDivElement;
  protected readonly footer: HTMLDivElement;
  private readonly titleElement: HTMLDivElement;
  private readonly hintElement: HTMLDivElement;
  private readonly tiles: CardTile[] = [];
  private visible = false;
  private hideTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly scope = new DisposableScope();
  private readonly modal: boolean;
  private readonly intentGuard?: ActivationIntentGuard;
  private modalScope: DisposableScope | null = null;
  private previousFocus: HTMLElement | null = null;

  constructor(options: CardPickerOptions = {}) {
    this.element = document.createElement('div');
    this.element.className = ['vol-card-picker', options.className].filter(Boolean).join(' ');
    this.element.setAttribute('role', 'dialog');
    this.element.hidden = true;
    this.modal = options.modal ?? false;
    if (this.modal) {
      this.element.setAttribute('aria-modal', 'true');
      this.element.setAttribute('inert', '');
      this.element.tabIndex = -1;
    }
    if (options.requireFreshActivation) {
      this.intentGuard = this.scope.addDestroyable(
        new ActivationIntentGuard(this.element, () => this.visible),
      );
    }
    this.scope.add({ dispose: () => this.closeModal() });

    const header = document.createElement('div');
    header.className = 'vol-card-picker__header';

    this.titleElement = document.createElement('div');
    this.titleElement.className = 'vol-card-picker__title';
    this.titleElement.textContent = options.title ?? '';
    header.appendChild(this.titleElement);

    this.hintElement = document.createElement('div');
    this.hintElement.className = 'vol-card-picker__hint';
    this.hintElement.textContent = options.hint ?? '';
    header.appendChild(this.hintElement);

    this.element.appendChild(header);

    this.grid = document.createElement('div');
    this.grid.className = 'vol-card-picker__grid';
    this.element.appendChild(this.grid);

    this.footer = document.createElement('div');
    this.footer.className = 'vol-card-picker__footer';
    this.element.appendChild(this.footer);
  }

  /**
   * Mantıksal görünürlük — `hide()` çağrıldığı ANDA `false` olur (çıkış
   * animasyonunun bitmesini BEKLEMEZ). Çağıranların "şu an açık mı" sorusu
   * her zaman senkron ve öngörülebilir kalsın diye — yalnızca DOM'un
   * `hidden` niteliği (görsel geçiş için) gecikmeli uygulanır.
   */
  isVisible(): boolean {
    return this.visible;
  }

  show(): void {
    this.cancelPendingHide();
    this.element.classList.remove('vol-card-picker--leaving');
    this.intentGuard?.reset();
    if (this.modal && !this.visible)
      this.previousFocus =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.visible = true;
    this.element.hidden = false;
    if (this.modal) this.openModal();
    this.startTileEnterAnimations();
    // İlk kartın aksiyon butonu odaklanır: seçim klavyeyle de yapılabilsin.
    const first = this.element.querySelector<HTMLButtonElement>('.vol-card__action');
    (first ?? (this.modal ? this.modalCandidates()[0] ?? this.element : null))?.focus();
  }

  protected startTileEnterAnimations(): void {
    if (this.tiles.length === 0) return;
    // Bir sonraki karede layout gerçekleştikten sonra class ekle ki
    // `hidden` katmandan yeni açılan panellerde animasyon 0. kareden başlasın.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        for (const tile of this.tiles) tile.startEnterAnimation();
      });
    });
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.intentGuard?.reset();
    this.closeModal();
    this.element.classList.add('vol-card-picker--leaving');
    this.hideTimeout = setTimeout(() => {
      this.hideTimeout = null;
      this.element.hidden = true;
      this.element.classList.remove('vol-card-picker--leaving');
    }, HIDE_ANIMATION_MS);
  }

  /**
   * `hide()`'ın ANİMASYONSUZ hali — `hidden` hemen uygulanır. Aynı paylaşılan
   * katmanda (ör. `games/vol-hell`'in tek `.vol-card-layer`'ı) BAŞKA bir
   * CardPicker hemen `show()` edilecekse bunu kullan: gecikmeli `hide()`
   * iki panelin flex konteynerde bir an üst üste binmesine/kaymasına yol
   * açar — katman zaten açık kalıyorsa (yalnızca İÇERİĞİ değişiyorsa) ayrı
   * bir çıkış animasyonuna gerek yoktur, yeni panelin giriş animasyonu
   * (`vol-card-picker-in`) geçişi zaten taşır.
   */
  hideImmediately(): void {
    this.cancelPendingHide();
    this.visible = false;
    this.intentGuard?.reset();
    this.closeModal();
    this.element.hidden = true;
    this.element.classList.remove('vol-card-picker--leaving');
  }

  destroy(): void {
    this.cancelPendingHide();
    this.visible = false;
    this.scope.dispose();
    this.clearTiles();
    this.element.remove();
  }

  private cancelPendingHide(): void {
    if (this.hideTimeout === null) return;
    clearTimeout(this.hideTimeout);
    this.hideTimeout = null;
  }

  protected setTitle(title: string): void {
    this.titleElement.textContent = title;
  }

  protected handleModalBack(): void {}

  private openModal(): void {
    this.element.removeAttribute('inert');
    if (this.modalScope) return;
    this.modalScope = new DisposableScope();
    this.modalScope.addSubscription(
      pushBackHandler(() => {
        this.handleModalBack();
        return true;
      }),
    );
    this.modalScope.addListener(document, 'keydown', (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.defaultPrevented || !this.isTopModal()) return;
      const candidates = this.modalCandidates();
      if (candidates.length === 0) {
        event.preventDefault();
        this.element.focus();
        return;
      }
      const first = candidates[0];
      const last = candidates[candidates.length - 1];
      const current = document.activeElement;
      if (
        !this.element.contains(current) ||
        (event.shiftKey ? current === first : current === last)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    });
    this.modalScope.addListener(document, 'focusin', (event: FocusEvent) => {
      if (
        this.isTopModal() &&
        event.target instanceof Node &&
        !this.element.contains(event.target)
      ) {
        (this.modalCandidates()[0] ?? this.element).focus();
      }
    });
  }

  private closeModal(): void {
    if (!this.modal) return;
    this.element.setAttribute('inert', '');
    this.modalScope?.dispose();
    this.modalScope = null;
    const previous = this.previousFocus;
    this.previousFocus = null;
    if (previous?.isConnected && !previous.closest('[inert]')) previous.focus();
  }

  private modalCandidates(): HTMLElement[] {
    return Array.from(this.element.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (element) => !element.closest('[inert]') && !element.hidden,
    );
  }

  private isTopModal(): boolean {
    const dialogs = Array.from(
      document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'),
    ).filter((dialog) => {
      for (let ancestor: HTMLElement | null = dialog; ancestor; ancestor = ancestor.parentElement) {
        if (ancestor.hidden || ancestor.inert || ancestor.hasAttribute('inert')) return false;
      }
      return true;
    });
    return dialogs[dialogs.length - 1] === this.element;
  }

  protected setHint(hint: string): void {
    this.hintElement.textContent = hint;
  }

  /** Izgaradaki kartları temizler (yeni teklif gösterilmeden önce). */
  protected clearTiles(): void {
    for (const tile of this.tiles) {
      tile.destroy();
    }
    this.tiles.length = 0;
  }

  /** Izgaraya kart ekler ve referansını temizlik için saklar. */
  protected addTile(data: CardTileData, options: Omit<CardTileOptions, 'data'> = {}): CardTile {
    const tile = new CardTile({ data, ...options });
    this.tiles.push(tile);
    this.grid.appendChild(tile.element);
    return tile;
  }
}
