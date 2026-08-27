import { DisposableScope } from '../../lifecycle/DisposableScope';

export interface RangeSliderValue {
  min: number;
  max: number;
}

/** .vol-range-slider__handle'ın CSS genişliğiyle BİREBİR eşleşmeli — render()'ın taşma önleme hesabında kullanılır. */
export const HANDLE_WIDTH_PX = 18;

export interface RangeSliderOptions {
  min?: number;
  max?: number;
  step?: number;
  value?: RangeSliderValue;
  label?: string;
  formatValue?: (value: number) => string;
  disabled?: boolean;
  onInput?: (value: RangeSliderValue) => void;
  onCommit?: (value: RangeSliderValue) => void;
}

/**
 * Tek-değerli Slider yerine iki handle'lı "X'ten Y'ye" aralık seçicisi
 * (fiyat/seviye filtreleme).
 *
 * Native `<input type="range">` üzerine kurulu değil: iki native range input'u
 * aynı track'te üst üste koymak tarayıcılar arasında tutarsız "track'e tıkla en
 * yakın thumb'a atla" davranışı verir ve thumb'lar yakalamayı zorlaştırır.
 * Bunun yerine tek bir `pointerdown/move/up` döngüsü "tıklanan veya işaretçiye
 * en yakın handle"ı doğrudan sürer.
 *
 * ÇAKIŞMA: min ve max birbirini itmez — her biri diğerinin mevcut değerinde
 * kilitlenir ve eşit durabilir (ör. "Lv.1-Lv.1" geçerli). Bir handle'ı taşımak
 * diğerini sürüklemez.
 *
 * HANDLE TAŞMASI — SAF CSS ÇÖZÜMÜ: değerler ham 0-100%'e çevrilip doğrudan
 * `left: X%` olarak yazılır, JS tarafında "handle yarım genişliği" telafisi
 * yapılmaz. Taşma önleme CSS'tedir: track `padding-inline: calc(handle-width / 2)`
 * + `box-sizing: border-box` alır, böylece `left: 0%..100%` ile konumlanan
 * handle'lar `translateX(-50%)` ile ortalandığında track'in gerçek sınırları
 * içinde kalır. Bu, JS'te `track.getBoundingClientRect().width`'ten ofset
 * hesaplamayı bilerek kaçınır — o rect ilk render'da `{width: 0}`'dır (render()
 * constructor'da, element DOM'a eklenmeden önce çalışır) ve ilk render'da taşma
 * yapardı. Saf CSS yaklaşımı DOM bağlantı durumundan bağımsız olarak, ilk render
 * dahil her zaman doğrudur.
 */
export class RangeSlider {
  readonly element: HTMLDivElement;
  private readonly track: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private readonly minHandle: HTMLDivElement;
  private readonly maxHandle: HTMLDivElement;
  private readonly valueLabel: HTMLSpanElement | null;
  private readonly min: number;
  private readonly max: number;
  private readonly step: number;
  private readonly formatValue: (value: number) => string;
  private onInputHandler?: (value: RangeSliderValue) => void;
  private onCommitHandler?: (value: RangeSliderValue) => void;
  private readonly scope = new DisposableScope();
  private minValue: number;
  private maxValue: number;
  private disabled: boolean;
  private activeHandle: 'min' | 'max' | null = null;
  private activePointerId: number | null = null;
  private gestureStart: RangeSliderValue | null = null;
  private boundHandleKeydown: (handle: 'min' | 'max') => (event: KeyboardEvent) => void;
  private boundMinHandleKeydown: (event: KeyboardEvent) => void;
  private boundMaxHandleKeydown: (event: KeyboardEvent) => void;

