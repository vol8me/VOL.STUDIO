export interface ViewportPoint {
  x: number;
  y: number;
}

export interface CanvasViewportTransform {
  /** Belge origin'inin viewport-local CSS pikselindeki X konumu. */
  offsetX: number;
  /** Belge origin'inin viewport-local CSS pikselindeki Y konumu. */
  offsetY: number;
  zoom: number;
}

export type CanvasViewportChangeReason = 'pan' | 'zoom' | 'fit' | 'actual-size' | 'programmatic';

export interface CanvasViewportControllerOptions {
  documentWidth: number;
  documentHeight: number;
  minZoom?: number;
  maxZoom?: number;
  initialTransform?: Partial<CanvasViewportTransform>;
  fitPadding?: number;
  wheelSensitivity?: number;
  onChange?: (transform: CanvasViewportTransform, reason: CanvasViewportChangeReason) => void;
  onCommit?: (transform: CanvasViewportTransform, reason: 'pan' | 'zoom') => void;
}

/**
 * Editör tuvalleri için araç girdisinden bağımsız kamera denetleyicisi.
 * Normal sol sürükleme kasıtlı olarak pan değildir; yalnız orta tuş veya
 * `Space + sol sürükleme` kamerayı taşır.
 */
export class CanvasViewportController {
  private readonly element: HTMLElement;
  private documentWidth: number;
  private documentHeight: number;
  private readonly minZoom: number;
  private readonly maxZoom: number;
  private readonly fitPadding: number;
  private readonly wheelSensitivity: number;
  private readonly onChangeHandler?: CanvasViewportControllerOptions['onChange'];
  private readonly onCommitHandler?: CanvasViewportControllerOptions['onCommit'];
  private transform: CanvasViewportTransform;
  private spacePressed = false;
  private pointerInside = false;
  private pan: {
    pointerId: number;
    clientX: number;
    clientY: number;
    offsetX: number;
    offsetY: number;
  } | null = null;
  private destroyed = false;
  private readonly boundPointerDown: (event: PointerEvent) => void;
  private readonly boundPointerMove: (event: PointerEvent) => void;
  private readonly boundPointerEnd: (event: PointerEvent) => void;
  private readonly boundWheel: (event: WheelEvent) => void;
  private readonly boundPointerEnter: () => void;
  private readonly boundPointerLeave: () => void;
  private readonly boundKeydown: (event: KeyboardEvent) => void;
  private readonly boundKeyup: (event: KeyboardEvent) => void;
  private readonly boundBlur: () => void;

  constructor(element: HTMLElement, options: CanvasViewportControllerOptions) {
    this.element = element;
    this.documentWidth = this.validExtent(options.documentWidth);
    this.documentHeight = this.validExtent(options.documentHeight);
    this.minZoom = this.validZoom(options.minZoom ?? 0.05, 0.05);
    this.maxZoom = Math.max(this.minZoom, this.validZoom(options.maxZoom ?? 64, 64));
    this.fitPadding = Math.max(0, options.fitPadding ?? 32);
    this.wheelSensitivity = Math.max(0.0001, options.wheelSensitivity ?? 0.0015);
    this.onChangeHandler = options.onChange;
    this.onCommitHandler = options.onCommit;
    this.transform = {
      offsetX: this.finite(options.initialTransform?.offsetX, 0),
      offsetY: this.finite(options.initialTransform?.offsetY, 0),
      zoom: this.clampZoom(options.initialTransform?.zoom ?? 1),
    };

    this.element.classList.add('vol-canvas-viewport');
    this.boundPointerDown = (event) => this.startPan(event);
    this.boundPointerMove = (event) => this.movePan(event);
    this.boundPointerEnd = (event) => this.endPan(event, event.type === 'pointercancel');
    this.boundWheel = (event) => this.handleWheel(event);
    this.boundPointerEnter = () => {
      this.pointerInside = true;
      this.renderCursor();
    };
    this.boundPointerLeave = () => {
      this.pointerInside = false;
      this.renderCursor();
    };
    this.boundKeydown = (event) => this.handleKeydown(event);
    this.boundKeyup = (event) => this.handleKeyup(event);
    this.boundBlur = () => {
      this.spacePressed = false;
      this.cancelPan(false);
      this.renderCursor();
    };

    this.element.addEventListener('pointerdown', this.boundPointerDown, { capture: true });
    this.element.addEventListener('pointermove', this.boundPointerMove, { capture: true });
    this.element.addEventListener('pointerup', this.boundPointerEnd, { capture: true });
    this.element.addEventListener('pointercancel', this.boundPointerEnd, { capture: true });
    this.element.addEventListener('pointerenter', this.boundPointerEnter);
    this.element.addEventListener('pointerleave', this.boundPointerLeave);
    this.element.addEventListener('wheel', this.boundWheel, { passive: false });
    window.addEventListener('keydown', this.boundKeydown);
    window.addEventListener('keyup', this.boundKeyup);
    window.addEventListener('blur', this.boundBlur);
  }

