import { DisposableScope } from '../../lifecycle/DisposableScope';
import { i18next } from '../../i18n/I18n';
import { inlineSign } from '../direction';
import { emitUiIntent } from '../feedback/uiIntent';
import { Tooltip } from '../overlays/Tooltip';

export interface ActionBarSlot {
  id: string;
  label: string;
  icon?: string | Node;
  /** Klavye tuşu (ör. "1", "q") — `enableKeyboardShortcuts` açıkken basınca slotu aktive eder; rozet olarak gösterilmez. */
  shortcut?: string;
  disabled?: boolean;
  /**
   * Slot şu an KULLANILAMAZ ve nedeni var (ör. "Yetersiz mana"). `disabled`dan farkı: slot odaklanabilir kalır, neden
   * odakta/uzun basışta/üzerine gelince söylenir, etkinleştirme reddedilir (`reject` niyeti + `onBlocked`). `setUnavailable`
   * ile sonradan değiştirilir.
   */
  unavailableReason?: string;
  /** true ise slot kalıcı "aktif" görsel durumda kalır (cooldown'dan farklı, açık/kapalı bir mod). setActive() ile de değiştirilebilir. */
  active?: boolean;
  /** 0-1 arası kalan bekleme süresi oranı (1 = bekliyor, 0 = hazır). Verilirse saat yönünde daralan gölge overlay gösterilir. */
  cooldownProgress?: number;
}

/** Etkinleştirmenin neden uygulanmadığı: bekleme sürüyor ya da slot nedenli kullanılamaz. */
export type ActionBarBlockReason = 'cooldown' | 'unavailable';

export interface ActionBarOptions {
  slots: ActionBarSlot[];
  onActivate: (id: string) => void;
  size?: number;
  /** true ise her slotun altında etiket metni gösterilir. Varsayılan false (label yalnızca aria-label olarak kalır). */
  showLabels?: boolean;
  /** true ise `shortcut` verilen slotlar için `window` keydown dinleyicisi kurulur (input odaktayken yok sayılır). Varsayılan false. */
  enableKeyboardShortcuts?: boolean;
  /** Çubuğun okuyucu adı. Verilmezse çeviriden gelir ("Eylemler") ve dil değişince yenilenir. */
  ariaLabel?: string;
  /**
   * Bekleyen ya da kullanılamaz bir slota basıldı: `onActivate` ÇAĞRILMAZ (soğuyan düğme `aria-disabled`dır, basış
   * eylem değildir). Oyun burada kendi "hazır değil" geri bildirimini (SFX, yanıp sönme) verir.
   */
  onBlocked?: (id: string, reason: ActionBarBlockReason) => void;
  /**
   * true ise her slota bir balon bağlanır: ad (+ kısayol), bekleyen slotta kalan süre, kullanılamazda neden. Fare üzerine
   * gelince, odakta ve dokunmada uzun basışla açılır. Varsayılan false.
   */
  showTooltips?: boolean;
  /** Balonların ekleneceği kapsayıcı (varsayılan `document.body`; UI kökü içinde tutmak için `uiRoot.element`). */
  tooltipContainer?: HTMLElement;
}

/**
 * Sabit sayıda büyük aksiyon düğmesinden oluşan yatay panel. BuildMenu'den farkı: sabit konumlu, `cooldownProgress` ile
 * bekleme gösterebilir.
 *
 * Sözleşme: kök `toolbar`dır ve TEK sekme durağı vardır (oklar/Home/End slotlar arasında gezinir, okuma yönünü izler);
 * etkinleştirme tek anlamsal niyet üretir (`press`, mod slotunda `toggle`); bekleyen/nedenli kullanılamaz slot eylem
 * çalıştırmaz, `reject` niyeti ve `onBlocked` verir. Programatik değişiklikler (`setCooldown`, `setActive`…) sessizdir.
 */
