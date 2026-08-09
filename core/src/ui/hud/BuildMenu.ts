export interface BuildMenuItem {
  id: string;
  icon: string | Node;
  label: string;
  /** Maliyet metni (örn. "50 Odun"); verilmezse maliyet satırı gösterilmez. */
  cost?: string;
  /** Klavye kısayolu köşede küçük bir rozet olarak gösterilir (örn. "Q"). */
  hotkey?: string;
  disabled?: boolean;
  onSelect: () => void;
  /** Seçili öğeye tekrar tıklanınca (inşa modunu iptal etmek için) tetiklenir. Verilmezse iptal yine olur, sadece bildirim yapılmaz. */
  onDeselect?: () => void;
}

export interface BuildMenuOptions {
  items: BuildMenuItem[];
  /** Ek CSS class'ı — kullanıcı kendi stilini geçersiz kılmak için. */
  className?: string;
}

/** Grid halinde inşa/üretim seçenekleri. Bir öğeye tıklamak seçili görünüme geçirir; seçili öğeye tekrar tıklamak seçimi iptal eder (`onSelect` tekrar çağrılmaz). */
export class BuildMenu {
  readonly element: HTMLDivElement;
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly boundClicks = new Map<string, () => void>();
  private selectedId: string | null = null;

  constructor(options: BuildMenuOptions) {
    this.element = document.createElement('div');
    this.element.className = ['vol-build-menu', options.className].filter(Boolean).join(' ');
    this.element.setAttribute('role', 'group');

    for (const item of options.items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'vol-build-menu__item';
      button.disabled = Boolean(item.disabled);
      button.setAttribute('aria-label', item.cost ? `${item.label}, ${item.cost}` : item.label);
      button.title = item.label;

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

      const onClick = (): void => {
        if (this.selectedId === item.id) {
          this.clearSelection();
          item.onDeselect?.();
          return;
        }
        this.selectItem(item.id);
        item.onSelect();
      };
      button.addEventListener('click', onClick);
      this.boundClicks.set(item.id, onClick);

      this.buttons.set(item.id, button);
      this.element.appendChild(button);
    }
  }

  setItemDisabled(id: string, disabled: boolean): void {
    const button = this.buttons.get(id);
    if (button) button.disabled = disabled;
  }

  /** Bir öğeyi programatik olarak seçili işaretler. */
  selectItem(id: string): void {
    if (this.selectedId) {
      this.buttons.get(this.selectedId)?.classList.remove('vol-build-menu__item--selected');
    }
    this.selectedId = id;
    this.buttons.get(id)?.classList.add('vol-build-menu__item--selected');
  }

  clearSelection(): void {
    if (this.selectedId) {
      this.buttons.get(this.selectedId)?.classList.remove('vol-build-menu__item--selected');
    }
    this.selectedId = null;
  }

  destroy(): void {
    for (const [id, button] of this.buttons) {
      const onClick = this.boundClicks.get(id);
      if (onClick) button.removeEventListener('click', onClick);
    }
    this.element.remove();
  }
}