  constructor(options: RangeSliderOptions = {}) {
    const {
      min = 0,
      max = 100,
      step = 1,
      value = { min, max },
      label,
      formatValue = (v) => String(v),
      disabled = false,
      onInput,
      onCommit,
    } = options;

    this.min = min;
    this.max = max;
    // step 0/negatif commit()'in yuvarlamasında NaN üretir; en küçük anlamlı adıma çekilir.
    this.step = step > 0 ? step : 1;
    const clampedMin = this.clamp(value.min);
    const clampedMax = this.clamp(value.max);
    // Başlangıç değerleri de çakışma kuralına tabi: min max'ı aşamaz.
    this.minValue = Math.min(clampedMin, clampedMax);
    this.maxValue = Math.max(clampedMin, clampedMax);
    this.formatValue = formatValue;
    this.onInputHandler = onInput;
    this.onCommitHandler = onCommit;
    this.disabled = disabled;

    this.element = document.createElement('div');
    this.element.className = 'vol-range-slider';

    if (label) {
      const labelRow = document.createElement('div');
      labelRow.className = 'vol-range-slider__label-row';

      const labelText = document.createElement('span');
      labelText.className = 'vol-range-slider__label';
      labelText.textContent = label;
      labelRow.appendChild(labelText);

      this.valueLabel = document.createElement('span');
      this.valueLabel.className = 'vol-range-slider__value';
      labelRow.appendChild(this.valueLabel);

      this.element.appendChild(labelRow);
    } else {
      this.valueLabel = null;
    }

    this.track = document.createElement('div');
    this.track.className = 'vol-range-slider__track';

    this.fill = document.createElement('div');
    this.fill.className = 'vol-range-slider__fill';
    this.track.appendChild(this.fill);

    this.minHandle = document.createElement('div');
    this.minHandle.className = 'vol-range-slider__handle vol-range-slider__handle--min';
    this.minHandle.tabIndex = 0;
    this.minHandle.setAttribute('role', 'slider');
    this.minHandle.setAttribute('aria-label', label ? `${label} (minimum)` : 'Minimum');
    this.track.appendChild(this.minHandle);

    this.maxHandle = document.createElement('div');
    this.maxHandle.className = 'vol-range-slider__handle vol-range-slider__handle--max';
    this.maxHandle.tabIndex = 0;
    this.maxHandle.setAttribute('role', 'slider');
    this.maxHandle.setAttribute('aria-label', label ? `${label} (maksimum)` : 'Maksimum');
    this.track.appendChild(this.maxHandle);

    this.element.appendChild(this.track);

    // Track tüm pointer olaylarını dinler (iki native range input üst üste koymak
    // yerine); boş track tıklaması ve doğrudan handle basışını tek tip ele alır.
    const boundPointerDown = (event: PointerEvent): void => {
      if (this.disabled) return;
      // Handle'a doğrudan basış her zaman o handle'ı seçer — yakınlık tahmini
      // handle'lar yakınken (ör. Lv.22-Lv.24) güvenilmezdir. Boş track tıklaması
      // mesafe bazlı seçime düşer.
      const target = event.target as HTMLElement;
      if (target === this.maxHandle) {
        this.activeHandle = 'max';
      } else if (target === this.minHandle) {
        this.activeHandle = 'min';
      } else {
        const pointerValue = this.valueFromClientX(event.clientX);
        this.activeHandle =
          Math.abs(pointerValue - this.minValue) <= Math.abs(pointerValue - this.maxValue)
            ? 'min'
            : 'max';
      }
      this.gestureStart = this.getValue();
      this.activePointerId = event.pointerId;
      this.commitUserInput(this.activeHandle, this.valueFromClientX(event.clientX));
      this.track.setPointerCapture(event.pointerId);
      event.preventDefault();
    };
    const boundPointerMove = (event: PointerEvent): void => {
      if (!this.activeHandle) return;
      this.commitUserInput(this.activeHandle, this.valueFromClientX(event.clientX));
    };
    const boundPointerUp = (event: PointerEvent): void => {
      this.finishGesture(event, event.type === 'pointercancel');
    };
    this.scope.addListener(this.track, 'pointerdown', boundPointerDown as EventListener);
    this.scope.addListener(this.track, 'pointermove', boundPointerMove as EventListener);
    this.scope.addListener(this.track, 'pointerup', boundPointerUp as EventListener);
    this.scope.addListener(this.track, 'pointercancel', boundPointerUp as EventListener);

    this.boundHandleKeydown = (handle) => (event) => {
      if (this.disabled) return;
      if (event.key === 'Escape' && this.gestureStart) {
        event.preventDefault();
        this.restoreGestureStart();
        return;
      }
      const delta =
        event.key === 'ArrowRight' || event.key === 'ArrowUp'
          ? this.step
          : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? -this.step
          : event.key === 'Home'
          ? Number.NEGATIVE_INFINITY
          : event.key === 'End'
          ? Number.POSITIVE_INFINITY
          : null;
      if (delta === null) return;

      event.preventDefault();
      const current = handle === 'min' ? this.minValue : this.maxValue;
      const next = Number.isFinite(delta) ? current + delta : delta > 0 ? this.max : this.min;
      if (this.commitUserInput(handle, next)) this.onCommitHandler?.(this.getValue());
    };
    this.boundMinHandleKeydown = this.boundHandleKeydown('min');
    this.boundMaxHandleKeydown = this.boundHandleKeydown('max');
    this.scope.addListener(this.minHandle, 'keydown', this.boundMinHandleKeydown as EventListener);
    this.scope.addListener(this.maxHandle, 'keydown', this.boundMaxHandleKeydown as EventListener);

    this.render();
    this.setDisabled(disabled);
  }

  getValue(): RangeSliderValue {
    return { min: this.minValue, max: this.maxValue };
  }

  setValue(value: RangeSliderValue): void {
    const clampedMin = this.clamp(value.min);
    const clampedMax = this.clamp(value.max);
    this.minValue = Math.min(clampedMin, clampedMax);
    this.maxValue = Math.max(clampedMin, clampedMax);
    this.render();
  }

  setValueAndNotify(value: RangeSliderValue): void {
    const previous = this.getValue();
    this.setValue(value);
    const current = this.getValue();
    if (current.min === previous.min && current.max === previous.max) return;
    this.onInputHandler?.(current);
    this.onCommitHandler?.(current);
  }

