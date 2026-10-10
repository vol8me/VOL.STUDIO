import { i18next } from '../../i18n/I18n';
import { DisposableScope } from '../../lifecycle/DisposableScope';
import { emitUiIntent, emitUiSignal } from '../feedback/uiIntent';
import { Button } from './Button';

export type CurvePoint = readonly [number, number];

export interface CurveEditorOptions {
  /** Başlangıç noktaları; en az iki tane. Verilmezse kimlik eğrisi. */
  points?: readonly CurvePoint[];
  /** Görünür alan; varsayılan `[0, 1]` × `[0, 1]`. */
  domainX?: readonly [number, number];
  domainY?: readonly [number, number];
  width?: number;
  height?: number;
  label?: string;
  /** Görünür etiket yokken erişilebilir ad; çevrilmiş metin. */
  ariaLabel?: string;
  disabled?: boolean;
  /** Kullanıcı sürüklerken güncel eğri. */
  onInput?: (points: CurvePoint[]) => void;
  /** Kullanıcı sürüklemeyi bıraktığında veya nokta ekleyip sildiğinde çağrılır. */
  onCommit?: (points: CurvePoint[]) => void;
  className?: string;
}

const DEFAULT_POINTS: CurvePoint[] = [
  [0, 0],
  [1, 1],
];
/** Bir noktayı yakalamak için gereken azami uzaklık (CSS pikseli): fare hassas, dokunma/kalem geniş. */
const GRAB_RADIUS_MOUSE_PX = 10;
const GRAB_RADIUS_COARSE_PX = 24;
/** Eğri en az iki nokta taşır; altına inmek onu tanımsız yapar. */
const MIN_POINTS = 2;
/** Klavye adımı alanın yüzde biridir; Shift on katıdır. */
const KEY_STEP_FRACTION = 0.01;
const KEY_STEP_SHIFT_MULTIPLIER = 10;

let curveEditorCounter = 0;

/**
 * Parçalı doğrusal aktarım eğrisi düzenleyicisi.
 *
 * Bir eğriyi sayı tablosu olarak düzenlemek kullanılamaz; eğrinin bütün
 * anlamı BİÇİMİdir. Bu yüzden küçük bir tuval üzerinde noktalar sürüklenir:
 * çift tıkla yeni nokta eklenir, Alt+tık ile silinir.
 *
 * **Tuval yalnız çizimdir.** Her nokta tuvalin üzerinde gerçek bir düğmedir
 * (adlı, Tab ile ulaşılır): ok tuşları taşır (Shift = 10 kat), Delete siler,
 * Enter/Boşluk (kol A) noktayı "tutar" — tutulu noktayı ok tuşları/D-pad taşır, ikinci Enter bırakır,
 * Escape geri alır. Çift tık / Alt+tık yerine dokunma ve kol için "Nokta ekle" / "Noktayı sil"
 * düğmeleri vardır. Noktalar dokunmada geniş yakalama yarıçapıyla tutulur.
 *
 * Noktalar her zaman x'e göre SIRALI tutulur. Sıralamayı düzenleyicinin
 * garanti etmesi, tüketicinin (alan derleyicisi) her okumada sıralama
 * yapmasından ucuz ve kullanıcı için de öngörülebilir: sürüklenen bir nokta
 * komşusunu geçince eğri kendi kendine düğümlenmez; klavye komşusunu geçemez.
 *
 * Çizim, 2B bağlam alınamadığında sessizce atlanır — durum ve sürükleme
 * matematiği tuvale bağlı değildir ve tuvalsiz bir ortamda da test edilebilir.
 */