export class ActionBar {
  readonly element: HTMLDivElement;
  private readonly slotElements = new Map<string, HTMLButtonElement>();
  private readonly cooldownOverlays = new Map<string, HTMLDivElement>();
  private readonly cooldownTexts = new Map<string, HTMLSpanElement>();
  private readonly shortcuts = new Map<string, string>();
  private readonly labels = new Map<string, string>();
  private readonly cooling = new Map<string, number>();
  private readonly unavailable = new Map<string, string>();
  private readonly tooltips = new Map<string, Tooltip>();
  private readonly onActivateHandler: (id: string) => void;
  private readonly onBlockedHandler?: (id: string, reason: ActionBarBlockReason) => void;
  private readonly showLabels: boolean;
  private readonly customLabel: boolean;
  /** Dolaşma hedefi: Tab'ın indiği tek slot (son odaklanan; yoksa ilk odaklanabilir). */
  private activeId: string | null = null;
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
  private boundKeyDown: ((event: KeyboardEvent) => void) | null = null;
  private readonly onLanguageChanged = (): void => {
    if (!this.customLabel) this.element.setAttribute('aria-label', this.defaultLabel());
  };

  constructor(options: ActionBarOptions) {
    this.onActivateHandler = options.onActivate;
    this.onBlockedHandler = options.onBlocked;
    this.showLabels = options.showLabels ?? false;
    this.customLabel = options.ariaLabel !== undefined;

    this.element = document.createElement('div');
    this.element.className = 'vol-action-bar';
    this.element.setAttribute('role', 'toolbar');
    this.element.setAttribute('aria-orientation', 'horizontal');
    this.element.setAttribute('aria-label', options.ariaLabel ?? this.defaultLabel());
    if (options.size) {
      this.element.style.setProperty('--vol-action-bar-size', `${options.size}px`);
    }

    for (const slot of options.slots) {
      this.element.appendChild(this.buildSlot(slot, options));
      if (slot.shortcut) this.shortcuts.set(slot.shortcut.toLowerCase(), slot.id);
    }
    this.applyRovingTabindex();

    const onKeyDown = (event: KeyboardEvent): void => this.onToolbarKeyDown(event);
    const onFocusIn = (event: FocusEvent): void => {
      const id = (event.target as HTMLElement | null)?.dataset?.slotId;
      if (id !== undefined && id !== this.activeId) {
        this.activeId = id;
        this.applyRovingTabindex();
      }
    };
    this.scope.addListener(this.element, 'keydown', onKeyDown as EventListener);
    this.scope.addListener(this.element, 'focusin', onFocusIn as EventListener);
    i18next.on('languageChanged', this.onLanguageChanged);

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
    let remainingSeconds: number | undefined;
    if (totalSeconds !== undefined) {
      remainingSeconds = Math.ceil(clamped * totalSeconds);
      if (textEl) textEl.textContent = remainingSeconds > 0 ? String(remainingSeconds) : '';
    }
    this.syncCooling(id, clamped > 0, remainingSeconds);
  }

  setDisabled(id: string, disabled: boolean): void {
    const button = this.slotElements.get(id);
    if (!button) return;
    button.disabled = disabled;
    this.applyRovingTabindex();
  }

  /**
   * Slotu nedenli KULLANILAMAZ yapar (`reason` verilirse) ya da kaldırır. Sessizdir; durum değişince okuyucuya
   * `aria-disabled` ve balon metniyle bildirilir.
   */
  setUnavailable(id: string, reason: string | null): void {
    const button = this.slotElements.get(id);
    if (!button) return;
    if (reason) this.unavailable.set(id, reason);
    else this.unavailable.delete(id);
    this.syncAvailability(id);
  }

  /** Bir slotun kalıcı "aktif" (açık mod) görsel durumunu günceller — bkz. ActionBarSlot.active. */
  setActive(id: string, active: boolean): void {
    const button = this.slotElements.get(id);
    if (!button) return;
    button.classList.toggle('vol-action-bar__slot--active', active);
    button.setAttribute('aria-pressed', String(active));
  }

