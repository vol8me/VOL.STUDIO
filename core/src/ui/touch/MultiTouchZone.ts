export interface MultiTouchPoint {
  pointerId: number;
  /** Zone elementinin sol-üst köşesine göre X (piksel). */
  x: number;
  /** Zone elementinin sol-üst köşesine göre Y (piksel). */
  y: number;
}

export interface MultiTouchZoneOptions {
  content?: HTMLElement;
  /** Aynı anda takip edilecek maksimum parmak sayısı. Aşan yeni dokunuşlar yok sayılır. Varsayılan Infinity (sınırsız). */
  maxTouches?: number;
  /** Bir parmak zone'a değdiğinde çağrılır. */
  onTouchStart?: (point: MultiTouchPoint) => void;
  /** Zone üzerindeki bir parmak hareket ettiğinde çağrılır. */
  onTouchMove?: (point: MultiTouchPoint) => void;
  /** Bir parmak kaldırıldığında/iptal edildiğinde çağrılır. */
  onTouchEnd?: (pointerId: number) => void;
  size?: { width: number; height: number };
}

/**
 * Aynı anda birden fazla parmağı bağımsız olarak takip eden bir alan — her
 * parmak kendi `pointerId`siyle ayrı raporlanır. Joystick/PinchZoomController'ın
 * "parmakları birleştirip tek bir anlam çıkarma" modelinden farkı budur.
 * RTS'te çoklu birim seçimi, ritim oyunlarında çoklu tuş basımı gibi
 * senaryolar için. `maxTouches` aşıldığında yeni dokunuşlar sessizce yok sayılır.
 */
export class MultiTouchZone {
  readonly element: HTMLDivElement;
  private readonly maxTouches: number;
  private readonly onTouchStartHandler?: (point: MultiTouchPoint) => void;
  private readonly onTouchMoveHandler?: (point: MultiTouchPoint) => void;
  private readonly onTouchEndHandler?: (pointerId: number) => void;
  private readonly activePointers = new Set<number>();
  private boundPointerDown: (event: PointerEvent) => void;
  private boundPointerMove: (event: PointerEvent) => void;
  private boundPointerUp: (event: PointerEvent) => void;

  constructor(options: MultiTouchZoneOptions = {}) {
    this.maxTouches = options.maxTouches ?? Infinity;
    this.onTouchStartHandler = options.onTouchStart;
    this.onTouchMoveHandler = options.onTouchMove;
    this.onTouchEndHandler = options.onTouchEnd;

    this.element = document.createElement('div');
    this.element.className = 'vol-multitouch-zone';
    this.element.style.touchAction = 'none';
    if (options.size) {
      this.element.style.width = `${options.size.width}px`;
      this.element.style.height = `${options.size.height}px`;
    }
    if (options.content) {
      this.element.appendChild(options.content);
    }

    this.boundPointerDown = (event) => this.handlePointerDown(event);
    this.boundPointerMove = (event) => this.handlePointerMove(event);
    this.boundPointerUp = (event) => this.handlePointerUp(event);
    this.element.addEventListener('pointerdown', this.boundPointerDown);
    this.element.addEventListener('pointermove', this.boundPointerMove);
    this.element.addEventListener('pointerup', this.boundPointerUp);
    this.element.addEventListener('pointercancel', this.boundPointerUp);
  }

  /** Şu an zone üzerinde aktif olan parmakların pointerId'lerini döner. */
  getActivePointerIds(): number[] {
    return Array.from(this.activePointers);
  }

  destroy(): void {
    // Aktif parmaklar varken yok edilirse çağıranın parmak-başına durumu
    // (seçim, çizim, tuş) ASILI KALIRDI: `onTouchEnd` hiç gelmiyordu. DOM
    // kaldırıldığında tarayıcı capture'ı kendi bırakır ama bu örtük davranışa
    // yaslanmak, tüketiciye bildirim borcunu ödemez.
    for (const pointerId of [...this.activePointers]) {
      if (this.element.hasPointerCapture(pointerId)) {
        this.element.releasePointerCapture(pointerId);
      }
      this.activePointers.delete(pointerId);
      this.onTouchEndHandler?.(pointerId);
    }

    this.element.removeEventListener('pointerdown', this.boundPointerDown);
    this.element.removeEventListener('pointermove', this.boundPointerMove);
    this.element.removeEventListener('pointerup', this.boundPointerUp);
    this.element.removeEventListener('pointercancel', this.boundPointerUp);
    this.element.remove();
  }

  private toLocalPoint(event: PointerEvent): MultiTouchPoint {
    const rect = this.element.getBoundingClientRect();
    return {
      pointerId: event.pointerId,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  private handlePointerDown(event: PointerEvent): void {
    if (this.activePointers.size >= this.maxTouches) return;
    event.preventDefault();
    this.activePointers.add(event.pointerId);
    this.element.setPointerCapture(event.pointerId);
    this.onTouchStartHandler?.(this.toLocalPoint(event));
  }

  private handlePointerMove(event: PointerEvent): void {
    if (!this.activePointers.has(event.pointerId)) return;
    this.onTouchMoveHandler?.(this.toLocalPoint(event));
  }

  private handlePointerUp(event: PointerEvent): void {
    if (!this.activePointers.has(event.pointerId)) return;
    if (this.element.hasPointerCapture(event.pointerId)) {
      this.element.releasePointerCapture(event.pointerId);
    }
    this.activePointers.delete(event.pointerId);
    this.onTouchEndHandler?.(event.pointerId);
  }
}