export class CurveEditor {
  readonly element: HTMLDivElement;
  private readonly stage: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D | null;
  private readonly labelText: HTMLSpanElement | null;
  private readonly announcer: HTMLSpanElement;
  private readonly hint: HTMLSpanElement;
  private readonly addButton: Button;
  private readonly removeButton: Button;
  private readonly handles: HTMLButtonElement[] = [];
  private points: CurvePoint[];
  private readonly domainX: readonly [number, number];
  private readonly domainY: readonly [number, number];
  private onInputHandler?: (points: CurvePoint[]) => void;
  private onCommitHandler?: (points: CurvePoint[]) => void;
  private readonly scope = new DisposableScope();
  private readonly formatter = (value: number): string =>
    new Intl.NumberFormat(i18next.language, { maximumFractionDigits: 2 }).format(value);
  private dragIndex = -1;
  private activePointerId: number | null = null;
  /** Tutulu (klavye/kol) noktanın indeksi; -1 yoksa. */
  private grabIndex = -1;
  /** Son odaklanan ya da dokunulan nokta: "Noktayı sil" bunu hedefler. */
  private selectedIndex = -1;
  private gestureStartPoints: CurvePoint[] | null = null;
  private disabled: boolean;
  private readonly onLanguageChanged = (): void => this.renderHandles();

  constructor(options: CurveEditorOptions = {}) {
    this.onInputHandler = options.onInput;
    this.onCommitHandler = options.onCommit;
    this.domainX = options.domainX ?? [0, 1];
    this.domainY = options.domainY ?? [0, 1];
    this.disabled = options.disabled ?? false;
    this.points = sortPoints(options.points ?? DEFAULT_POINTS);
    const id = `vol-curve-editor-${++curveEditorCounter}`;

    this.element = document.createElement('div');
    this.element.className = ['vol-curve-editor', options.className].filter(Boolean).join(' ');

    if (options.label) {
      const label = document.createElement('span');
      label.className = 'vol-curve-editor__label';
      label.id = `${id}-label`;
      label.textContent = options.label;
      this.element.appendChild(label);
      this.labelText = label;
    } else {
      this.labelText = null;
    }

    this.stage = document.createElement('div');
    this.stage.className = 'vol-curve-editor__stage';
    this.stage.setAttribute('role', 'group');
    if (this.labelText) this.stage.setAttribute('aria-labelledby', this.labelText.id);
    else if (options.ariaLabel) this.stage.setAttribute('aria-label', options.ariaLabel);
    this.stage.setAttribute('aria-describedby', `${id}-hint`);
    this.element.appendChild(this.stage);

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'vol-curve-editor__canvas';
    this.canvas.width = options.width ?? 220;
    this.canvas.height = options.height ?? 140;
    // Çizim yalnız görseldir; nokta düğmeleri ve metin eşdeğerleri erişilebilirlik ağacındadır.
    this.canvas.setAttribute('aria-hidden', 'true');
    this.stage.appendChild(this.canvas);
    this.context = this.canvas.getContext('2d');

    const hint = document.createElement('span');
    hint.className = 'vol-sr-only';
    hint.id = `${id}-hint`;
    hint.textContent = i18next.t('core:curveEditor.hint');
    this.element.appendChild(hint);
    this.hint = hint;

    const tools = document.createElement('div');
    tools.className = 'vol-curve-editor__tools';
    this.addButton = new Button(i18next.t('core:curveEditor.add'), {
      size: 'sm',
      fullWidth: false,
      onClick: () => this.addPointInWidestGap(),
    });
    this.removeButton = new Button(i18next.t('core:curveEditor.remove'), {
      size: 'sm',
      fullWidth: false,
      onClick: () => this.removeSelected(),
    });
    tools.append(this.addButton.element, this.removeButton.element);
    this.element.appendChild(tools);
    this.scope.addDestroyable(this.addButton);
    this.scope.addDestroyable(this.removeButton);

    this.announcer = document.createElement('span');
    this.announcer.className = 'vol-sr-only';
    this.announcer.setAttribute('role', 'status');
    this.element.appendChild(this.announcer);

    this.scope.addListener(this.canvas, 'pointerdown', (event) =>
      this.onPointerDown(event as PointerEvent),
    );
    this.scope.addListener(this.canvas, 'pointermove', (event) =>
      this.onPointerMove(event as PointerEvent),
    );
    this.scope.addListener(this.canvas, 'pointerup', (event) =>
      this.onPointerUp(event as PointerEvent),
    );
    this.scope.addListener(this.canvas, 'pointercancel', (event) =>
      this.onPointerUp(event as PointerEvent),
    );
    this.scope.addListener(this.canvas, 'dblclick', (event) =>
      this.onDoubleClick(event as MouseEvent),
    );
    this.scope.addListener(this.stage, 'keydown', (event) =>
      this.onKeydown(event as KeyboardEvent),
    );
    this.scope.addListener(this.stage, 'focusin', (event) => {
      const index = this.handles.indexOf(event.target as HTMLButtonElement);
      if (index >= 0) this.select(index);
    });
    this.scope.addListener(this.stage, 'focusout', (event) => {
      const index = this.handles.indexOf(event.target as HTMLButtonElement);
      // Tutulan nokta odak başka yere gidince bırakılır (kalıcı değişiklik olarak).
      if (index >= 0 && index === this.grabIndex) this.endGrab(false);
    });

    i18next.on('languageChanged', this.onLanguageChanged);
    this.scope.addSubscription(() => i18next.off('languageChanged', this.onLanguageChanged));

    this.renderHandles();
    this.applyDisabled();
    this.draw();
  }

