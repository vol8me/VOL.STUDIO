import { Icon, type IconName } from './Icon';
import { DisposableScope } from '../../lifecycle/DisposableScope';

export type ToolbarOrientation = 'horizontal' | 'vertical';
export type ToolbarSelectionMode = 'none' | 'single' | 'multiple';

export interface ToolButtonOptions {
  id: string;
  label: string;
  icon?: IconName;
  text?: string;
  disabled?: boolean;
  pressed?: boolean;
  toggle?: boolean;
  shortcut?: string;
  onPress?: (pressed: boolean) => void;
}

const ACTIVATE_EVENT = 'vol-tool-activate';

/** Tek başına veya `Toolbar` içinde kullanılabilen erişilebilir araç düğmesi. */
export class ToolButton {
  readonly element: HTMLButtonElement;
  readonly id: string;
  /** Seçim kümesinin parçası mı, yoksa tek seferlik aksiyon mu. */
  readonly isToggle: boolean;
  private readonly onPressHandler?: (pressed: boolean) => void;
  private readonly boundClick: () => void;
  private readonly scope = new DisposableScope();

  constructor(options: ToolButtonOptions) {
    this.id = options.id;
    this.isToggle = options.toggle ?? false;
    this.onPressHandler = options.onPress;

    this.element = document.createElement('button');
    this.element.type = 'button';
    this.element.className = 'vol-tool-button';
    this.element.dataset.toolId = options.id;
    this.element.disabled = options.disabled ?? false;
    this.element.setAttribute('aria-label', options.label);
    if (options.shortcut) {
      this.element.setAttribute('aria-keyshortcuts', options.shortcut);
      this.element.title = `${options.label} (${options.shortcut})`;
    } else {
      this.element.title = options.label;
    }

    if (options.icon) {
      const icon = new Icon({ name: options.icon });
      this.element.appendChild(icon.element);
    }
    if (options.text) {
      const text = document.createElement('span');
      text.className = 'vol-tool-button__text';
      text.textContent = options.text;
      this.element.appendChild(text);
    }
    if (!options.icon && !options.text) {
      throw new Error(`ToolButton "${options.id}" için icon veya text zorunludur`);
    }

    if (this.isToggle) this.element.setAttribute('aria-pressed', String(options.pressed ?? false));
    this.boundClick = () => {
      if (this.isToggle) this.setPressed(!this.isPressed());
      this.element.dispatchEvent(
        new CustomEvent(ACTIVATE_EVENT, { bubbles: true, detail: { id: this.id } }),
      );
      this.onPressHandler?.(this.isPressed());
    };
    this.scope.addListener(this.element, 'click', this.boundClick);
  }

  isPressed(): boolean {
    return this.element.getAttribute('aria-pressed') === 'true';
  }

  /** Programatik güncelleme sessizdir. */
  setPressed(pressed: boolean): void {
    if (!this.isToggle) return;
    this.element.setAttribute('aria-pressed', String(pressed));
  }

  setDisabled(disabled: boolean): void {
    this.element.disabled = disabled;
  }

  focus(): void {
    this.element.focus();
  }

  destroy(): void {
    this.scope.dispose();
    this.element.remove();
  }
}

export interface ToolbarOptions {
  ariaLabel: string;
  orientation?: ToolbarOrientation;
  selectionMode?: ToolbarSelectionMode;
  items?: ToolButtonOptions[];
  value?: string | string[];
  onChange?: (value: string | string[] | undefined) => void;
}

/** Araç düğmelerine roving-tabindex ve tek/çoklu seçim davranışı kazandırır. */
export class Toolbar {
  readonly element: HTMLDivElement;
  private readonly orientation: ToolbarOrientation;
  private readonly selectionMode: ToolbarSelectionMode;
  private readonly buttons: ToolButton[] = [];
  private readonly onChangeHandler?: ToolbarOptions['onChange'];
  private readonly scope = new DisposableScope();
  private activeIndex = 0;
  private readonly boundKeydown: (event: KeyboardEvent) => void;
  private readonly boundFocusIn: (event: FocusEvent) => void;
  private readonly boundActivate: (event: Event) => void;

