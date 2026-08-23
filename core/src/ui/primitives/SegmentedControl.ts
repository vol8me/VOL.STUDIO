export interface SegmentedControlOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SegmentedControlOptions {
  options: SegmentedControlOption[];
  value?: string;
  disabled?: boolean;
  onInput?: (value: string) => void;
  onCommit?: (value: string) => void;
  /** @deprecated Ayrık kullanıcı değişimlerinde korunur; yeni kodda `onCommit` kullanın. */
  onChange?: (value: string) => void;
}

/**
 * Bitişik buton grubu şeklinde tek-seçim toggle (ör. "Düşük/Orta/Yüksek"
 * grafik kalitesi, "Kolay/Normal/Zor" gibi kısa etiketli 2-4 seçenekte).
 * RadioGroup'tan farkı: dikey liste değil kompakt yatay şerit, ayarlar
 * panellerinde satır başına az yer kaplaması istendiğinde tercih edilir.
 */
export class SegmentedControl {
  readonly element: HTMLDivElement;
  private readonly thumb: HTMLDivElement;
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly itemDisabled = new Set<string>();
  private readonly boundClicks = new Map<string, () => void>();
  private value: string | undefined;
  private onInputHandler?: (value: string) => void;
  private onCommitHandler?: (value: string) => void;
  private onChangeHandler?: (value: string) => void;
  private boundResize: () => void;
  private resizeObserver?: ResizeObserver;
  /** Ilk thumb konumlandirma karesi; destroy() iptal eder. */
  private initialThumbFrame: number | null = null;

  constructor(options: SegmentedControlOptions) {
    const { options: items, value, disabled = false, onInput, onCommit, onChange } = options;
    this.value = value;
    this.onInputHandler = onInput;
    this.onCommitHandler = onCommit;
    this.onChangeHandler = onChange;

    this.element = document.createElement('div');
    this.element.className = 'vol-segmented';
    this.element.setAttribute('role', 'radiogroup');

    // Seçili segmentin altında kayan vurgu; Checkbox'ın thumb'ıyla aynı
    // "translateX ile kay" deseni — seçim değişikliği anlık tak/kapa yerine
    // görünür bir hareket olarak hissedilsin diye.
    this.thumb = document.createElement('div');
    this.thumb.className = 'vol-segmented__thumb';
    this.element.appendChild(this.thumb);

    for (const item of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'vol-segmented__item';
      button.textContent = item.label;
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(item.value === value));
      button.disabled = disabled || Boolean(item.disabled);
      if (item.disabled) this.itemDisabled.add(item.value);
      if (item.value === value) {
        button.classList.add('vol-segmented__item--active');
      }

      const onClick = (): void => this.commitUser(item.value);
      button.addEventListener('click', onClick);
      this.boundClicks.set(item.value, onClick);

      this.buttons.set(item.value, button);
      this.element.appendChild(button);
    }

    this.boundResize = () => this.moveThumb();
    this.resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(this.boundResize) : undefined;
    this.resizeObserver?.observe(this.element);
    window.addEventListener('resize', this.boundResize);

    // İlk konum: layout'un tamamlanmasını bekler (offsetLeft/Width ilk
    // çizimde 0 dönebilir), aksi halde thumb açılışta yanlış yerde belirir.
    this.initialThumbFrame = requestAnimationFrame(() => {
      this.initialThumbFrame = null;
      this.moveThumb();
    });
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

  setDisabled(disabled: boolean): void {
    for (const [value, button] of this.buttons) {
      button.disabled = disabled || this.itemDisabled.has(value);
    }
  }

  destroy(): void {
    for (const [value, button] of this.buttons) {
      const handler = this.boundClicks.get(value);
      if (handler) button.removeEventListener('click', handler);
    }
    // Ilk konumlandirma karesi destroy'dan once atesmezse kopmus element uzerinde calisirdi.
    if (this.initialThumbFrame !== null) {
      cancelAnimationFrame(this.initialThumbFrame);
      this.initialThumbFrame = null;
    }
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.boundResize);
    this.element.remove();
  }

  private select(value: string): void {
    const previous = this.value ? this.buttons.get(this.value) : undefined;
    previous?.classList.remove('vol-segmented__item--active');
    previous?.setAttribute('aria-checked', 'false');

    this.value = value;
    const next = this.buttons.get(value);
    next?.classList.add('vol-segmented__item--active');
    next?.setAttribute('aria-checked', 'true');
    this.moveThumb();
  }

  private commitUser(value: string): void {
    if (this.value === value || this.buttons.get(value)?.disabled) return;
    this.select(value);
    this.onInputHandler?.(value);
    this.onCommitHandler?.(value);
    this.onChangeHandler?.(value);
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
