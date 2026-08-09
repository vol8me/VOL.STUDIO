import { Popup, type PopupPlacement } from './Popup';

export interface ContextMenuItem {
  label: string;
  onSelect: () => void;
  /** SVG veya metin/emoji ikon; item'ın soluna yerleşir. */
  icon?: string | Node;
  danger?: boolean;
  disabled?: boolean;
}

export interface ContextMenuSeparator {
  type: 'separator';
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator;

export interface ContextMenuOptions {
  placement?: PopupPlacement;
  /** Popup'ın ekleneceği kapsayıcı. Varsayılan document.body. */
  container?: HTMLElement;
  /** Ek CSS class'ı — kullanıcı kendi stilini geçersiz kılmak için. */
  className?: string;
}

function isSeparator(entry: ContextMenuEntry): entry is ContextMenuSeparator {
  return 'type' in entry && entry.type === 'separator';
}

/**
 * Bir tetikleyici elemente (ör. "..." IconButton) anchored aksiyon listesi,
 * Popup üzerine kurulu. `{ type: 'separator' }` girişleri ayırıcı çizgi ekler
 * (odaklanamaz/tıklanamaz, navigasyonda atlanır).
 */
export class ContextMenu {
  readonly popup: Popup;
  private readonly itemButtons: HTMLButtonElement[] = [];
  private readonly boundClicks: (() => void)[] = [];
  private readonly boundKeydowns: ((event: KeyboardEvent) => void)[] = [];
  private boundToggle: () => void;
  private readonly target: HTMLElement;

  constructor(target: HTMLElement, entries: ContextMenuEntry[], options: ContextMenuOptions = {}) {
    this.target = target;
    this.popup = new Popup(target, {
      placement: options.placement ?? 'bottom-end',
      onClose: () => this.target.setAttribute('aria-expanded', 'false'),
      container: options.container,
    });
    this.popup.element.classList.add('vol-context-menu');
    if (options.className) {
      this.popup.element.classList.add(options.className);
    }
    this.popup.element.setAttribute('role', 'menu');

    this.target.setAttribute('aria-haspopup', 'menu');
    this.target.setAttribute('aria-expanded', 'false');

    for (const entry of entries) {
      if (isSeparator(entry)) {
        const separator = document.createElement('div');
        separator.className = 'vol-context-menu__separator';
        separator.setAttribute('role', 'separator');
        this.popup.element.appendChild(separator);
        continue;
      }

      const index = this.itemButtons.length;
      const itemButton = document.createElement('button');
      itemButton.type = 'button';
      itemButton.className = 'vol-context-menu__item';
      if (entry.danger) {
        itemButton.classList.add('vol-context-menu__item--danger');
      }

      if (entry.icon) {
        const iconWrapper = document.createElement('span');
        iconWrapper.className = 'vol-context-menu__item-icon';
        if (typeof entry.icon === 'string') {
          iconWrapper.textContent = entry.icon;
        } else {
          iconWrapper.appendChild(entry.icon);
        }
        itemButton.appendChild(iconWrapper);
      }

      const labelSpan = document.createElement('span');
      labelSpan.textContent = entry.label;
      itemButton.appendChild(labelSpan);

      itemButton.disabled = Boolean(entry.disabled);
      itemButton.setAttribute('role', 'menuitem');
      itemButton.tabIndex = -1;

      const onClick = (): void => {
        this.popup.close();
        entry.onSelect();
      };
      itemButton.addEventListener('click', onClick);
      this.boundClicks.push(onClick);

      const onKeydown = (event: KeyboardEvent): void => this.handleItemKeydown(event, index);
      itemButton.addEventListener('keydown', onKeydown);
      this.boundKeydowns.push(onKeydown);

      this.itemButtons.push(itemButton);
      this.popup.element.appendChild(itemButton);
    }

    this.boundToggle = () => {
      this.popup.toggle();
      this.target.setAttribute('aria-expanded', String(this.popup.isOpen()));
      if (this.popup.isOpen()) {
        this.focusItem(this.firstEnabledIndex());
      }
    };
    this.target.addEventListener('click', this.boundToggle);
  }

  destroy(): void {
    this.target.removeEventListener('click', this.boundToggle);
    for (let i = 0; i < this.itemButtons.length; i++) {
      this.itemButtons[i].removeEventListener('click', this.boundClicks[i]);
      this.itemButtons[i].removeEventListener('keydown', this.boundKeydowns[i]);
    }
    this.popup.destroy();
  }

  private firstEnabledIndex(): number {
    return this.itemButtons.findIndex((btn) => !btn.disabled);
  }

  private focusItem(index: number): void {
    this.itemButtons[index]?.focus();
  }

  private handleItemKeydown(event: KeyboardEvent, index: number): void {
    const count = this.itemButtons.length;
    let nextIndex: number | null = null;

    if (event.key === 'ArrowDown') {
      nextIndex = this.nextEnabledIndex(index, 1);
    } else if (event.key === 'ArrowUp') {
      nextIndex = this.nextEnabledIndex(index, -1);
    } else if (event.key === 'Home') {
      nextIndex = this.firstEnabledIndex();
    } else if (event.key === 'End') {
      nextIndex = this.lastEnabledIndex();
    } else if (event.key === 'Escape') {
      this.popup.close();
      this.target.setAttribute('aria-expanded', 'false');
      this.target.focus();
      return;
    } else if (event.key === 'Tab') {
      this.popup.close();
      this.target.setAttribute('aria-expanded', 'false');
      return;
    }

    if (nextIndex === null || nextIndex < 0 || nextIndex >= count) {
      return;
    }

    event.preventDefault();
    this.focusItem(nextIndex);
  }

  private nextEnabledIndex(from: number, direction: 1 | -1): number | null {
    const count = this.itemButtons.length;
    for (let step = 1; step <= count; step++) {
      const candidate = (from + direction * step + count) % count;
      if (!this.itemButtons[candidate].disabled) {
        return candidate;
      }
    }
    return null;
  }

  private lastEnabledIndex(): number {
    for (let i = this.itemButtons.length - 1; i >= 0; i--) {
      if (!this.itemButtons[i].disabled) return i;
    }
    return -1;
  }
}