  getPoints(): CurvePoint[] {
    return this.points.map((point) => [point[0], point[1]] as CurvePoint);
  }

  /** Noktaları dışarıdan ayarlar; kullanıcı callback'leri TETİKLENMEZ. */
  setPoints(points: readonly CurvePoint[]): void {
    this.cancelGesture(false);
    this.points = sortPoints(points);
    this.selectedIndex = Math.min(this.selectedIndex, this.points.length - 1);
    this.renderHandles();
    this.draw();
  }

  setDisabled(disabled: boolean): void {
    if (disabled) this.cancelGesture();
    this.disabled = disabled;
    this.applyDisabled();
    this.draw();
  }

  setLabel(label: string): void {
    if (this.labelText) this.labelText.textContent = label;
  }

  /** Eğriyi verilen girdide değerlendirir — önizleme ve test için. */
  sample(input: number): number {
    const points = this.points;
    if (input <= points[0][0]) return points[0][1];
    const last = points.length - 1;
    if (input >= points[last][0]) return points[last][1];

    let i = 0;
    while (i < last && points[i + 1][0] < input) i++;
    const span = points[i + 1][0] - points[i][0];
    if (span <= 0) return points[i + 1][1];
    const t = (input - points[i][0]) / span;
    return points[i][1] + (points[i + 1][1] - points[i][1]) * t;
  }

  destroy(): void {
    this.scope.dispose();
    this.element.remove();
  }

  /* ── etkileşim ───────────────────────────────────────────────────────── */

  private toCanvas(point: CurvePoint): [number, number] {
    const [x0, x1] = this.domainX;
    const [y0, y1] = this.domainY;
    const spanX = x1 - x0 || 1;
    const spanY = y1 - y0 || 1;
    return [
      ((point[0] - x0) / spanX) * this.canvas.width,
      // Tuval y'si aşağı büyür; eğri yukarı büyür.
      this.canvas.height - ((point[1] - y0) / spanY) * this.canvas.height,
    ];
  }

  private toDomain(px: number, py: number): CurvePoint {
    const [x0, x1] = this.domainX;
    const [y0, y1] = this.domainY;
    const width = this.canvas.width || 1;
    const height = this.canvas.height || 1;
    return [
      clamp(x0 + (px / width) * (x1 - x0), x0, x1),
      clamp(y0 + ((height - py) / height) * (y1 - y0), y0, y1),
    ];
  }

