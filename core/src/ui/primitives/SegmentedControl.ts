import { DisposableScope } from '../../lifecycle/DisposableScope';

export interface SegmentedControlOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SegmentedControlOptions {
  options: SegmentedControlOption[];
  value?: string;
  disabled?: boolean;
  /**
   * Grubun erişilebilir adı. Segment etiketleri ("Dikey", "Yatay") neyin
   * seçildiğini söylemez; görünür bir başlıkla bağlanmıyorsa verilmelidir.
   */
  ariaLabel?: string;
  onInput?: (value: string) => void;
  onCommit?: (value: string) => void;
}

/**
 * Bitişik buton grubu şeklinde tek-seçim toggle (ör. "Düşük/Orta/Yüksek"
 * grafik kalitesi, "Kolay/Normal/Zor" gibi kısa etiketli 2-4 seçenekte).
 * RadioGroup'tan farkı: dikey liste değil kompakt yatay şerit, ayarlar
 * panellerinde satır başına az yer kaplaması istendiğinde tercih edilir.
 *
 * Klavye WAI-ARIA radyo grubu desenini izler: grup tek sekme durağıdır; ok
 * tuşları ile Home/End kapalı olmayan segmentler arasında gezinir ve gezilen
 * segmenti seçer.
 */
export class SegmentedControl {
  readonly element: HTMLDivElement;
  private readonly thumb: HTMLDivElement;
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly itemDisabled = new Set<string>();
  private value: string | undefined;
  private disabled: boolean;
  private readonly onInputHandler?: (value: string) => void;
  private readonly onCommitHandler?: (value: string) => void;
  private readonly scope = new DisposableScope();
  /** Segment dinleyicileri; `setOptions` segmentleri yeniden kurduğunda ayrıca kapatılır. */
  private itemScope = new DisposableScope();

  constructor(options: SegmentedControlOptions) {
    const { options: items, value, disabled = false, ariaLabel, onInput, onCommit } = options;
    this.value = value;
    this.disabled = disabled;
    this.onInputHandler = onInput;
    this.onCommitHandler = onCommit;

    this.element = document.createElement('div');
    this.element.className = 'vol-segmented';
    this.element.setAttribute('role', 'radiogroup');
    if (ariaLabel) this.element.setAttribute('aria-label', ariaLabel);

    // Seçili segmentin altında kayan vurgu; Checkbox'ın thumb'ıyla aynı
    // "translateX ile kay" deseni — seçim değişikliği anlık tak/kapa yerine
    // görünür bir hareket olarak hissedilsin diye.
    this.thumb = document.createElement('div');
    this.thumb.className = 'vol-segmented__thumb';
    this.element.appendChild(this.thumb);

    this.renderItems(items);
    this.syncDisabledState();

    this.scope.addListener<KeyboardEvent>(this.element, 'keydown', (event) =>
      this.handleKeydown(event),
    );
    this.scope.add({ dispose: () => this.itemScope.dispose() });

    const boundResize = (): void => this.moveThumb();
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(boundResize) : undefined;
    resizeObserver?.observe(this.element);
    this.scope.add({ dispose: () => resizeObserver?.disconnect() });
    this.scope.addListener(window, 'resize', boundResize);

    // İlk konum: layout'un tamamlanmasını bekler (offsetLeft/Width ilk
    // çizimde 0 dönebilir), aksi halde thumb açılışta yanlış yerde belirir.
    this.scope.addAnimationFrame(() => this.moveThumb());
  }

  getValue(): string | undefined {
    return this.value;
  }

  setValue(value: string): void {
    if (this.value === value) return;
    this.select(value);
  }

  setValueAndNotify(value: string): void {
    this.commitUser(value);
  }

  /**
   * Segmentleri yeniden kurar — dil değiştiğinde etiketleri yenilemenin yolu.
   * Seçili değer yeni listede varsa korunur, yoksa seçim düşer; geri çağrı
   * üretmez.
   */
  setOptions(items: SegmentedControlOption[]): void {
    this.renderItems(items);
    if (this.value !== undefined && !this.buttons.has(this.value)) this.value = undefined;
    this.syncDisabledState();
    this.moveThumb();
  }