  setDisabled(disabled: boolean): void {
    if (disabled) this.restoreGestureStart();
    this.disabled = disabled;
    this.element.classList.toggle('vol-range-slider--disabled', disabled);
    this.minHandle.tabIndex = disabled ? -1 : 0;
    this.maxHandle.tabIndex = disabled ? -1 : 0;
  }

  destroy(): void {
    this.restoreGestureStart(false);
    this.scope.dispose();
    this.element.remove();
  }

  /** clientX'i değere çevirir. getBoundingClientRect() burada güvenli (render()'ın aksine) çünkü pointer olayları yalnızca element DOM'da görünürken tetiklenir. */
  private valueFromClientX(clientX: number): number {
    const rect = this.track.getBoundingClientRect();
    const ratio = rect.width > 0 ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) : 0;
    return this.min + ratio * (this.max - this.min);
  }

  private commitUserInput(handle: 'min' | 'max', rawValue: number): boolean {
    // Adım hizalama this.min'e göredir, sıfıra değil — native <input type=range>'in
    // `min + n*step` kuralıyla uyumlu (bkz. Slider.ts); aksi halde ok-tuşu adımları
    // min step'in katı değilse beklenmedik yuvarlanırdı.
    const stepped = this.clamp(
      Math.round((rawValue - this.min) / this.step) * this.step + this.min,
    );

    // ÇAKIŞMA: min max'ı aşamaz, max min'in altına düşemez — taşınan handle sınırında durur.
    const previous = this.getValue();
    if (handle === 'min') {
      this.minValue = Math.min(stepped, this.maxValue);
    } else {
      this.maxValue = Math.max(stepped, this.minValue);
    }
    this.render();
    const current = this.getValue();
    const changed = current.min !== previous.min || current.max !== previous.max;
    if (changed) {
      this.onInputHandler?.(current);
    }
    return changed;
  }

  private finishGesture(event: PointerEvent, cancelled: boolean): void {
    if (!this.activeHandle || this.activePointerId !== event.pointerId) return;
    if (this.track.hasPointerCapture(event.pointerId))
      this.track.releasePointerCapture(event.pointerId);
    if (cancelled) {
      this.restoreGestureStart();
    } else if (this.gestureStart) {
      const current = this.getValue();
      if (current.min !== this.gestureStart.min || current.max !== this.gestureStart.max) {
        this.onCommitHandler?.(current);
      }
    }
    this.activeHandle = null;
    this.activePointerId = null;
    this.gestureStart = null;
  }

  private restoreGestureStart(notify = true): void {
    if (!this.gestureStart) return;
    if (this.activePointerId !== null && this.track.hasPointerCapture(this.activePointerId)) {
      this.track.releasePointerCapture(this.activePointerId);
    }
    const previous = this.getValue();
    const start = this.gestureStart;
    this.setValue(start);
    if (notify && (previous.min !== start.min || previous.max !== start.max)) {
      this.onInputHandler?.(this.getValue());
    }
    this.activeHandle = null;
    this.activePointerId = null;
    this.gestureStart = null;
  }

  private clamp(value: number): number {
    if (!Number.isFinite(value)) return this.min;
    return Math.min(this.max, Math.max(this.min, value));
  }

  /**
   * DOM bağlantı durumundan bağımsız render: konumlar this.min/this.max/değerlerden
   * hesaplanan saf 0-100%'dir, bir `calc()` içine gömülür — piksel/rect ölçümü yok.
   * `calc(HANDLE_HALF + (100% - HANDLE_WIDTH) * X/100)` formülü handle'ın merkezini
   * her iki uçta yarım genişliği kadar içeri çeker, böylece `translate(-50%)` ile
   * ortalandıktan sonra track'ten taşmaz. Layout okumadığı için constructor'da,
   * element DOM'a eklenmeden önce çağrılsa bile doğrudur.
   */
  private render(): void {
    const span = this.max - this.min || 1;
    const startPercent = ((this.minValue - this.min) / span) * 100;
    const endPercent = ((this.maxValue - this.min) / span) * 100;

    const toHandlePosition = (percent: number): string =>
      `calc(${HANDLE_WIDTH_PX / 2}px + (100% - ${HANDLE_WIDTH_PX}px) * ${percent} / 100)`;

    this.fill.style.left = toHandlePosition(startPercent);
    this.fill.style.right = toHandlePosition(100 - endPercent);
    this.minHandle.style.left = toHandlePosition(startPercent);
    this.maxHandle.style.left = toHandlePosition(endPercent);

    this.minHandle.setAttribute('aria-valuemin', String(this.min));
    this.minHandle.setAttribute('aria-valuemax', String(this.maxValue));
    this.minHandle.setAttribute('aria-valuenow', String(this.minValue));
    this.maxHandle.setAttribute('aria-valuemin', String(this.minValue));
    this.maxHandle.setAttribute('aria-valuemax', String(this.max));
    this.maxHandle.setAttribute('aria-valuenow', String(this.maxValue));

    if (this.valueLabel) {
      this.valueLabel.textContent = `${this.formatValue(this.minValue)} – ${this.formatValue(
        this.maxValue,
      )}`;
    }
  }
}
