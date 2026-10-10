import { i18next } from '../../i18n/I18n';
import { DisposableScope } from '../../lifecycle/DisposableScope';
import { emitUiIntent, emitUiSignal } from '../feedback/uiIntent';

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
  /** Görünür etiket yokken erişilebilir ad; çevrilmiş metin. */
  ariaLabel?: string;
  formatValue?: (value: number) => string;
  disabled?: boolean;
  /** Salt okunur: tutamaklar odaklanır ve okunur; kullanıcı değeri değiştiremez. */
  readOnly?: boolean;
  /** Doğrulama hatası: `aria-invalid`. Hata metni `aria-describedby` ile tüketicide bağlanır. */
  invalid?: boolean;
  onInput?: (value: RangeSliderValue) => void;
  onCommit?: (value: RangeSliderValue) => void;
}

/**
 * İki handle'lı "X'ten Y'ye" aralık seçicisi.
 *
 * Native `<input type="range">` üzerine kurulu DEĞİL: aynı track'te üst üste
 * iki native range, tarayıcılar arasında tutarsız "track'e tıkla en yakına
 * atla" davranışı verir. Tek bir `pointerdown/move/up` döngüsü en yakın
 * handle'ı doğrudan sürer.
 *
 * **Handle'lar birbirini İTMEZ:** her biri diğerinin değerinde kilitlenir ve
 * eşit durabilir.
 *
 * **Taşma önleme SAF CSS'tir.** Değerler ham `left: X%` olarak yazılır; JS'te
 * yarım-genişlik telafisi yoktur. Track `padding-inline: calc(handle-width/2)`
 * + `box-sizing: border-box` alır. Gerekçe: `getBoundingClientRect()` ilk
 * render'da `{width: 0}` döner (`render()` constructor'da, element DOM'a
 * eklenmeden çalışır) ve JS telafisi ilk karede taşardı.
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
  private labelText: string | null;
  private readonly labelElement: HTMLSpanElement | null;
  private readOnly: boolean;
  private readonly onLanguageChanged = (): void => this.applyHandleNames();
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
      ariaLabel,
      formatValue = (v) => String(v),
      disabled = false,
      readOnly = false,
      invalid = false,
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
    this.readOnly = readOnly;
    this.labelText = label ?? ariaLabel ?? null;

    this.element = document.createElement('div');
    this.element.className = 'vol-range-slider';

    if (label) {
      const labelRow = document.createElement('div');
      labelRow.className = 'vol-range-slider__label-row';

      const labelText = document.createElement('span');
      labelText.className = 'vol-range-slider__label';
      labelText.textContent = label;
      labelRow.appendChild(labelText);
      this.labelElement = labelText;

      this.valueLabel = document.createElement('span');
      this.valueLabel.className = 'vol-range-slider__value';
      labelRow.appendChild(this.valueLabel);

      this.element.appendChild(labelRow);
    } else {
      this.valueLabel = null;
      this.labelElement = null;
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
    this.track.appendChild(this.minHandle);

    this.maxHandle = document.createElement('div');
    this.maxHandle.className = 'vol-range-slider__handle vol-range-slider__handle--max';
    this.maxHandle.tabIndex = 0;
    this.maxHandle.setAttribute('role', 'slider');
    this.track.appendChild(this.maxHandle);
    // Kol D-pad'i yatay oku tutamağa verir (FocusNav sözleşmesi); dikey D-pad çıkış yoludur.
    this.minHandle.dataset.volArrows = 'horizontal';
    this.maxHandle.dataset.volArrows = 'horizontal';
    // Ses perdesi bütün aralığa göredir; tutamağın kendi aria-valuemin/max'ı karşı tutamağa bağlıdır.
    for (const handle of [this.minHandle, this.maxHandle]) {
      handle.dataset.volPitchMin = String(this.min);
      handle.dataset.volPitchMax = String(this.max);
    }

    this.element.appendChild(this.track);
    this.applyHandleNames();
    this.scope.addSubscription(() => i18next.off('languageChanged', this.onLanguageChanged));
    i18next.on('languageChanged', this.onLanguageChanged);
    this.setInvalid(invalid);

    // Track tüm pointer olaylarını dinler (iki native range input üst üste koymak
    // yerine); boş track tıklaması ve doğrudan handle basışını tek tip ele alır.
    const boundPointerDown = (event: PointerEvent): void => {
      if (
        this.disabled ||
        this.readOnly ||
        this.activePointerId !== null ||
        !event.isPrimary ||
        (event.pointerType === 'mouse' && event.button !== 0)
      )
        return;
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
      this.commitUserInput(this.activeHandle, this.valueFromClientX(event.clientX), event);
      this.track.setPointerCapture(event.pointerId);
      event.preventDefault();
    };
    const boundPointerMove = (event: PointerEvent): void => {
      if (!this.activeHandle || this.activePointerId !== event.pointerId) return;
      this.commitUserInput(this.activeHandle, this.valueFromClientX(event.clientX), event);
    };
    const boundPointerUp = (event: PointerEvent): void => {
      this.finishGesture(event, event.type === 'pointercancel');
    };
    this.scope.addListener(this.track, 'pointerdown', boundPointerDown as EventListener);
    this.scope.addListener(this.track, 'pointermove', boundPointerMove as EventListener);
    this.scope.addListener(this.track, 'pointerup', boundPointerUp as EventListener);
    this.scope.addListener(this.track, 'pointercancel', boundPointerUp as EventListener);

    this.boundHandleKeydown = (handle) => (event) => {
      if (this.disabled || this.readOnly) return;
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
            : event.key === 'PageUp'
              ? this.pageStep
              : event.key === 'PageDown'
                ? -this.pageStep
                : event.key === 'Home'
                  ? Number.NEGATIVE_INFINITY
                  : event.key === 'End'
                    ? Number.POSITIVE_INFINITY
                    : null;
      if (delta === null) return;

      event.preventDefault();
      const current = handle === 'min' ? this.minValue : this.maxValue;
      const next = Number.isFinite(delta) ? current + delta : delta > 0 ? this.max : this.min;
      if (this.commitUserInput(handle, next, event)) {
        // Aynı tuş olayı önizleme niyetini zaten sahiplendi; kalıcı değişiklik ayrı niyettir.
        emitUiSignal({
          kind: 'valueCommit',
          origin: 'RangeSlider',
          target: this.handleElement(handle),
          source: 'keyboard',
        });
        this.onCommitHandler?.(this.getValue());
      }
    };
    this.boundMinHandleKeydown = this.boundHandleKeydown('min');
    this.boundMaxHandleKeydown = this.boundHandleKeydown('max');
    this.scope.addListener(this.minHandle, 'keydown', this.boundMinHandleKeydown as EventListener);
    this.scope.addListener(this.maxHandle, 'keydown', this.boundMaxHandleKeydown as EventListener);

    this.render();
    this.setDisabled(disabled);
    this.applyReadOnly();
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
    for (const handle of [this.minHandle, this.maxHandle]) {
      handle.setAttribute('aria-disabled', String(disabled));
    }
  }

  setReadOnly(readOnly: boolean): void {
    if (readOnly) this.restoreGestureStart();
    this.readOnly = readOnly;
    this.applyReadOnly();
  }

  setInvalid(invalid: boolean): void {
    for (const handle of [this.minHandle, this.maxHandle]) {
      if (invalid) handle.setAttribute('aria-invalid', 'true');
      else handle.removeAttribute('aria-invalid');
    }
  }

  /** Görünür etiketi günceller (dil değişimi); tutamak adları da yenilenir. */
  setLabel(label: string): void {
    if (this.labelElement) this.labelElement.textContent = label;
    this.labelText = label;
    this.applyHandleNames();
  }

  destroy(): void {
    this.restoreGestureStart(false);
    this.scope.dispose();
    this.element.remove();
  }

  /** Büyük adım: aralığın yaklaşık onda biri, adımın katı (PageUp/PageDown). */
  private get pageStep(): number {
    return Math.max(this.step, Math.round((this.max - this.min) / 10 / this.step) * this.step);
  }

  private applyReadOnly(): void {
    for (const handle of [this.minHandle, this.maxHandle]) {
      if (this.readOnly) handle.setAttribute('aria-readonly', 'true');
      else handle.removeAttribute('aria-readonly');
    }
  }

  /** Tutamak adları dilden gelir: görünür etiketle birlikte "(alt sınır)" son eki ya da yalın ad. */
  private applyHandleNames(): void {
    const label = this.labelText;
    // Anahtarlar düz yazılır: kullanılmayan-anahtar kapısı şablonlu anahtarı göremez.
    this.minHandle.setAttribute(
      'aria-label',
      label ? i18next.t('core:rangeSlider.minOf', { label }) : i18next.t('core:rangeSlider.min'),
    );
    this.maxHandle.setAttribute(
      'aria-label',
      label ? i18next.t('core:rangeSlider.maxOf', { label }) : i18next.t('core:rangeSlider.max'),
    );
  }

  /** clientX'i değere çevirir. getBoundingClientRect() burada güvenli (render()'ın aksine) çünkü pointer olayları yalnızca element DOM'da görünürken tetiklenir. */
  private valueFromClientX(clientX: number): number {
    const rect = this.track.getBoundingClientRect();
    const ratio = rect.width > 0 ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) : 0;
    return this.min + ratio * (this.max - this.min);
  }

  private handleElement(handle: 'min' | 'max'): HTMLElement {
    return handle === 'min' ? this.minHandle : this.maxHandle;
  }

  /** Kullanıcı olayından ses/titreşim niyeti; programatik değişim (olaysız) sessizdir. */
  private signal(
    kind: 'valuePreview' | 'valueCommit',
    target: HTMLElement,
    event: Event,
    persistent: boolean,
  ): void {
    emitUiIntent({ kind, origin: 'RangeSlider', target, event, persistent });
  }

  private commitUserInput(handle: 'min' | 'max', rawValue: number, event: Event): boolean {
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
      this.signal('valuePreview', this.handleElement(handle), event, false);
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
        this.signal('valueCommit', this.handleElement(this.activeHandle), event, true);
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
    this.minHandle.setAttribute('aria-valuetext', this.formatValue(this.minValue));
    this.maxHandle.setAttribute('aria-valuetext', this.formatValue(this.maxValue));
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