  getTransform(): CanvasViewportTransform {
    return { ...this.transform };
  }

  /** Programatik dönüşüm renderer'a bildirilir, fakat kullanıcı commit'i sayılmaz. */
  setTransform(transform: CanvasViewportTransform): void {
    this.transform = {
      offsetX: this.finite(transform.offsetX, this.transform.offsetX),
      offsetY: this.finite(transform.offsetY, this.transform.offsetY),
      zoom: this.clampZoom(transform.zoom),
    };
    this.emitChange('programmatic');
  }

  setDocumentSize(width: number, height: number): void {
    this.documentWidth = this.validExtent(width);
    this.documentHeight = this.validExtent(height);
  }

  /** Client/screen koordinatını belge koordinatına çevirir. */
  screenToDocument(point: ViewportPoint): ViewportPoint {
    const origin = this.viewportOrigin();
    return {
      x: (point.x - origin.left - this.transform.offsetX) / this.transform.zoom,
      y: (point.y - origin.top - this.transform.offsetY) / this.transform.zoom,
    };
  }

  /** Belge koordinatını client/screen koordinatına çevirir. */
  documentToScreen(point: ViewportPoint): ViewportPoint {
    const origin = this.viewportOrigin();
    return {
      x: origin.left + this.transform.offsetX + point.x * this.transform.zoom,
      y: origin.top + this.transform.offsetY + point.y * this.transform.zoom,
    };
  }

  fit(padding = this.fitPadding): void {
    const size = this.viewportSize();
    const safePadding = Math.max(0, padding);
    const availableWidth = Math.max(1, size.width - safePadding * 2);
    const availableHeight = Math.max(1, size.height - safePadding * 2);
    const zoom = this.clampZoom(
      Math.min(availableWidth / this.documentWidth, availableHeight / this.documentHeight),
    );
    this.centerDocument(zoom);
    this.emitChange('fit');
  }

  actualSize(): void {
    this.centerDocument(this.clampZoom(1));
    this.emitChange('actual-size');
  }

  zoomAt(screenPoint: ViewportPoint, zoom: number): void {
    this.applyZoom(screenPoint, zoom);
    this.emitChange('programmatic');
  }

  isPanning(): boolean {
    return this.pan !== null;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancelPan(false);
    this.element.removeEventListener('pointerdown', this.boundPointerDown, { capture: true });
    this.element.removeEventListener('pointermove', this.boundPointerMove, { capture: true });
    this.element.removeEventListener('pointerup', this.boundPointerEnd, { capture: true });
    this.element.removeEventListener('pointercancel', this.boundPointerEnd, { capture: true });
    this.element.removeEventListener('pointerenter', this.boundPointerEnter);
    this.element.removeEventListener('pointerleave', this.boundPointerLeave);
    this.element.removeEventListener('wheel', this.boundWheel);
    window.removeEventListener('keydown', this.boundKeydown);
    window.removeEventListener('keyup', this.boundKeyup);
    window.removeEventListener('blur', this.boundBlur);
    this.element.classList.remove(
      'vol-canvas-viewport',
      'vol-canvas-viewport--pan-ready',
      'vol-canvas-viewport--panning',
    );
  }

