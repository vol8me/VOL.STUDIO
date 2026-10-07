import { playJuice } from '../motion/juice';
import { DisposableScope } from '../../lifecycle/DisposableScope';
import { pushBackHandler } from '../../platform/backNavigation';
import { FOCUSABLE_SELECTOR } from '../focus/focusable';
import { previousFocusTarget } from '../primitives/buttonBehavior';
import { emitUiSignal } from '../feedback/uiIntent';

export interface ModalOptions {
  /** Scrim'e (arka plan karartması) tıklayınca kapat. Varsayılan true. */
  closeOnScrimClick?: boolean;
  onClose?: () => void;
  /** Ek CSS class'ı — kullanıcı kendi stilini geçersiz kılmak için. */
  className?: string;
}

const BODY_LOCK_CLASS = 'vol-modal__body-locked';

/**
 * Açık modalların yığını (son = en üstteki). Her modal `document` üzerinde
 * keydown dinler, bu yüzden paylaşılan bir yığın olmadan iki modal açıkken
 * Escape ikisini birden kapatırdı; bu yığın yalnızca en üsttekinin işlemesini
 * sağlar.
 */
const openModals: Modal[] = [];

/**
 * Gövde kilidini açık modal YIĞINININ uzunluğundan TÜRETİR, ayrı bir sayaç
 * tutmaz. Sayaç tutulsaydı modal açıkken `destroy()` çağrılmadan sahne
 * yıkıldığında hiç azalmaz, sayfa kalıcı olarak kaydırılamaz hâlde kalırdı.
 * Yığın zaten tek doğruluk kaynağıdır; ikincisi ondan ayrışabilir.
 */
function syncBodyLock(): void {
  document.body.classList.toggle(BODY_LOCK_CLASS, openModals.length > 0);
}

/**
 * `scrim` ile arka planı karartıp odağı içeride hapseden katman. Panel'den
 * farkı: etkileşimi engeller (focus trap, Escape-kapat). Dahili kapat butonu
 * yok — her modal kendi aksiyon butonlarını içeriğinde tanımlar.
 */
export class Modal {
  readonly element: HTMLDivElement;
  private readonly scrim: HTMLDivElement;
  private readonly content: HTMLDivElement;
  private readonly onClose?: () => void;
  private previouslyFocused: (HTMLOrSVGElement & Element) | null = null;
  private boundKeydown: (event: KeyboardEvent) => void;
  private onScrimClick?: () => void;
  /** Yalnızca modal açıkken yaşar: yığın üyeliği + `document` keydown dinleyicisi. */
  private sessionScope: DisposableScope | null = null;
  /** `destroy()` sırasında kapanış sinyali yayılmaz (söküm kullanıcı eylemi değildir). */
  private destroying = false;

  constructor(options: ModalOptions = {}) {
    const { closeOnScrimClick = true, onClose } = options;
    this.onClose = onClose;

    this.element = document.createElement('div');
    this.element.className = ['vol-modal', options.className].filter(Boolean).join(' ');
    this.element.inert = true;

    this.scrim = document.createElement('div');
    this.scrim.className = 'vol-modal__scrim';
    if (closeOnScrimClick) {
      this.onScrimClick = () => this.close();
      this.scrim.addEventListener('click', this.onScrimClick);
    }

    this.content = document.createElement('div');
    this.content.className = 'vol-modal__content';
    this.content.setAttribute('role', 'dialog');
    this.content.setAttribute('aria-modal', 'true');

    this.element.appendChild(this.scrim);
    this.element.appendChild(this.content);

    this.boundKeydown = (event) => {
      if (openModals[openModals.length - 1] !== this) {
        return;
      }
      if (event.key === 'Escape') {
        this.close();
      } else if (event.key === 'Tab') {
        this.trapFocus(event);
      }
    };
  }

  add(node: { element: HTMLElement }): this {
    this.content.appendChild(node.element);
    return this;
  }

  open(): void {
    if (this.isOpen()) {
      return;
    }
    this.previouslyFocused = previousFocusTarget() as (HTMLOrSVGElement & Element) | null;
    this.element.classList.add('vol-modal--visible');
    this.signal('open');
    // Panel girişi: içerik hafif küçükten oturur (hareket azaltılmışta CSS çevirisiz).
    if (!this.element.classList.contains('vol-sheet')) playJuice(this.content, 'enter');
    this.element.inert = false;

    this.sessionScope = new DisposableScope();
    openModals.push(this);
    this.sessionScope.add({ dispose: () => this.removeFromStack() });
    this.sessionScope.addListener(window, 'keydown', this.boundKeydown as EventListener);
    this.sessionScope.addSubscription(
      pushBackHandler(() => {
        this.close();
        return true;
      }),
    );
    syncBodyLock();

    const firstFocusable = this.content.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    firstFocusable?.focus();
  }

  close(): void {
    // Yinelenen close() çağrısına (ör. scrim tıklaması Escape'le yarış) karşı
    // koruma — onClose'i tekrar tetikleyip `previouslyFocused`'a odağı çalar.
    if (!this.isOpen()) {
      return;
    }
    this.element.classList.remove('vol-modal--visible');
    this.element.inert = true;
    this.sessionScope?.dispose();
    this.sessionScope = null;
    syncBodyLock();
    if (!this.destroying) this.signal('close');
    this.previouslyFocused?.focus();
    this.onClose?.();
  }

  isOpen(): boolean {
    return !this.element.inert;
  }

  /** Açma/kapama sesi: tetikleyici (odağın önceki sahibi) kayıtlı bir UI kökündeyse niyet yayılır. */
  private signal(kind: 'open' | 'close'): void {
    const target = this.previouslyFocused;
    if (target instanceof Element && target.isConnected) {
      emitUiSignal({ kind, origin: 'Modal', target });
    }
  }

  destroy(): void {
    this.destroying = true;
    this.close();
    if (this.onScrimClick) {
      this.scrim.removeEventListener('click', this.onScrimClick);
    }
    this.element.remove();
  }

  private removeFromStack(): void {
    const index = openModals.indexOf(this);
    if (index !== -1) {
      openModals.splice(index, 1);
    }
  }

  private trapFocus(event: KeyboardEvent): void {
    const focusable = Array.from(this.content.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusable.length === 0) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
