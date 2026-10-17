import { DisposableScope } from '../../lifecycle/DisposableScope';
import { i18next } from '../../i18n/I18n';
import { inlineSign } from '../direction';
import { emitUiIntent } from '../feedback/uiIntent';
import { pickDirectionalTarget, type NavDirection } from '../focus/directional';
import { Tooltip } from '../overlays/Tooltip';

export interface BuildMenuItem {
  id: string;
  icon: string | Node;
  label: string;
  /** Maliyet metni (örn. "50 Odun"); verilmezse maliyet satırı gösterilmez. */
  cost?: string;
  /** Klavye kısayolu köşede küçük bir rozet olarak gösterilir (örn. "Q"). */
  hotkey?: string;
  disabled?: boolean;
  /**
   * Öğe şu an KULLANILAMAZ ve nedeni var (ör. "Yetersiz odun"). `disabled`dan farkı: öğe odaklanabilir kalır, neden
   * odakta/uzun basışta/üzerine gelince söylenir, seçim reddedilir (`reject` niyeti + `onBlocked`). `setItemUnavailable`
   * ile sonradan değiştirilir. Kaynak defteri (altın/odun) sunumda tutulmaz: karar ve metin host'undur.
   */
  unavailableReason?: string;
  onSelect: () => void;
  /** Seçili öğeye tekrar tıklanınca (inşa modunu iptal etmek için) tetiklenir. Verilmezse iptal yine olur, sadece bildirim yapılmaz. */
  onDeselect?: () => void;
}

export interface BuildMenuOptions {
  items: BuildMenuItem[];
  /** Ek CSS class'ı — kullanıcı kendi stilini geçersiz kılmak için. */
  className?: string;
  /** Grubun okuyucu adı. Verilmezse çeviriden gelir ("İnşa menüsü") ve dil değişince yenilenir. */
  ariaLabel?: string;
  /** Nedenli kullanılamaz bir öğeye basıldı: `onSelect` çağrılmaz; oyun kendi "yapılamaz" geri bildirimini verir. */
  onBlocked?: (id: string, reason: string) => void;
  /**
   * true ise her öğeye bir balon bağlanır (ad, maliyet, kısayol, neden) ve yerel `title` kalkar. Fare üzerine gelince, odakta
   * ve dokunmada uzun basışla açılır. Varsayılan false (yerel `title`).
   */
  showTooltips?: boolean;
  /** Balonların ekleneceği kapsayıcı (varsayılan `document.body`; UI kökü içinde tutmak için `uiRoot.element`). */
  tooltipContainer?: HTMLElement;
}

/**
 * Grid halinde inşa/üretim seçenekleri. Bir öğeye tıklamak seçili görünüme geçirir; seçili öğeye tekrar tıklamak seçimi iptal eder (`onSelect` tekrar çağrılmaz).
 *
 * Sözleşme: TEK sekme durağı (ok tuşları ızgarada uzamsal gezinir: sağ/sol okuma yönünü izler, yukarı/aşağı görünen
 * satıra göre; Home/End ilk/son); seçim tek anlamsal niyet üretir (`select`, iptal `cancel`); nedenli kullanılamaz öğe
 * `reject` niyeti ve `onBlocked` verir, `onSelect` çalıştırmaz. Programatik değişiklikler (`selectItem`,
 * `clearSelection`, `setItemUnavailable`) sessizdir.
 */
export class BuildMenu {
  readonly element: HTMLDivElement;
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly itemById = new Map<string, BuildMenuItem>();
  private readonly unavailable = new Map<string, string>();
  private readonly tooltips = new Map<string, Tooltip>();
  private readonly onBlockedHandler?: (id: string, reason: string) => void;
  private readonly customLabel: boolean;
  private readonly useTooltips: boolean;
  private selectedId: string | null = null;
  /** Dolaşma hedefi: Tab'ın indiği tek öğe (son odaklanan; yoksa ilk odaklanabilir). */
  private activeId: string | null = null;
  private readonly scope = new DisposableScope();
  private readonly onLanguageChanged = (): void => {
    if (!this.customLabel) this.element.setAttribute('aria-label', this.defaultLabel());
  };

