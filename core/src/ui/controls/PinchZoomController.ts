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
  private readonly cleanups: (() => void)[] = [];
  /** Animasyon class'ini kaldiran bekleyen zamanlayici; destroy() iptal eder. */
  private animationTimer: number | null = null;
  private zoom: number;
  private panX = 0;
  private panY = 0;
  private lastPinchDistance: number | null = null;
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

  destroy(): void {
    if (this.animationTimer !== null) {
      window.clearTimeout(this.animationTimer);
      this.animationTimer = null;
    }
    for (const cleanup of this.cleanups) cleanup();
    this.element.remove();
  }

  private setupGestures(): void {
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const delta = event.deltaY > 0 ? -PINCH_ZOOM.WHEEL_STEP : PINCH_ZOOM.WHEEL_STEP;
      this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom + delta));
      this.applyTransform();
    };
    this.viewport.addEventListener('wheel', onWheel, { passive: false });
    this.cleanups.push(() => this.viewport.removeEventListener('wheel', onWheel));

    const onPointerDown = (event: PointerEvent): void => {
      this.viewport.setPointerCapture(event.pointerId);
      this.activePointers.set(event.pointerId, {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      });

      if (this.activePointers.size === 1) {
        this.lastPanPoint = { x: event.clientX, y: event.clientY };
      } else if (this.activePointers.size === 2) {
        // Pan'dan pinch moduna geçişte referans mesafe sıfırlanır, aksi halde ani bir zoom sıçraması olur.
        this.lastPinchDistance = this.getPinchDistance();
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
      this.viewport.releasePointerCapture(event.pointerId);
      this.activePointers.delete(event.pointerId);
      if (this.activePointers.size < 2) {
        this.lastPinchDistance = null;
      }
      if (this.activePointers.size === 1) {
        const remaining = [...this.activePointers.values()][0];
        this.lastPanPoint = { x: remaining.x, y: remaining.y };
      } else if (this.activePointers.size === 0) {
        this.lastPanPoint = null;
      }
    };

    this.viewport.addEventListener('pointerdown', onPointerDown);
    this.viewport.addEventListener('pointermove', onPointerMove);
    this.viewport.addEventListener('pointerup', onPointerUp);
    this.viewport.addEventListener('pointercancel', onPointerUp);
    this.cleanups.push(() => {
      this.viewport.removeEventListener('pointerdown', onPointerDown);
      this.viewport.removeEventListener('pointermove', onPointerMove);
      this.viewport.removeEventListener('pointerup', onPointerUp);
      this.viewport.removeEventListener('pointercancel', onPointerUp);
    });
  }

  private getPinchDistance(): number {
    const points = [...this.activePointers.values()];
    if (points.length < 2) return 0;
    return Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
  }

  private handlePinch(): void {
    const distance = this.getPinchDistance();
    if (this.lastPinchDistance === null || this.lastPinchDistance === 0) {
      this.lastPinchDistance = distance;
      return;
    }
    const ratio = distance / this.lastPinchDistance;
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * ratio));
    this.lastPinchDistance = distance;
    this.applyTransform();
  }

  private applyTransform(): void {
    this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    this.onTransformChangeHandler?.(this.zoom, this.panX, this.panY);
  }
}