  private startPan(event: PointerEvent): void {
    const middleButton = event.button === 1;
    const temporaryHand = event.button === 0 && this.spacePressed;
    if (!middleButton && !temporaryHand) return;
    this.pan = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      offsetX: this.transform.offsetX,
      offsetY: this.transform.offsetY,
    };
    this.element.setPointerCapture(event.pointerId);
    this.renderCursor();
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  private movePan(event: PointerEvent): void {
    if (!this.pan || event.pointerId !== this.pan.pointerId) return;
    this.transform.offsetX = this.pan.offsetX + event.clientX - this.pan.clientX;
    this.transform.offsetY = this.pan.offsetY + event.clientY - this.pan.clientY;
    this.emitChange('pan');
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  private endPan(event: PointerEvent, cancelled: boolean): void {
    if (!this.pan || event.pointerId !== this.pan.pointerId) return;
    this.cancelPan(cancelled);
    if (!cancelled) this.onCommitHandler?.(this.getTransform(), 'pan');
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  private cancelPan(restore: boolean): void {
    if (!this.pan) return;
    const origin = this.pan;
    if (this.element.hasPointerCapture(this.pan.pointerId)) {
      this.element.releasePointerCapture(this.pan.pointerId);
    }
    this.pan = null;
    if (restore) {
      this.transform.offsetX = origin.offsetX;
      this.transform.offsetY = origin.offsetY;
      this.emitChange('pan');
    }
    this.renderCursor();
  }

  private handleWheel(event: WheelEvent): void {
    if (event.deltaY === 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const factor = Math.exp(-event.deltaY * this.wheelSensitivity);
    const nextZoom = this.clampZoom(this.transform.zoom * factor);
    if (nextZoom === this.transform.zoom) return;
    this.applyZoom({ x: event.clientX, y: event.clientY }, nextZoom);
    this.emitChange('zoom');
    this.onCommitHandler?.(this.getTransform(), 'zoom');
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.pan) {
      this.cancelPan(true);
      event.preventDefault();
      return;
    }
    if (
      event.code !== 'Space' ||
      event.repeat ||
      !this.pointerInside ||
      this.isEditable(event.target)
    ) {
      return;
    }
    this.spacePressed = true;
    this.renderCursor();
    event.preventDefault();
  }

  private handleKeyup(event: KeyboardEvent): void {
    if (event.code !== 'Space') return;
    this.spacePressed = false;
    this.renderCursor();
  }

  private applyZoom(screenPoint: ViewportPoint, zoom: number): void {
    const origin = this.viewportOrigin();
    const localX = screenPoint.x - origin.left;
    const localY = screenPoint.y - origin.top;
    const documentX = (localX - this.transform.offsetX) / this.transform.zoom;
    const documentY = (localY - this.transform.offsetY) / this.transform.zoom;
    this.transform.zoom = this.clampZoom(zoom);
    this.transform.offsetX = localX - documentX * this.transform.zoom;
    this.transform.offsetY = localY - documentY * this.transform.zoom;
  }

  private centerDocument(zoom: number): void {
    const size = this.viewportSize();
    this.transform.zoom = zoom;
    this.transform.offsetX = (size.width - this.documentWidth * zoom) / 2;
    this.transform.offsetY = (size.height - this.documentHeight * zoom) / 2;
  }

  /**
   * Viewport'un PADDING kutusunun sol/üst köşesi.
   *
   * `getBoundingClientRect()` border kutusunu verir, `clientWidth/Height` ise
   * padding kutusunu ölçer. İkisi karıştırıldığında viewport'a kenarlık veren
   * her tüketicide `fit()` belgeyi kenarlık kalınlığı kadar kaydırıyor,
   * ekran↔belge dönüşümü de aynı miktarda sapıyordu. `clientLeft/Top` tam
   * olarak kenarlık kalınlığıdır ve kenarlık yokken 0'dır.
   */
  private viewportOrigin(): { left: number; top: number } {
    const rect = this.element.getBoundingClientRect();
    return { left: rect.left + this.element.clientLeft, top: rect.top + this.element.clientTop };
  }

  private viewportSize(): { width: number; height: number } {
    const rect = this.element.getBoundingClientRect();
    return {
      width: this.element.clientWidth || rect.width || 1,
      height: this.element.clientHeight || rect.height || 1,
    };
  }

  private emitChange(reason: CanvasViewportChangeReason): void {
    this.onChangeHandler?.(this.getTransform(), reason);
  }

  private renderCursor(): void {
    this.element.classList.toggle(
      'vol-canvas-viewport--pan-ready',
      this.spacePressed && this.pointerInside && !this.pan,
    );
    this.element.classList.toggle('vol-canvas-viewport--panning', Boolean(this.pan));
  }

  private isEditable(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return (
      target.matches('input, textarea, select') ||
      target.isContentEditable ||
      Boolean(target.closest('[contenteditable="true"]'))
    );
  }

  private clampZoom(zoom: number): number {
    return Math.min(this.maxZoom, Math.max(this.minZoom, this.validZoom(zoom, this.minZoom)));
  }

  private validZoom(value: number, fallback: number): number {
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private validExtent(value: number): number {
    return Number.isFinite(value) && value > 0 ? value : 1;
  }

  private finite(value: number | undefined, fallback: number): number {
    return value !== undefined && Number.isFinite(value) ? value : fallback;
  }
}
