import { i18next } from '../../systems/I18n';

export interface ActionBarSlot {
  id: string;
  label: string;
  icon?: string | Node;
  /** Klavye tuşu (ör. "1", "q") — `enableKeyboardShortcuts` açıkken basınca slotu aktive eder; rozet olarak gösterilmez. */
  shortcut?: string;
  disabled?: boolean;
  /** true ise slot kalıcı "aktif" görsel durumda kalır (cooldown'dan farklı, açık/kapalı bir mod). setActive() ile de değiştirilebilir. */
  active?: boolean;
  /** 0-1 arası kalan bekleme süresi oranı (1 = bekliyor, 0 = hazır). Verilirse saat yönünde daralan gölge overlay gösterilir. */
  cooldownProgress?: number;
}

export interface ActionBarOptions {
  slots: ActionBarSlot[];
  onActivate: (id: string) => void;
  size?: number;
  /** true ise her slotun altında etiket metni gösterilir. Varsayılan false (label yalnızca aria-label olarak kalır). */
  showLabels?: boolean;
  /** true ise `shortcut` verilen slotlar için `window` keydown dinleyicisi kurulur (input odaktayken yok sayılır). Varsayılan false. */
  enableKeyboardShortcuts?: boolean;
}

/** Sabit sayıda büyük aksiyon düğmesinden oluşan yatay panel. BuildMenu'den farkı: sabit konumlu, `cooldownProgress` ile bekleme gösterebilir. */
export class ActionBar {
  readonly element: HTMLDivElement;
  private readonly slotElements = new Map<string, HTMLButtonElement>();
  private readonly cooldownOverlays = new Map<string, HTMLDivElement>();
  private readonly cooldownTexts = new Map<string, HTMLSpanElement>();
  private readonly shortcuts = new Map<string, string>();
  private readonly onActivateHandler: (id: string) => void;
  private readonly showLabels: boolean;
  private readonly cleanups: (() => void)[] = [];
  private boundKeyDown: ((event: KeyboardEvent) => void) | null = null;

  constructor(options: ActionBarOptions) {
    this.onActivateHandler = options.onActivate;
    this.showLabels = options.showLabels ?? false;

    this.element = document.createElement('div');
    this.element.className = 'vol-action-bar';
    if (options.size) {
      this.element.style.setProperty('--vol-action-bar-size', `${options.size}px`);
    }

    for (const slot of options.slots) {
      this.element.appendChild(this.buildSlot(slot));
      if (slot.shortcut) this.shortcuts.set(slot.shortcut.toLowerCase(), slot.id);
    }

    if (options.enableKeyboardShortcuts && this.shortcuts.size > 0) {
      this.boundKeyDown = (event) => this.handleKeyDown(event);
      window.addEventListener('keydown', this.boundKeyDown);
    }
  }

  /** Bir slotun cooldown oranını günceller (0-1). `totalSeconds` verilirse kalan saniye de metin olarak gösterilir. Her karede çağrılabilecek kadar ucuzdur (DOM yeniden oluşturmaz). */
  setCooldown(id: string, progress: number, totalSeconds?: number): void {
    const overlay = this.cooldownOverlays.get(id);
    if (!overlay) return;
    const clamped = Math.max(0, Math.min(1, progress));
    overlay.style.setProperty('--vol-action-bar-cooldown', String(clamped));
    overlay.classList.toggle('vol-action-bar__cooldown--active', clamped > 0);

    const textEl = this.cooldownTexts.get(id);
    if (textEl && totalSeconds !== undefined) {
      const remainingSeconds = Math.ceil(clamped * totalSeconds);
      textEl.textContent = remainingSeconds > 0 ? String(remainingSeconds) : '';
    }
  }

  setDisabled(id: string, disabled: boolean): void {
    const button = this.slotElements.get(id);
    if (button) button.disabled = disabled;
  }

  /** Bir slotun kalıcı "aktif" (açık mod) görsel durumunu günceller — bkz. ActionBarSlot.active. */
  setActive(id: string, active: boolean): void {
    const button = this.slotElements.get(id);
    if (button) button.classList.toggle('vol-action-bar__slot--active', active);
  }

  destroy(): void {
    for (const cleanup of this.cleanups) cleanup();
    if (this.boundKeyDown) window.removeEventListener('keydown', this.boundKeyDown);
    this.element.remove();
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    // input/textarea/contenteditable odaktayken kısayollar yazıyı kesmemeli
    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    )
      return;

    const id = this.shortcuts.get(event.key.toLowerCase());
    if (!id) return;
    const button = this.slotElements.get(id);
    if (!button || button.disabled) return;

    event.preventDefault();
    this.onActivateHandler(id);
  }

  private buildSlot(slot: ActionBarSlot): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'vol-action-bar__slot';
    button.classList.toggle('vol-action-bar__slot--active', Boolean(slot.active));
    button.disabled = Boolean(slot.disabled);
    button.setAttribute('aria-label', slot.label);
    if (slot.shortcut) {
      button.setAttribute('aria-keyshortcuts', slot.shortcut);
    }

    if (slot.icon) {
      const iconSlot = document.createElement('span');
      iconSlot.className = 'vol-action-bar__icon';
      if (typeof slot.icon === 'string') {
        iconSlot.textContent = slot.icon;
      } else {
        iconSlot.appendChild(slot.icon.cloneNode(true));
      }
      button.appendChild(iconSlot);
    } else {
      const initial = document.createElement('span');
      initial.className = 'vol-action-bar__initial';
      initial.textContent = slot.label.slice(0, 2).toLocaleUpperCase(i18next.language ?? 'tr');
      button.appendChild(initial);
    }

    if (this.showLabels) {
      const labelEl = document.createElement('span');
      labelEl.className = 'vol-action-bar__label';
      labelEl.textContent = slot.label;
      button.appendChild(labelEl);
    }

    const overlay = document.createElement('div');
    overlay.className = 'vol-action-bar__cooldown';
    overlay.style.setProperty('--vol-action-bar-cooldown', String(slot.cooldownProgress ?? 0));
    if ((slot.cooldownProgress ?? 0) > 0) {
      overlay.classList.add('vol-action-bar__cooldown--active');
    }
    const cooldownText = document.createElement('span');
    cooldownText.className = 'vol-action-bar__cooldown-text';
    overlay.appendChild(cooldownText);
    this.cooldownTexts.set(slot.id, cooldownText);
    button.appendChild(overlay);
    this.cooldownOverlays.set(slot.id, overlay);

    const onClick = (): void => {
      this.onActivateHandler(slot.id);
    };
    button.addEventListener('click', onClick);
    this.cleanups.push(() => button.removeEventListener('click', onClick));

    this.slotElements.set(slot.id, button);
    return button;
  }
}