  constructor(options: ToolbarOptions) {
    this.orientation = options.orientation ?? 'horizontal';
    this.selectionMode = options.selectionMode ?? 'none';
    this.onChangeHandler = options.onChange;

    this.element = document.createElement('div');
    this.element.className = `vol-toolbar vol-toolbar--${this.orientation}`;
    this.element.setAttribute('role', 'toolbar');
    this.element.setAttribute('aria-label', options.ariaLabel);
    this.element.setAttribute('aria-orientation', this.orientation);

    this.boundKeydown = (event) => this.handleKeydown(event);
    this.boundFocusIn = (event) => {
      const index = this.buttons.findIndex((button) => button.element === event.target);
      if (index >= 0) {
        this.activeIndex = index;
        this.updateTabStops();
      }
    };
    this.boundActivate = (event) => {
      const id = (event as CustomEvent<{ id: string }>).detail?.id;
      const index = this.buttons.findIndex((button) => button.id === id);
      if (index < 0) return;
      this.activeIndex = index;
      this.applyUserSelection(this.buttons[index]);
      this.updateTabStops();
    };
    this.scope.addListener(this.element, 'keydown', this.boundKeydown as EventListener);
    this.scope.addListener(this.element, 'focusin', this.boundFocusIn as EventListener);
    this.scope.addListener(this.element, ACTIVATE_EVENT, this.boundActivate as EventListener);

    for (const item of options.items ?? []) this.add(item);
    if (options.value !== undefined) this.setValue(options.value);
    this.updateTabStops();
  }

  add(options: ToolButtonOptions): ToolButton {
    if (this.buttons.some((button) => button.id === options.id)) {
      throw new Error(`Toolbar içinde yinelenen araç kimliği: "${options.id}"`);
    }
    const button = new ToolButton({
      ...options,
      // Açıkça `toggle: false` verilen düğme seçim kümesine girmez. Bu opsiyon
      // dikkate alınmadığı sürece seçimli bir toolbardaki HER düğme toggle
      // oluyordu: "daha fazla" gibi bir aksiyon düğmesine basmak aktif aracı
      // düşürüp `onChange`'i o düğmenin kimliğiyle tetikliyordu.
      toggle: options.toggle ?? this.selectionMode !== 'none',
      pressed: options.pressed ?? false,
    });
    this.buttons.push(button);
    this.scope.addDestroyable(button);
    this.element.appendChild(button.element);
    this.updateTabStops();
    return button;
  }

  getButton(id: string): ToolButton | undefined {
    return this.buttons.find((button) => button.id === id);
  }

  setButtonDisabled(id: string, disabled: boolean): void {
    this.getButton(id)?.setDisabled(disabled);
    this.updateTabStops();
  }

  getValue(): string | string[] | undefined {
    const selected = this.buttons
      .filter((button) => button.isToggle && button.isPressed())
      .map((button) => button.id);
    if (this.selectionMode === 'multiple') return selected;
    return selected[0];
  }

  /** Programatik seçim sessizdir. */
  setValue(value: string | string[] | undefined): void {
    const values = Array.isArray(value) ? value : value ? [value] : [];
    const selected = new Set(
      this.selectionMode === 'multiple'
        ? values
        : this.selectionMode === 'single'
        ? values.slice(0, 1)
        : [],
    );
    for (const button of this.buttons) {
      if (button.isToggle) button.setPressed(selected.has(button.id));
    }
  }

  destroy(): void {
    this.scope.dispose();
    this.buttons.length = 0;
    this.element.remove();
  }

  private applyUserSelection(active: ToolButton): void {
    // Aksiyon düğmesi seçimi değiştirmez: basıldığında aktif araç yerinde kalır
    // ve `onChange` tetiklenmez.
    if (!active.isToggle) return;
    if (this.selectionMode === 'single') {
      for (const button of this.buttons) {
        if (button.isToggle) button.setPressed(button === active);
      }
    }
    if (this.selectionMode !== 'none') this.onChangeHandler?.(this.getValue());
  }

  private handleKeydown(event: KeyboardEvent): void {
    const forwardKey = this.orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
    const backwardKey = this.orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
    let targetIndex: number | null = null;
    if (event.key === forwardKey) targetIndex = this.findEnabled(this.activeIndex, 1);
    else if (event.key === backwardKey) targetIndex = this.findEnabled(this.activeIndex, -1);
    else if (event.key === 'Home') targetIndex = this.findEnabled(-1, 1);
    else if (event.key === 'End') targetIndex = this.findEnabled(0, -1);
    if (targetIndex === null) return;
    event.preventDefault();
    this.activeIndex = targetIndex;
    this.updateTabStops();
    this.buttons[targetIndex]?.focus();
  }

  private findEnabled(from: number, direction: 1 | -1): number | null {
    if (this.buttons.length === 0) return null;
    for (let offset = 1; offset <= this.buttons.length; offset++) {
      const index = (from + direction * offset + this.buttons.length) % this.buttons.length;
      if (!this.buttons[index].element.disabled) return index;
    }
    return null;
  }

  private updateTabStops(): void {
    if (this.buttons[this.activeIndex]?.element.disabled) {
      this.activeIndex = this.findEnabled(this.activeIndex - 1, 1) ?? 0;
    }
    this.buttons.forEach((button, index) => {
      button.element.tabIndex = index === this.activeIndex && !button.element.disabled ? 0 : -1;
    });
  }
}
