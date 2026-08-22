import { DisposableScope } from '../../lifecycle/DisposableScope';
import { PINCH_ZOOM, UI_TIMING } from '../../constants';

export interface PinchZoomControllerOptions {
  /** Yakınlaştırılacak/kaydırılacak içerik — bu element controller'ın içine taşınır. */
  content: HTMLElement;
  minZoom?: number;
  maxZoom?: number;
  /** Başlangıç zoom seviyesi. Varsayılan 1. */
  initialZoom?: number;
  /** Zoom veya pan değiştiğinde çağrılır (ör. bir minimap'i senkronize etmek için). */
  onTransformChange?: (zoom: number, panX: number, panY: number) => void;
}

interface ActivePointer {
  id: number;
  x: number;
  y: number;
}

/** Jenerik pinch-to-zoom + pan katmanı — herhangi bir içeriği sarabilir. Fare: tekerlek=zoom, sürükleme=pan. Dokunmatik: parmak mesafesi=zoom, hareket=pan. */
export class PinchZoomController {
  readonly element: HTMLDivElement;
  private readonly viewport: HTMLDivElement;
  private readonly canvas: HTMLDivElement;
  private readonly minZoom: number;
  private readonly maxZoom: number;
  private readonly onTransformChangeHandler?: (zoom: number, panX: number, panY: number) => void;
  private readonly activePointers = new Map<number, ActivePointer>();
  /**
   * Bu bileşenin ömrüne bağlı kaynaklar.
   *
   * Elle yönetilen bir `(() => void)[]` dizisiydi. `DisposableScope`in üç
   * farkı var ve üçü de davranışsal: kapatma TERS sırada yapılır (kaynaklar
   * arası bağımlılık genelde bu yönde kurulur), ikinci `dispose()` no-op'tur
   * ve bir kaynağın kapatılması FIRLATIRSA geri kalanlar yine kapatılır —
   * düz `for` döngüsü ilk hatada duruyor ve kalan her şeyi sızdırıyordu.
   */
  private readonly scope = new DisposableScope();
  /** Animasyon class'ini kaldiran bekleyen zamanlayici; destroy() iptal eder. */
  private animationTimer: number | null = null;
  private zoom: number;
  private panX = 0;
  private panY = 0;
  private lastPinchDistance: number | null = null;
  private lastPinchCenter: { x: number; y: number } | null = null;
  private lastPanPoint: { x: number; y: number } | null = null;

  constructor(options: PinchZoomControllerOptions) {
    this.minZoom = options.minZoom ?? PINCH_ZOOM.MIN;
    this.maxZoom = options.maxZoom ?? PINCH_ZOOM.MAX;
    this.zoom = options.initialZoom ?? PINCH_ZOOM.INITIAL;
    this.onTransformChangeHandler = options.onTransformChange;

    this.element = document.createElement('div');
    this.element.className = 'vol-pinch-zoom';

    this.viewport = document.createElement('div');
    this.viewport.className = 'vol-pinch-zoom__viewport';
    this.element.appendChild(this.viewport);

    this.canvas = document.createElement('div');
    this.canvas.className = 'vol-pinch-zoom__canvas';
    this.canvas.appendChild(options.content);
    this.viewport.appendChild(this.canvas);

    this.setupGestures();
    this.applyTransform();
  }