  private eventToCanvas(event: MouseEvent): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    // Ölçüsüz bir tuvalde (henüz yerleşmemiş ya da tarayıcısız ortam) oran
    // hesaplanamaz; birebir kabul edilir.
    const scaleX = rect.width > 0 ? this.canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? this.canvas.height / rect.height : 1;
    return [(event.clientX - rect.left) * scaleX, (event.clientY - rect.top) * scaleY];
  }

  /** Yakalama yarıçapı CSS pikselidir; tuval birimine ölçekle çevrilir. */
  private findNear(px: number, py: number, pointerType: string): number {
    const rect = this.canvas.getBoundingClientRect();
    const scale = rect.width > 0 ? this.canvas.width / rect.width : 1;
    const radius = (pointerType === 'mouse' ? GRAB_RADIUS_MOUSE_PX : GRAB_RADIUS_COARSE_PX) * scale;
    let best = -1;
    let bestDistance = radius;
    this.points.forEach((point, index) => {
      const [cx, cy] = this.toCanvas(point);
      const distance = Math.hypot(cx - px, cy - py);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    return best;
  }

  private onPointerDown(event: PointerEvent): void {
    if (
      this.disabled ||
      this.activePointerId !== null ||
      !event.isPrimary ||
      (event.pointerType === 'mouse' && event.button !== 0)
    ) {
      return;
    }
    const [px, py] = this.eventToCanvas(event);
    const index = this.findNear(px, py, event.pointerType);
    if (index < 0) return;

    if (event.altKey) {
      this.removeAt(index, event);
      return;
    }

    this.cancelGesture();
    this.dragIndex = index;
    this.activePointerId = event.pointerId;
    this.gestureStartPoints = this.getPoints();
    this.select(index);
    // Odak noktanın düğmesine geçer: Escape/ok tuşları aynı noktada çalışır, AT noktayı okur.
    this.handles[index]?.focus({ preventScroll: true });
    this.canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  private onPointerMove(event: PointerEvent): void {
    if (this.dragIndex < 0 || this.activePointerId !== event.pointerId) return;
    const [px, py] = this.eventToCanvas(event);
    const moved = this.toDomain(px, py);
    const next = this.points.map((point, i) => (i === this.dragIndex ? moved : point));
    // Sürüklenen noktanın kimliği sıralamadan sonra da korunmalı, yoksa
    // komşusunu geçtiği anda elden kaçar ve sürükleme kopar.
    const sorted = sortPoints(next);
    this.dragIndex = sorted.findIndex((point) => point === moved);
    this.points = sorted;
    this.selectedIndex = this.dragIndex;
    this.renderHandles();
    this.draw();
    emitUiIntent({
      kind: 'valuePreview',
      origin: 'CurveEditor',
      target: this.handles[this.dragIndex] ?? this.canvas,
      event,
      persistent: false,
    });
    this.onInputHandler?.(this.getPoints());
  }

  private onPointerUp(event: PointerEvent): void {
    if (this.dragIndex < 0 || this.activePointerId !== event.pointerId) return;
    const cancelled = event.type === 'pointercancel';
    const index = this.dragIndex;
    this.dragIndex = -1;
    this.activePointerId = null;
    this.canvas.releasePointerCapture?.(event.pointerId);
    const start = this.gestureStartPoints;
    this.gestureStartPoints = null;
    if (!start || samePoints(start, this.points)) return;
    if (cancelled) {
      this.restore(start);
      return;
    }
    emitUiIntent({
      kind: 'valueCommit',
      origin: 'CurveEditor',
      target: this.handles[index] ?? this.canvas,
      event,
    });
    this.onCommitHandler?.(this.getPoints());
  }

  private onDoubleClick(event: MouseEvent): void {
    if (this.disabled) return;
    const [px, py] = this.eventToCanvas(event);
    if (this.findNear(px, py, 'mouse') >= 0) return;
    const added = this.toDomain(px, py);
    this.points = sortPoints([...this.points, added]);
    this.selectedIndex = this.points.indexOf(added);
    this.commitDiscreteChange(event);
  }

  private onKeydown(event: KeyboardEvent): void {
    const index = this.handles.indexOf(event.target as HTMLButtonElement);
    if (index < 0 || this.disabled || event.isComposing) return;

    if (event.key === 'Escape') {
      // Sürükleme ya da tutma sürerken Escape yalnız hareketi geri alır; katmanı kapatan ikinci Escape'tir.
      if (this.gestureStartPoints === null) return;
      event.preventDefault();
      event.stopPropagation();
      this.cancelGesture();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.removeAt(index);
      return;
    }

    const delta = ARROW_DELTAS[event.key];
    if (!delta || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    const multiplier = event.shiftKey ? KEY_STEP_SHIFT_MULTIPLIER : 1;
    const moved = this.movePointBy(index, delta[0] * multiplier, delta[1] * multiplier);
    if (!moved) return;

    emitUiIntent({
      kind: 'valuePreview',
      origin: 'CurveEditor',
      target: this.handles[index],
      event,
      persistent: false,
    });
    this.onInputHandler?.(this.getPoints());
    this.announce(index);
    // Tutulu nokta bırakılınca tek kalıcı değişiklik olur; tutulmayan ok adımı anında kalıcıdır.
    if (this.grabIndex !== index) {
      emitUiSignal({
        kind: 'valueCommit',
        origin: 'CurveEditor',
        target: this.handles[index],
        source: 'keyboard',
      });
      this.onCommitHandler?.(this.getPoints());
    }
  }

  /** Enter/Boşluk/kol A: noktayı tut ya da bırak. */
  private toggleGrab(index: number): void {
    if (this.disabled) return;
    if (this.grabIndex === index) {
      this.endGrab(false);
      return;
    }
    this.cancelGesture();
    this.grabIndex = index;
    this.gestureStartPoints = this.getPoints();
    const handle = this.handles[index];
    // Tutulu nokta oklarını FocusNav'dan alır (D-pad noktayı taşır); bırakınca gezinme geri gelir.
    handle.dataset.volArrows = 'both';
    handle.setAttribute('aria-pressed', 'true');
    this.announce(index, i18next.t('core:curveEditor.grabbed'));
  }

  /** Tutmayı bitirir; `cancel` ise başlangıç eğrisine döner, değilse değişiklik kalıcı olur. */
  private endGrab(cancel: boolean): void {
    if (this.grabIndex < 0) return;
    const index = this.grabIndex;
    const handle = this.handles[index];
    const start = this.gestureStartPoints;
    this.grabIndex = -1;
    this.gestureStartPoints = null;
    if (handle) {
      delete handle.dataset.volArrows;
      handle.removeAttribute('aria-pressed');
    }
    if (!start || samePoints(start, this.points)) return;
    if (cancel) {
      this.restore(start);
      return;
    }
    emitUiSignal({
      kind: 'valueCommit',
      origin: 'CurveEditor',
      target: handle ?? this.canvas,
      source: 'keyboard',
    });
    this.onCommitHandler?.(this.getPoints());
  }

  /** Sürüklemeyi ya da tutmayı iptal eder; `notify` kapalıysa dinleyiciler çağrılmaz. */
  private cancelGesture(notify = true): void {
    const start = this.gestureStartPoints;
    if (this.dragIndex >= 0) {
      this.canvas.releasePointerCapture?.(this.activePointerId ?? 0);
    }
    this.dragIndex = -1;
    this.activePointerId = null;
    if (this.grabIndex >= 0) {
      const handle = this.handles[this.grabIndex];
      if (handle) {
        delete handle.dataset.volArrows;
        handle.removeAttribute('aria-pressed');
      }
      this.grabIndex = -1;
    }
    this.gestureStartPoints = null;
    if (start && !samePoints(start, this.points)) this.restore(start, notify);
  }

  private restore(points: CurvePoint[], notify = true): void {
    this.points = points;
    this.selectedIndex = Math.min(this.selectedIndex, this.points.length - 1);
    this.renderHandles();
    this.draw();
    if (notify) this.onInputHandler?.(this.getPoints());
  }

  /** Klavye taşıması: komşu noktalar arasında kalır, alan sınırında durur. Değişim olduysa true. */
  private movePointBy(index: number, stepsX: number, stepsY: number): boolean {
    const point = this.points[index];
    const [x0, x1] = this.domainX;
    const [y0, y1] = this.domainY;
    const lowX = index > 0 ? this.points[index - 1][0] : x0;
    const highX = index < this.points.length - 1 ? this.points[index + 1][0] : x1;
    const x = clamp(point[0] + stepsX * (x1 - x0) * KEY_STEP_FRACTION, lowX, highX);
    const y = clamp(point[1] + stepsY * (y1 - y0) * KEY_STEP_FRACTION, y0, y1);
    // Kayan nokta artığı etikette görünmesin.
    const next: CurvePoint = [roundTo(x), roundTo(y)];
    if (next[0] === point[0] && next[1] === point[1]) return false;
    this.points = this.points.map((p, i) => (i === index ? next : p));
    this.renderHandles();
    this.draw();
    return true;
  }

  private select(index: number): void {
    this.selectedIndex = index;
    this.updateTools();
  }

  /** En geniş x aralığının ortasına, eğrinin o noktadaki değeriyle yeni nokta ekler (biçim değişmez). */
  private addPointInWidestGap(): void {
    if (this.disabled) return;
    let at = 0;
    let widest = -1;
    for (let i = 0; i < this.points.length - 1; i++) {
      const gap = this.points[i + 1][0] - this.points[i][0];
      if (gap > widest) {
        widest = gap;
        at = i;
      }
    }
    const x = roundTo((this.points[at][0] + this.points[at + 1][0]) / 2);
    const added: CurvePoint = [x, roundTo(this.sample(x))];
    this.points = sortPoints([...this.points, added]);
    const index = this.points.indexOf(added);
    this.selectedIndex = index;
    this.commitDiscreteChange();
    this.handles[index]?.focus({ preventScroll: true });
    this.announce(index, i18next.t('core:curveEditor.added'));
  }

  private removeSelected(): void {
    if (this.selectedIndex >= 0) this.removeAt(this.selectedIndex);
  }

  private removeAt(index: number, event?: Event): void {
    if (this.disabled || this.points.length <= MIN_POINTS) return;
    const hadFocus = this.handles[index] === document.activeElement;
    this.cancelGesture(false);
    this.points = this.points.filter((_, i) => i !== index);
    this.selectedIndex = Math.min(index, this.points.length - 1);
    this.commitDiscreteChange(event);
    if (hadFocus) this.handles[this.selectedIndex]?.focus({ preventScroll: true });
    this.announce(this.selectedIndex, i18next.t('core:curveEditor.removed'));
  }

  private commitDiscreteChange(event?: Event): void {
    this.renderHandles();
    this.draw();
    const points = this.getPoints();
    if (event) {
      emitUiIntent({
        kind: 'valueCommit',
        origin: 'CurveEditor',
        target: this.handles[Math.max(0, this.selectedIndex)] ?? this.canvas,
        event,
      });
    }
    this.onInputHandler?.(points);
    this.onCommitHandler?.(points);
  }

  /* ── erişilebilirlik ve çizim ────────────────────────────────────────── */

  private pointLabel(index: number): string {
    const point = this.points[index];
    return i18next.t('core:curveEditor.point', {
      index: index + 1,
      count: this.points.length,
      x: this.formatter(point[0]),
      y: this.formatter(point[1]),
    });
  }

  /** Canlı bölge: klavye/kol eylemleri odak düğmesinin adı değişse de duyulur. */
  private announce(index: number, prefix?: string): void {
    if (index < 0 || index >= this.points.length) return;
    const text = this.pointLabel(index);
    this.announcer.textContent = prefix ? `${prefix} ${text}` : text;
  }

  /** Düğme sayısını noktalarla eşler; konum ve ad güncellenir. */
  private renderHandles(): void {
    while (this.handles.length < this.points.length) {
      const handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'vol-curve-editor__point';
      handle.disabled = this.disabled;
      this.scope.addListener(handle, 'click', () => {
        const index = this.handles.indexOf(handle);
        if (index >= 0) this.toggleGrab(index);
      });
      this.stage.appendChild(handle);
      this.handles.push(handle);
    }
    while (this.handles.length > this.points.length) {
      const handle = this.handles.pop()!;
      handle.remove();
    }
    const [x0, x1] = this.domainX;
    const [y0, y1] = this.domainY;
    this.points.forEach((point, index) => {
      const handle = this.handles[index];
      handle.style.left = `${(((point[0] - x0) / (x1 - x0 || 1)) * 100).toFixed(3)}%`;
      handle.style.top = `${(100 - ((point[1] - y0) / (y1 - y0 || 1)) * 100).toFixed(3)}%`;
      handle.setAttribute('aria-label', this.pointLabel(index));
    });
    this.hint.textContent = i18next.t('core:curveEditor.hint');
    this.addButton.setLabel(i18next.t('core:curveEditor.add'));
    this.removeButton.setLabel(i18next.t('core:curveEditor.remove'));
    this.updateTools();
  }

  private applyDisabled(): void {
    this.stage.setAttribute('aria-disabled', String(this.disabled));
    for (const handle of this.handles) handle.disabled = this.disabled;
    this.updateTools();
  }

  private updateTools(): void {
    this.addButton.setDisabled(this.disabled);
    this.removeButton.setDisabled(
      this.disabled || this.selectedIndex < 0 || this.points.length <= MIN_POINTS,
    );
  }

  private draw(): void {
    const context = this.context;
    if (!context) return;

    const { width, height } = this.canvas;
    const style = getComputedStyle(this.canvas);
    const accent = style.getPropertyValue('--vol-ui-brand-solid').trim() || '#d67434';
    const ink = style.getPropertyValue('--vol-ui-text').trim() || '#e8eef5';
    const muted = style.getPropertyValue('--vol-ui-text-secondary').trim() || '#5c6772';
    const grid = style.getPropertyValue('--vol-ui-border-soft').trim() || 'rgba(255,255,255,0.08)';
    context.clearRect(0, 0, width, height);

    context.strokeStyle = grid;
    context.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const x = (width / 4) * i;
      const y = (height / 4) * i;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }

    context.strokeStyle = this.disabled ? muted : accent;
    context.lineWidth = 2;
    context.beginPath();
    this.points.forEach((point, index) => {
      const [x, y] = this.toCanvas(point);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();

    context.fillStyle = this.disabled ? muted : ink;
    for (const point of this.points) {
      const [x, y] = this.toCanvas(point);
      context.beginPath();
      context.arc(x, y, 4, 0, Math.PI * 2);
      context.fill();
    }
  }
}

/** Ok tuşu → [x adımı, y adımı] (y yukarı artar). */
const ARROW_DELTAS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
};

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Kayan nokta artığını (0.30000000000000004) atar; dört ondalık eğri için fazlasıyla yeterlidir. */
function roundTo(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function sortPoints(points: readonly CurvePoint[]): CurvePoint[] {
  return [...points].sort((a, b) => a[0] - b[0]);
}

function samePoints(a: readonly CurvePoint[], b: readonly CurvePoint[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((point, index) => point[0] === b[index][0] && point[1] === b[index][1]);
}
