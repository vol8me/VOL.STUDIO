import { requiredAt } from '../../collections/requiredAt';
import { DisposableScope } from '../../lifecycle/DisposableScope';
import { i18next } from '../../i18n/I18n';
import { PINCH_ZOOM, UI_SIZE, UI_TIMING } from '../../constants';
import { VIEWPORT_SHORTCUTS, isViewportKeyTarget, viewportKeyAction } from './viewportKeys';

export interface PinchZoomControllerOptions {
  /** Yakınlaştırılacak/kaydırılacak içerik — bu element controller'ın içine taşınır. */
  content: HTMLElement;
  minZoom?: number;
  maxZoom?: number;
  /** Başlangıç zoom seviyesi. Varsayılan 1. */
  initialZoom?: number;
  /** Zoom veya pan değiştiğinde çağrılır (ör. bir minimap'i senkronize etmek için). */
  onTransformChange?: (zoom: number, panX: number, panY: number) => void;
  /** Odaklanan yüzeyin erişilebilir adı; verilmezse `core:pinchZoom.label`. */
  label?: string;
  /**
   * Klavye eşdeğeri (varsayılan açık): yüzey odaklanır; `+`/`-` yakınlaştırır, `0`/`Home` sıfırlar, oklar görünümü taşır.
   * Yalnız yüzeyin kendisi odaktayken çalışır. Kapatılırsa yüzey odak almaz; eşdeğeri `zoomBy`/`panBy`/`reset` ile sahibi verir.
   */
  keyboard?: boolean;
}

interface ActivePointer {
  id: number;
  x: number;
  y: number;
}

