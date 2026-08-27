import { DisposableScope } from '../../lifecycle/DisposableScope';

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
/** Bir noktayı yakalamak için gereken azami piksel uzaklığı. */
const GRAB_RADIUS = 10;
/** Eğri en az iki nokta taşır; altına inmek onu tanımsız yapar. */
const MIN_POINTS = 2;

/**
 * Parçalı doğrusal aktarım eğrisi düzenleyicisi.
 *
 * Bir eğriyi sayı tablosu olarak düzenlemek kullanılamaz; eğrinin bütün
 * anlamı BİÇİMİdir. Bu yüzden küçük bir tuval üzerinde noktalar sürüklenir:
 * çift tıkla yeni nokta eklenir, Alt+tık ile silinir.
 *
 * Noktalar her zaman x'e göre SIRALI tutulur. Sıralamayı düzenleyicinin
 * garanti etmesi, tüketicinin (alan derleyicisi) her okumada sıralama
 * yapmasından ucuz ve kullanıcı için de öngörülebilir: sürüklenen bir nokta
 * komşusunu geçince eğri kendi kendine düğümlenmez.
 *
 * Çizim, 2B bağlam alınamadığında sessizce atlanır — durum ve sürükleme
 * matematiği tuvale bağlı değildir ve tuvalsiz bir ortamda da test edilebilir.
 */
export class CurveEditor {
  readonly element: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D | null;
  private readonly labelText: HTMLSpanElement | null;
  private points: CurvePoint[];
  private readonly domainX: readonly [number, number];
  private readonly domainY: readonly [number, number];
  private onInputHandler?: (points: CurvePoint[]) => void;
  private onCommitHandler?: (points: CurvePoint[]) => void;
  private readonly scope = new DisposableScope();
  private dragIndex = -1;
  private gestureStartPoints: CurvePoint[] | null = null;
  private disabled: boolean;

  constructor(options: CurveEditorOptions = {}) {
    this.onInputHandler = options.onInput;
    this.onCommitHandler = options.onCommit;
    this.domainX = options.domainX ?? [0, 1];
    this.domainY = options.domainY ?? [0, 1];
    this.disabled = options.disabled ?? false;
    this.points = sortPoints(options.points ?? DEFAULT_POINTS);

    this.element = document.createElement('div');
    this.element.className = ['vol-curve-editor', options.className].filter(Boolean).join(' ');

    if (options.label) {
      const label = document.createElement('span');
      label.className = 'vol-curve-editor__label';
      label.textContent = options.label;
      this.element.appendChild(label);
      this.labelText = label;
    } else {
      this.labelText = null;
    }

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'vol-curve-editor__canvas';
    this.canvas.width = options.width ?? 220;
    this.canvas.height = options.height ?? 140;
    this.element.appendChild(this.canvas);
    this.context = this.canvas.getContext('2d');

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

    this.draw();
  }

  getPoints(): CurvePoint[] {
    return this.points.map((point) => [point[0], point[1]] as CurvePoint);
  }

  /** Noktaları dışarıdan ayarlar; kullanıcı callback'leri TETİKLENMEZ. */
  setPoints(points: readonly CurvePoint[]): void {
    this.points = sortPoints(points);
    this.draw();
  }

  setDisabled(disabled: boolean): void {
    this.disabled = disabled;
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

  private findNear(px: number, py: number): number {
    let best = -1;
    let bestDistance = GRAB_RADIUS;
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
    if (this.disabled) return;
    const [px, py] = this.eventToCanvas(event);
    const index = this.findNear(px, py);
    if (index < 0) return;

    if (event.altKey) {
      if (this.points.length <= MIN_POINTS) return;
      this.points = this.points.filter((_, i) => i !== index);
      this.commitDiscreteChange();
      return;
    }

    this.dragIndex = index;
    this.gestureStartPoints = this.getPoints();
    this.canvas.setPointerCapture?.(event.pointerId);
  }

  private onPointerMove(event: PointerEvent): void {
    if (this.dragIndex < 0) return;
    const [px, py] = this.eventToCanvas(event);
    const moved = this.toDomain(px, py);
    const next = this.points.map((point, i) => (i === this.dragIndex ? moved : point));
    // Sürüklenen noktanın kimliği sıralamadan sonra da korunmalı, yoksa
    // komşusunu geçtiği anda elden kaçar ve sürükleme kopar.
    const sorted = sortPoints(next);
    this.dragIndex = sorted.findIndex((point) => point === moved);
    this.points = sorted;
    this.draw();
    this.onInputHandler?.(this.getPoints());
  }

  private onPointerUp(event: PointerEvent): void {
    if (this.dragIndex < 0) return;
    const cancelled = event.type === 'pointercancel';
    this.dragIndex = -1;
    this.canvas.releasePointerCapture?.(event.pointerId);
    const start = this.gestureStartPoints;
    this.gestureStartPoints = null;
    if (!start || samePoints(start, this.points)) return;
    if (cancelled) {
      this.points = start;
      this.draw();
      this.onInputHandler?.(this.getPoints());
      return;
    }
    this.onCommitHandler?.(this.getPoints());
  }

  private onDoubleClick(event: MouseEvent): void {
    if (this.disabled) return;
    const [px, py] = this.eventToCanvas(event);
    if (this.findNear(px, py) >= 0) return;
    this.points = sortPoints([...this.points, this.toDomain(px, py)]);
    this.commitDiscreteChange();
  }

  private commitDiscreteChange(): void {
    this.draw();
    const points = this.getPoints();
    this.onInputHandler?.(points);
    this.onCommitHandler?.(points);
  }

  /* ── çizim ───────────────────────────────────────────────────────────── */

  private draw(): void {
    const context = this.context;
    if (!context) return;

    const { width, height } = this.canvas;
    context.clearRect(0, 0, width, height);

    context.strokeStyle = 'rgba(255,255,255,0.08)';
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

    context.strokeStyle = this.disabled ? '#5c6772' : '#d67434';
    context.lineWidth = 2;
    context.beginPath();
    this.points.forEach((point, index) => {
      const [x, y] = this.toCanvas(point);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();

    context.fillStyle = this.disabled ? '#5c6772' : '#e8eef5';
    for (const point of this.points) {
      const [x, y] = this.toCanvas(point);
      context.beginPath();
      context.arc(x, y, 4, 0, Math.PI * 2);
      context.fill();
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function sortPoints(points: readonly CurvePoint[]): CurvePoint[] {
  return [...points].sort((a, b) => a[0] - b[0]);
}

function samePoints(a: readonly CurvePoint[], b: readonly CurvePoint[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((point, index) => point[0] === b[index][0] && point[1] === b[index][1]);
}