  constructor(options: BuildMenuOptions) {
    this.onBlockedHandler = options.onBlocked;
    this.customLabel = options.ariaLabel !== undefined;
    this.useTooltips = options.showTooltips ?? false;

    this.element = document.createElement('div');
    this.element.className = ['vol-build-menu', options.className].filter(Boolean).join(' ');
    this.element.setAttribute('role', 'group');
    this.element.setAttribute('aria-label', options.ariaLabel ?? this.defaultLabel());

    for (const item of options.items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'vol-build-menu__item';
      button.dataset.itemId = item.id;
      button.disabled = Boolean(item.disabled);
      button.setAttribute('aria-label', item.cost ? `${item.label}, ${item.cost}` : item.label);
      if (!this.useTooltips) button.title = item.label;
      // Seçim açma-kapama niteliğindedir (aynı öğeye tekrar basmak kaldırır): seçili durum okuyucuya da duyulur.
      button.setAttribute('aria-pressed', 'false');

      const iconWrapper = document.createElement('span');
      iconWrapper.className = 'vol-build-menu__icon';
      iconWrapper.setAttribute('aria-hidden', 'true');
      if (typeof item.icon === 'string') {
        iconWrapper.textContent = item.icon;
      } else {
        iconWrapper.appendChild(item.icon);
      }
      button.appendChild(iconWrapper);

      const labelSpan = document.createElement('span');
      labelSpan.className = 'vol-build-menu__label';
      labelSpan.textContent = item.label;
      button.appendChild(labelSpan);

      if (item.cost) {
        const costSpan = document.createElement('span');
        costSpan.className = 'vol-build-menu__cost';
        costSpan.textContent = item.cost;
        button.appendChild(costSpan);
      }

      if (item.hotkey) {
        const hotkeySpan = document.createElement('span');
        hotkeySpan.className = 'vol-build-menu__hotkey';
        hotkeySpan.setAttribute('aria-hidden', 'true');
        hotkeySpan.textContent = item.hotkey;
        button.appendChild(hotkeySpan);
      }

      const onClick = (event: MouseEvent): void => this.activate(item.id, event);
      this.scope.addListener(button, 'click', onClick as EventListener);

      this.buttons.set(item.id, button);
      this.itemById.set(item.id, item);
      this.element.appendChild(button);

      if (this.useTooltips) {
        this.tooltips.set(
          item.id,
          new Tooltip(button, item.label, { container: options.tooltipContainer }),
        );
      }
      if (item.unavailableReason) this.unavailable.set(item.id, item.unavailableReason);
      this.syncAvailability(item.id);
    }
    this.applyRovingTabindex();

    this.scope.addListener(this.element, 'keydown', ((event: KeyboardEvent) =>
      this.onKeyDown(event)) as EventListener);
    this.scope.addListener(this.element, 'focusin', ((event: FocusEvent) => {
      const id = (event.target as HTMLElement | null)?.dataset?.itemId;
      if (id !== undefined && id !== this.activeId) {
        this.activeId = id;
        this.applyRovingTabindex();
      }
    }) as EventListener);
    i18next.on('languageChanged', this.onLanguageChanged);
  }

  setItemDisabled(id: string, disabled: boolean): void {
    const button = this.buttons.get(id);
    if (!button) return;
    button.disabled = disabled;
    this.applyRovingTabindex();
  }

  /**
   * Öğeyi nedenli KULLANILAMAZ yapar (`reason` verilirse) ya da kaldırır. Sessizdir; durum `aria-disabled` ve balon/açıklama
   * metniyle bildirilir.
   */
  setItemUnavailable(id: string, reason: string | null): void {
    if (!this.buttons.has(id)) return;
    if (reason) this.unavailable.set(id, reason);
    else this.unavailable.delete(id);
    this.syncAvailability(id);
  }

  /** Bir öğeyi programatik olarak seçili işaretler. */
  selectItem(id: string): void {
    this.clearSelection();
    this.selectedId = id;
    const selected = this.buttons.get(id);
    selected?.classList.add('vol-build-menu__item--selected');
    selected?.setAttribute('aria-pressed', 'true');
  }

  clearSelection(): void {
    if (this.selectedId) {
      const previous = this.buttons.get(this.selectedId);
      previous?.classList.remove('vol-build-menu__item--selected');
      previous?.setAttribute('aria-pressed', 'false');
    }
    this.selectedId = null;
  }

  destroy(): void {
    this.scope.dispose();
    i18next.off('languageChanged', this.onLanguageChanged);
    for (const tooltip of this.tooltips.values()) tooltip.destroy();
    this.tooltips.clear();
    this.element.remove();
  }

  private defaultLabel(): string {
    return i18next.t('core:buildMenu.label');
  }