/**
 * Jenerik pinch-to-zoom + pan katmanı — herhangi bir içeriği sarabilir. Fare: tekerlek=zoom, sürükleme=pan. Dokunmatik:
 * parmak mesafesi=zoom, hareket=pan.
 *
 * **Parmakla büyütme tek yol değildir:** `zoomBy`/`panBy`/`reset` programatik eşdeğerdir (sahibi düğmeye bağlar) ve
 * `keyboard` açıkken yüzey klavyeyle sürülür. Klavye/programatik değişiklikler `role="status"` bölgesinde "Yakınlaştırma %150"
 * diye duyurulur; sürükleme ve sıkıştırma duyurulmaz (kare kare okuyucuya yağmaz). Geçiş animasyonu hareket azaltmada kapanır.
 */
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
  /** Animasyon class'ini kaldıran bekleyen zamanlayıcı; destroy() iptal eder. */
  private animationTimer: number | null = null;
  private zoom: number;
  private panX = 0;
  private panY = 0;
  private lastPinchDistance: number | null = null;
  private lastPinchCenter: { x: number; y: number } | null = null;
  private lastPanPoint: { x: number; y: number } | null = null;
  private readonly announcer: HTMLDivElement;

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

    this.announcer = document.createElement('div');
    this.announcer.className = 'vol-sr-only';
    this.announcer.setAttribute('role', 'status');
    this.element.appendChild(this.announcer);

    const keyboard = options.keyboard ?? true;
    if (keyboard) {
      this.viewport.tabIndex = 0;
      this.viewport.setAttribute('role', 'group');
      this.viewport.setAttribute('aria-label', options.label ?? i18next.t('core:pinchZoom.label'));
      this.viewport.setAttribute('aria-keyshortcuts', VIEWPORT_SHORTCUTS);
    }

    this.canvas = document.createElement('div');
    this.canvas.className = 'vol-pinch-zoom__canvas';
    this.canvas.appendChild(options.content);
    this.viewport.appendChild(this.canvas);

    this.setupGestures();
    if (keyboard) this.setupKeyboard();
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
      }, UI_TIMING.ZOOM_TRANSITION_MS);
    }
  }

  /** Zoom/pan'ı başlangıç durumuna sıfırlar (animasyonlu) ve yeni düzeyi duyurur. */
  reset(): void {
    this.setTransform(1, 0, 0, true);
    this.announceZoom();
  }

  /**
   * Görünümün ORTASINI sabit tutarak zoom'u `delta` kadar değiştirir (parmak sıkıştırmanın programatik/klavye eşdeğeri).
   * Sınıra varıldıysa değişiklik olmaz; yine de düzey duyurulur ki kullanıcı sınırı bilsin.
   */
  zoomBy(delta: number = PINCH_ZOOM.KEY_STEP, animate = true): void {
    const rect = this.viewport.getBoundingClientRect();
    const next = this.zoomedTransform(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
      this.zoom + delta,
    );
    if (next) this.setTransform(next.zoom, next.panX, next.panY, animate);
    this.announceZoom();
  }

  /**
   * İçeriği ekranda `dx`/`dy` piksel kaydırır (sürüklemeyle aynı yön: pozitif dx içeriği sağa taşır). Ok tuşları görünümü
   * taşıdığından işareti çevirir.
   */
  panBy(dx: number, dy: number, animate = true): void {
    this.setTransform(this.zoom, this.panX + dx, this.panY + dy, animate);
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
        const remaining = requiredAt([...this.activePointers.values()], 0);
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
    return Math.hypot(
      requiredAt(points, 1).x - requiredAt(points, 0).x,
      requiredAt(points, 1).y - requiredAt(points, 0).y,
    );
  }

  private getPinchCenter(): { x: number; y: number } | null {
    const points = [...this.activePointers.values()];
    if (points.length < 2) return null;
    return {
      x: (requiredAt(points, 0).x + requiredAt(points, 1).x) / 2,
      y: (requiredAt(points, 0).y + requiredAt(points, 1).y) / 2,
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
    const next = this.zoomedTransform(clientX, clientY, requestedZoom);
    if (!next) return;
    this.panX = next.panX;
    this.panY = next.panY;
    this.zoom = next.zoom;
    this.applyTransform();
  }

  /** `zoomAt` ve `zoomBy`nin ortak hesabı: zoom sınırda kalırsa `null`. */
  private zoomedTransform(
    clientX: number,
    clientY: number,
    requestedZoom: number,
  ): { zoom: number; panX: number; panY: number } | null {
    const nextZoom = Math.min(this.maxZoom, Math.max(this.minZoom, requestedZoom));
    if (nextZoom === this.zoom) return null;
    const ratio = nextZoom / this.zoom;
    const viewportRect = this.viewport.getBoundingClientRect();
    const [originX, originY] = this.transformOrigin();
    const pointX = clientX - viewportRect.left;
    const pointY = clientY - viewportRect.top;
    return {
      zoom: nextZoom,
      panX: (pointX - originX) * (1 - ratio) + ratio * this.panX,
      panY: (pointY - originY) * (1 - ratio) + ratio * this.panY,
    };
  }

  private setupKeyboard(): void {
    const onKeydown = (event: KeyboardEvent): void => {
      if (!isViewportKeyTarget(event, this.viewport)) return;
      const action = viewportKeyAction(event);
      if (!action) return;
      event.preventDefault();
      switch (action.kind) {
        case 'zoom':
          this.zoomBy(action.direction * PINCH_ZOOM.KEY_STEP);
          break;
        case 'reset':
        case 'fit':
          this.reset();
          break;
        case 'pan':
          // Ok tuşu GÖRÜNÜMÜ taşır (kaydırma kuralı); içerik ters yöne gider.
          this.panBy(
            -action.x * UI_SIZE.VIEWPORT_KEY_PAN_PX,
            -action.y * UI_SIZE.VIEWPORT_KEY_PAN_PX,
          );
          break;
      }
    };
    this.viewport.addEventListener('keydown', onKeydown);
    this.scope.add({ dispose: () => this.viewport.removeEventListener('keydown', onKeydown) });
  }

  private announceZoom(): void {
    this.announcer.textContent = i18next.t('core:pinchZoom.level', {
      percent: Math.round(this.zoom * 100),
    });
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