  destroy(): void {
    this.scope.dispose();
    i18next.off('languageChanged', this.onLanguageChanged);
    for (const tooltip of this.tooltips.values()) tooltip.destroy();
    this.tooltips.clear();
    if (this.boundKeyDown) window.removeEventListener('keydown', this.boundKeyDown);
    this.element.remove();
  }

  private defaultLabel(): string {
    return i18next.t('core:actionBar.label');
  }

  /** Etkinleştirilemeyen slotun nedeni; yoksa `null`. Bekleme, kullanılamazlıktan önce söylenir. */
  private blockReason(id: string): ActionBarBlockReason | null {
    if (this.cooling.has(id)) return 'cooldown';
    if (this.unavailable.has(id)) return 'unavailable';
    return null;
  }

  private syncCooling(id: string, cooling: boolean, remainingSeconds: number | undefined): void {
    if (!cooling) {
      if (this.cooling.delete(id)) this.syncAvailability(id);
      return;
    }
    const previous = this.cooling.get(id);
    // Saniye bilinmiyorsa 0 sayılır; balon yalnız değer değişince yeniden yazılır.
    const next = remainingSeconds ?? 0;
    if (previous === next) return;
    this.cooling.set(id, next);
    this.syncAvailability(id);
  }

  /**
   * Bekleme/kullanılamazlık durumuna göre `aria-disabled`, sınıf ve açıklama metnini birlikte günceller. Soğurken slot
   * okuyucuya "kullanılamaz" görünür; öznitelikler yalnız değişince yazılır (`setCooldown` her karede çağrılabilir).
   */
  private syncAvailability(id: string): void {
    const button = this.slotElements.get(id);
    if (!button) return;
    const blocked = this.cooling.has(id) || this.unavailable.has(id);
    const value = String(blocked);
    if (
      button.getAttribute('aria-disabled') !== value &&
      (blocked || button.hasAttribute('aria-disabled'))
    ) {
      button.setAttribute('aria-disabled', value);
    }
    button.classList.toggle('vol-action-bar__slot--unavailable', this.unavailable.has(id));
    if (this.tooltips.size > 0) {
      this.tooltips.get(id)?.setText(this.tooltipText(id, this.detailText(id)));
      return;
    }
    // Balon yoksa neden `aria-description` ile söylenir. Geri sayım saniyesi YAZILMAZ: her saniye değişen açıklama
    // okuyucuyu boğar; bekleme zaten `aria-disabled` ile bildirilir.
    const reason = this.unavailable.get(id) ?? null;
    if (reason) {
      if (button.getAttribute('aria-description') !== reason) {
        button.setAttribute('aria-description', reason);
      }
    } else if (button.hasAttribute('aria-description')) {
      button.removeAttribute('aria-description');
    }
  }

  /** Engelin nedeni: bekleyen slotta kalan süre, nedenli kullanılamazda host'un metni; engel yoksa `null`. */
  private detailText(id: string): string | null {
    const cooling = this.cooling.get(id);
    if (cooling !== undefined) {
      return cooling > 0 ? i18next.t('core:actionBar.remaining', { seconds: cooling }) : null;
    }
    return this.unavailable.get(id) ?? null;
  }

  private tooltipText(id: string, detail: string | null): string {
    const label = this.labels.get(id) ?? id;
    const shortcut = [...this.shortcuts].find(([, slotId]) => slotId === id)?.[0];
    const name = shortcut ? `${label} [${shortcut.toUpperCase()}]` : label;
    return detail ? `${name}: ${detail}` : name;
  }

  /** Odaklanabilir (yerel olarak devre dışı olmayan) slotlar, DOM sırasıyla. */
  private focusableSlots(): HTMLButtonElement[] {
    return [...this.slotElements.values()].filter((button) => !button.disabled);
  }