  /** Tek etkinleştirme yolu (fare, dokunma, klavye, kol A): engelliyse `reject`, değilse tek `select`/`cancel` niyeti. */
  private activate(id: string, event: Event): void {
    const item = this.itemById.get(id);
    const button = this.buttons.get(id);
    if (!item || !button) return;
    const reason = this.unavailable.get(id);
    if (reason) {
      // Hedef menünün kendisi: `aria-disabled` öğe niyet üretmez, menü ise reddi yayabilir.
      emitUiIntent({ kind: 'reject', origin: 'BuildMenu', target: this.element, event });
      this.onBlockedHandler?.(id, reason);
      return;
    }
    if (this.selectedId === id) {
      emitUiIntent({ kind: 'cancel', origin: 'BuildMenu', target: button, event });
      this.clearSelection();
      item.onDeselect?.();
      return;
    }
    emitUiIntent({
      kind: 'select',
      origin: 'BuildMenu',
      target: button,
      event,
      defaultHaptic: 'tap',
    });
    this.selectItem(id);
    item.onSelect();
  }

  /** Neden/aria-disabled/sınıf/balon metni birlikte güncellenir; öznitelikler yalnız değişince yazılır. */
  private syncAvailability(id: string): void {
    const button = this.buttons.get(id);
    const item = this.itemById.get(id);
    if (!button || !item) return;
    const reason = this.unavailable.get(id);
    const value = String(reason !== undefined);
    if (
      button.getAttribute('aria-disabled') !== value &&
      (reason !== undefined || button.hasAttribute('aria-disabled'))
    ) {
      button.setAttribute('aria-disabled', value);
    }
    button.classList.toggle('vol-build-menu__item--unavailable', reason !== undefined);
    if (this.useTooltips) {
      const name = item.hotkey ? `${item.label} [${item.hotkey}]` : item.label;
      const parts = [name, item.cost, reason].filter(Boolean);
      this.tooltips.get(id)?.setText(parts.join(' — '));
    } else if (reason) {
      if (button.getAttribute('aria-description') !== reason) {
        button.setAttribute('aria-description', reason);
      }
    } else if (button.hasAttribute('aria-description')) {
      button.removeAttribute('aria-description');
    }
  }

  /** Odaklanabilir (yerel olarak devre dışı olmayan) öğeler, DOM sırasıyla. */
  private focusableItems(): HTMLButtonElement[] {
    return [...this.buttons.values()].filter((button) => !button.disabled);
  }

  /** Tek öğe `tabindex=0` alır: son odaklanan, yoksa ilk odaklanabilir. */
  private applyRovingTabindex(): void {
    const focusable = this.focusableItems();
    const active =
      focusable.find((button) => button.dataset.itemId === this.activeId) ?? focusable[0];
    for (const button of this.buttons.values()) button.tabIndex = button === active ? 0 : -1;
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    const current = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
      '.vol-build-menu__item',
    );
    if (!current) return;
    const items = this.focusableItems();
    if (!items.includes(current)) return;

    let next: HTMLButtonElement | undefined;
    if (event.key === 'Home') next = items[0];
    else if (event.key === 'End') next = items[items.length - 1];
    else {
      // Uzamsal gezinme görünen yerleşime bakar: sağ ok her iki yazı yönünde de görünür sağdaki öğedir.
      const direction: NavDirection | null =
        event.key === 'ArrowRight'
          ? 'right'
          : event.key === 'ArrowLeft'
            ? 'left'
            : event.key === 'ArrowDown'
              ? 'down'
              : event.key === 'ArrowUp'
                ? 'up'
                : null;
      if (!direction) return;
      const sign = inlineSign(this.element);
      next = this.neighbor(items, current, direction, sign);
    }
    event.preventDefault();
    next?.focus();
  }

  /**
   * Ok yönündeki komşu. Sütun sayısı CSS'in `auto-fill`ine bağlıdır; bu yüzden GÖRÜNEN yerleşimden (kutu merkezleri)
   * bulunur. Yerleşim yoksa (kutular sıfır boyutlu: gizli/ölçüm dışı) doğrusal sıraya düşer.
   */
  private neighbor(
    items: HTMLButtonElement[],
    from: HTMLButtonElement,
    direction: NavDirection,
    sign: 1 | -1,
  ): HTMLButtonElement | undefined {
    const rects = items.map((element) => ({ element, rect: element.getBoundingClientRect() }));
    const origin = from.getBoundingClientRect();
    const laidOut = rects.some(({ rect }) => rect.width > 0 && rect.height > 0);
    if (laidOut) {
      return (
        pickDirectionalTarget(
          origin,
          rects.filter(({ element }) => element !== from),
          direction,
        ) ?? undefined
      );
    }
    // Doğrusal yedek: aşağı sonraki, yukarı önceki; yatayda okuma yönü (RTL'de sol ok sonraki).
    const at = items.indexOf(from);
    const forward =
      direction === 'down'
        ? true
        : direction === 'up'
          ? false
          : (direction === 'right') === (sign === 1);
    return items[at + (forward ? 1 : -1)];
  }
}