  setAriaLabel(label: string): void {
    this.element.setAttribute('aria-label', label);
  }

  setDisabled(disabled: boolean): void {
    this.disabled = disabled;
    this.syncDisabledState();
  }

  destroy(): void {
    this.scope.dispose();
    this.element.remove();
  }

  private renderItems(items: SegmentedControlOption[]): void {
    this.itemScope.dispose();
    this.itemScope = new DisposableScope();
    for (const button of this.buttons.values()) button.remove();
    this.buttons.clear();
    this.itemDisabled.clear();

    for (const item of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'vol-segmented__item';
      button.textContent = item.label;
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(item.value === this.value));
      button.classList.toggle('vol-segmented__item--active', item.value === this.value);
      if (item.disabled) this.itemDisabled.add(item.value);

      this.itemScope.addListener(button, 'click', () => this.commitUser(item.value));
      this.buttons.set(item.value, button);
      this.element.appendChild(button);
    }
  }

  private syncDisabledState(): void {
    for (const [value, button] of this.buttons) {
      button.disabled = this.disabled || this.itemDisabled.has(value);
    }
    this.element.classList.toggle('vol-segmented--disabled', this.disabled);
    if (this.disabled) this.element.setAttribute('aria-disabled', 'true');
    else this.element.removeAttribute('aria-disabled');
    this.syncTabStops();
  }

  /** Grubun tek sekme durağı: seçili segment, o kapalıysa ilk kapalı olmayan segment. */
  private syncTabStops(): void {
    const enabled = this.enabledValues();
    const stop = this.value !== undefined && enabled.includes(this.value) ? this.value : enabled[0];
    for (const [value, button] of this.buttons) {
      button.tabIndex = value === stop ? 0 : -1;
    }
  }

  private enabledValues(): string[] {
    const values: string[] = [];
    for (const [value, button] of this.buttons) {
      if (!button.disabled) values.push(value);
    }
    return values;
  }

  private handleKeydown(event: KeyboardEvent): void {
    const enabled = this.enabledValues();
    if (enabled.length === 0) return;

    let focused: string | undefined;
    for (const [value, button] of this.buttons) {
      if (button === document.activeElement) focused = value;
    }
    const current = focused ?? this.value;
    const index = current === undefined ? -1 : enabled.indexOf(current);
    // Yatay şeritte "sağ" okuma yönüne bağlıdır; sağdan sola dilde önceki segmenttir.
    const forward = this.element.closest('[dir="rtl"]') ? -1 : 1;

    let target: number;
    switch (event.key) {
      case 'ArrowRight':
        target = index + forward;
        break;
      case 'ArrowLeft':
        target = index - forward;
        break;
      case 'ArrowDown':
        target = index + 1;
        break;
      case 'ArrowUp':
        target = index - 1;
        break;
      case 'Home':
        target = 0;
        break;
      case 'End':
        target = enabled.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const next = enabled[(target + enabled.length) % enabled.length];
    this.commitUser(next);
    this.buttons.get(next)?.focus();
  }

  private select(value: string): void {
    const previous = this.value ? this.buttons.get(this.value) : undefined;
    previous?.classList.remove('vol-segmented__item--active');
    previous?.setAttribute('aria-checked', 'false');

    this.value = value;
    const next = this.buttons.get(value);
    next?.classList.add('vol-segmented__item--active');
    next?.setAttribute('aria-checked', 'true');
    this.syncTabStops();
    this.moveThumb();
  }

  private commitUser(value: string): void {
    if (this.value === value || this.buttons.get(value)?.disabled) return;
    this.select(value);
    this.onInputHandler?.(value);
    this.onCommitHandler?.(value);
  }

  private moveThumb(): void {
    const active = this.value ? this.buttons.get(this.value) : undefined;
    if (!active) {
      this.thumb.style.opacity = '0';
      return;
    }
    this.thumb.style.opacity = '1';
    this.thumb.style.transform = `translateX(${active.offsetLeft}px)`;
    this.thumb.style.width = `${active.offsetWidth}px`;
  }
}