  /** Zoom/pan'ı belirtilen değerlere, kısa bir geçiş animasyonuyla ayarlar. */
  setTransform(zoom: number, panX: number, panY: number, animate = true): void {
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, zoom));
    this.panX = panX;
    this.panY = panY;
    if (animate) this.canvas.classList.add('vol-pinch-zoom__canvas--animated');
    this.applyTransform();
    if (animate) {
      if (this.animationTimer !== null) window.clearTimeout(this.animationTimer);
      this.animationTimer = window.setTimeout(() => {
        this.animationTimer = null;
        this.canvas.classList.remove('vol-pinch-zoom__canvas--animated');
      }, UI_TIMING.ZOOM_TRANSITION);
    }
  }

  /** Zoom/pan'ı başlangıç durumuna sıfırlar (animasyonlu). */
  reset(): void {
    this.setTransform(1, 0, 0, true);
  }

  getZoom(): number {
    return this.zoom;
  }

  /** Geçerli pan — dış kontrolün zoom'u pan'ı sıfırlamadan değiştirmesi için. */
  getPan(): readonly [number, number] {
    return [this.panX, this.panY];
  }

  destroy(): void {
    if (this.animationTimer !== null) {
      window.clearTimeout(this.animationTimer);
      this.animationTimer = null;
    }
    this.scope.dispose();
    this.activePointers.clear();
    this.element.remove();
  }

  private setupGestures(): void {
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const delta = event.deltaY > 0 ? -PINCH_ZOOM.WHEEL_STEP : PINCH_ZOOM.WHEEL_STEP;
      this.zoomAt(event.clientX, event.clientY, this.zoom + delta);
    };
    this.viewport.addEventListener('wheel', onWheel, { passive: false });
    this.scope.add({ dispose: () => this.viewport.removeEventListener('wheel', onWheel) });

    const onPointerDown = (event: PointerEvent): void => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      this.viewport.setPointerCapture(event.pointerId);
      this.activePointers.set(event.pointerId, {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      });

      if (this.activePointers.size === 1) {
        this.element.classList.add('vol-pinch-zoom--dragging');
        this.lastPanPoint = { x: event.clientX, y: event.clientY };
      } else if (this.activePointers.size === 2) {
        // Pan'dan pinch moduna geçişte referans mesafe sıfırlanır, aksi halde ani bir zoom sıçraması olur.
        this.lastPinchDistance = this.getPinchDistance();
        this.lastPinchCenter = this.getPinchCenter();
        this.lastPanPoint = null;
      }
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (!this.activePointers.has(event.pointerId)) return;
      this.activePointers.set(event.pointerId, {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      });

      if (this.activePointers.size === 2) {
        this.handlePinch();
      } else if (this.activePointers.size === 1 && this.lastPanPoint) {
        const dx = event.clientX - this.lastPanPoint.x;
        const dy = event.clientY - this.lastPanPoint.y;
        this.panX += dx;
        this.panY += dy;
        this.lastPanPoint = { x: event.clientX, y: event.clientY };
        this.applyTransform();
      }
    };

    const onPointerUp = (event: PointerEvent): void => {
      if (!this.activePointers.has(event.pointerId)) return;
      if (this.viewport.hasPointerCapture(event.pointerId)) {
        this.viewport.releasePointerCapture(event.pointerId);
      }
      this.activePointers.delete(event.pointerId);
      if (this.activePointers.size < 2) {
        this.lastPinchDistance = null;
        this.lastPinchCenter = null;
      }
      if (this.activePointers.size === 1) {
        const remaining = [...this.activePointers.values()][0];
        this.lastPanPoint = { x: remaining.x, y: remaining.y };
      } else if (this.activePointers.size === 0) {
        this.lastPanPoint = null;
        this.element.classList.remove('vol-pinch-zoom--dragging');
      }
    };

    this.viewport.addEventListener('pointerdown', onPointerDown);
    this.viewport.addEventListener('pointermove', onPointerMove);
    this.viewport.addEventListener('pointerup', onPointerUp);
    this.viewport.addEventListener('pointercancel', onPointerUp);
    this.scope.add({
      dispose: () => {
        this.viewport.removeEventListener('pointerdown', onPointerDown);
        this.viewport.removeEventListener('pointermove', onPointerMove);
        this.viewport.removeEventListener('pointerup', onPointerUp);
        this.viewport.removeEventListener('pointercancel', onPointerUp);
      },
    });
  }

  private getPinchDistance(): number {
    const points = [...this.activePointers.values()];
    if (points.length < 2) return 0;
    return Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
  }

  private getPinchCenter(): { x: number; y: number } | null {
    const points = [...this.activePointers.values()];
    if (points.length < 2) return null;
    return {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2,
    };
  }

  private handlePinch(): void {
    const distance = this.getPinchDistance();
    const center = this.getPinchCenter();
    if (
      this.lastPinchDistance === null ||
      this.lastPinchDistance === 0 ||
      this.lastPinchCenter === null ||
      center === null
    ) {
      this.lastPinchDistance = distance;
      this.lastPinchCenter = center;
      return;
    }
    // İki parmak birlikte yürürse kamera da yürür; yalnızca mesafeyi okumak
    // pinch sırasında içeriği parmakların altından kaçırıyordu.
    this.panX += center.x - this.lastPinchCenter.x;
    this.panY += center.y - this.lastPinchCenter.y;
    const ratio = distance / this.lastPinchDistance;
    this.zoomAt(center.x, center.y, this.zoom * ratio);
    this.lastPinchDistance = distance;
    this.lastPinchCenter = center;
  }

  /** İmlecin altındaki içerik noktası zoom boyunca aynı ekranda kalır. */
  private zoomAt(clientX: number, clientY: number, requestedZoom: number): void {
    const nextZoom = Math.min(this.maxZoom, Math.max(this.minZoom, requestedZoom));
    if (nextZoom === this.zoom) return;
    const ratio = nextZoom / this.zoom;
    const viewportRect = this.viewport.getBoundingClientRect();
    const [originX, originY] = this.transformOrigin();
    const pointX = clientX - viewportRect.left;
    const pointY = clientY - viewportRect.top;
    this.panX = (pointX - originX) * (1 - ratio) + ratio * this.panX;
    this.panY = (pointY - originY) * (1 - ratio) + ratio * this.panY;
    this.zoom = nextZoom;
    this.applyTransform();
  }

  private transformOrigin(): readonly [number, number] {
    const value = getComputedStyle(this.canvas).transformOrigin.split(/\s+/);
    const parse = (raw: string | undefined, size: number): number => {
      if (!raw) return 0;
      if (raw.endsWith('%')) return (Number.parseFloat(raw) / 100) * size;
      const number = Number.parseFloat(raw);
      return Number.isFinite(number) ? number : 0;
    };
    return [parse(value[0], this.canvas.offsetWidth), parse(value[1], this.canvas.offsetHeight)];
  }

  private applyTransform(): void {
    this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    this.onTransformChangeHandler?.(this.zoom, this.panX, this.panY);
  }
}