  /** Tek slot `tabindex=0` alır: son odaklanan, yoksa ilk odaklanabilir. */
  private applyRovingTabindex(): void {
    const focusable = this.focusableSlots();
    const active =
      focusable.find((button) => button.dataset.slotId === this.activeId) ?? focusable[0];
    for (const button of this.slotElements.values()) button.tabIndex = button === active ? 0 : -1;
  }

  private onToolbarKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    const current = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
      '.vol-action-bar__slot',
    );
    if (!current) return;
    const slots = this.focusableSlots();
    const at = slots.indexOf(current);
    if (at < 0) return;
    // Yatay çubukta "sağ" okuma yönüne bağlıdır: RTL'de sol ok sonraki slottur.
    const sign = inlineSign(this.element);
    let next: HTMLButtonElement | undefined;
    if (event.key === 'ArrowRight') next = slots[at + sign];
    else if (event.key === 'ArrowLeft') next = slots[at - sign];
    else if (event.key === 'Home') next = slots[0];
    else if (event.key === 'End') next = slots[slots.length - 1];
    else return;
    // Uçta kalınsa olay yine tüketilir: ok tuşu sayfayı kaydırmasın.
    event.preventDefault();
    next?.focus();
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    // input/textarea/contenteditable odaktayken kısayollar yazıyı kesmemeli
    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    )
      return;
    // Sistem/tarayıcı kısayolları (Ctrl+Q…) ve IME bileşimi eylem değildir; basılı tutma otomatik tekrarı yeni eylem sayılmaz.
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.repeat) return;

    const id = this.shortcuts.get(event.key.toLowerCase());
    if (!id) return;
    const button = this.slotElements.get(id);
    if (!button || button.disabled) return;

    event.preventDefault();
    this.activate(id, button, event);
  }

  /**
   * Tek etkinleştirme yolu (tıklama, kısayol, kol A): engelliyse `reject` niyeti ve `onBlocked`, değilse tek `press`/`toggle`
   * niyeti ve `onActivate`.
   */
  private activate(id: string, button: HTMLButtonElement, event: Event): void {
    const reason = this.blockReason(id);
    if (reason) {
      // Hedef çubuğun kendisi: `aria-disabled` slot niyet üretmez, çubuk ise reddi yayabilir.
      emitUiIntent({ kind: 'reject', origin: 'ActionBar', target: this.element, event });
      this.onBlockedHandler?.(id, reason);
      return;
    }
    emitUiIntent({
      kind: button.hasAttribute('aria-pressed') ? 'toggle' : 'press',
      origin: 'ActionBar',
      target: button,
      event,
      defaultHaptic: 'tap',
    });
    this.onActivateHandler(id);
  }

  private buildSlot(slot: ActionBarSlot, options: ActionBarOptions): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'vol-action-bar__slot';
    button.dataset.slotId = slot.id;
    button.classList.toggle('vol-action-bar__slot--active', Boolean(slot.active));
    button.disabled = Boolean(slot.disabled);
    button.setAttribute('aria-label', slot.label);
    this.labels.set(slot.id, slot.label);
    // Açık/kapalı mod taşıyan slot açma-kapama düğmesidir: durum renk dışında da duyulur.
    if (slot.active !== undefined) button.setAttribute('aria-pressed', String(slot.active));
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

    const onClick = (event: MouseEvent): void => this.activate(slot.id, button, event);
    button.addEventListener('click', onClick);
    this.scope.add({ dispose: () => button.removeEventListener('click', onClick) });

    this.slotElements.set(slot.id, button);

    if (options.showTooltips) {
      this.tooltips.set(
        slot.id,
        new Tooltip(button, slot.label, { container: options.tooltipContainer }),
      );
    }
    // Başlangıç durumu: bekleme/neden verilmişse `aria-disabled` ve balon metni baştan doğrudur.
    if (slot.unavailableReason) this.unavailable.set(slot.id, slot.unavailableReason);
    if ((slot.cooldownProgress ?? 0) > 0) this.cooling.set(slot.id, 0);
    this.syncAvailability(slot.id);
    return button;
  }
}
