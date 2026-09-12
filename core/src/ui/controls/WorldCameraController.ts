import { DisposableScope } from '../../lifecycle/DisposableScope';

export interface WorldCamera {
  width: number;
  height: number;
  zoom: number;
  scrollX: number;
  scrollY: number;
  setZoom(zoom: number): WorldCamera;
  centerOn(x: number, y: number): WorldCamera;
  data?: { set(key: string, value: unknown): unknown };
}

export interface WorldCameraControllerOptions {
  readonly worldSize: number;
  readonly maxZoomFactor?: number;
  readonly wheelSensitivity?: number;
}

interface PointerPosition {
  readonly x: number;
  readonly y: number;
}

export class WorldCameraController {
  private readonly scope = new DisposableScope();
  private readonly pointers = new Map<number, PointerPosition>();
  private readonly worldSize: number;
  private readonly maxZoomFactor: number;
  private readonly wheelSensitivity: number;
  private centerX: number;
  private centerY: number;
  private minZoom = 1;

  constructor(
    private readonly element: HTMLElement,
    private readonly camera: WorldCamera,
    options: WorldCameraControllerOptions,
  ) {
    if (!(options.worldSize > 0) || !Number.isFinite(options.worldSize)) {
      throw new RangeError(`Dünya boyutu pozitif ve sonlu olmalı: ${options.worldSize}`);
    }
    this.worldSize = options.worldSize;
    this.maxZoomFactor = options.maxZoomFactor ?? 8;
    this.wheelSensitivity = options.wheelSensitivity ?? 0.0015;
    this.centerX = this.worldSize / 2;
    this.centerY = this.worldSize / 2;
    const previousTouchAction = element.style.touchAction;
    element.style.touchAction = 'none';
    this.scope.add({ dispose: () => (element.style.touchAction = previousTouchAction) });
    this.scope.addListener(element, 'pointerdown', this.onPointerDown);
    this.scope.addListener(element, 'pointermove', this.onPointerMove);
    this.scope.addListener(element, 'pointerup', this.onPointerEnd);
    this.scope.addListener(element, 'pointercancel', this.onPointerEnd);
    this.scope.addListener(element, 'wheel', this.onWheel, { passive: false });
    this.camera.data?.set('preserveCameraState', true);
    this.fitWorld();
  }

  fitWorld(): void {
    this.minZoom = Math.min(this.camera.width, this.camera.height) / this.worldSize;
    this.camera.setZoom(this.minZoom);
    this.setCenter(this.worldSize / 2, this.worldSize / 2);
  }

  refreshViewport(): void {
    this.minZoom = Math.min(this.camera.width, this.camera.height) / this.worldSize;
    this.camera.setZoom(clamp(this.camera.zoom, this.minZoom, this.minZoom * this.maxZoomFactor));
    this.setCenter(this.centerX, this.centerY);
  }

  screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const metrics = this.metrics();
    return {
      x: this.camera.scrollX + ((clientX - metrics.left) * metrics.scaleX) / this.camera.zoom,
      y: this.camera.scrollY + ((clientY - metrics.top) * metrics.scaleY) / this.camera.zoom,
    };
  }

  destroy(): void {
    this.scope.dispose();
    this.pointers.clear();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.element.setPointerCapture?.(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;
    if (this.pointers.size === 1) {
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      this.panBy(event.clientX - previous.x, event.clientY - previous.y);
      return;
    }

    const before = firstTwo(this.pointers);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const after = firstTwo(this.pointers);
    if (!before || !after) return;
    const oldDistance = distance(before[0], before[1]);
    const newDistance = distance(after[0], after[1]);
    if (oldDistance <= 0 || newDistance <= 0) return;
    const oldMidpoint = midpoint(before[0], before[1]);
    const newMidpoint = midpoint(after[0], after[1]);
    this.panBy(newMidpoint.x - oldMidpoint.x, newMidpoint.y - oldMidpoint.y);
    this.zoomAt(newMidpoint.x, newMidpoint.y, newDistance / oldDistance);
  };

  private readonly onPointerEnd = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
    if (this.element.hasPointerCapture?.(event.pointerId)) {
      this.element.releasePointerCapture(event.pointerId);
    }
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * this.wheelSensitivity));
  };

  private panBy(clientDeltaX: number, clientDeltaY: number): void {
    const metrics = this.metrics();
    this.setCenter(
      this.centerX - (clientDeltaX * metrics.scaleX) / this.camera.zoom,
      this.centerY - (clientDeltaY * metrics.scaleY) / this.camera.zoom,
    );
  }

  private zoomAt(clientX: number, clientY: number, factor: number): void {
    const before = this.screenToWorld(clientX, clientY);
    const nextZoom = clamp(
      this.camera.zoom * factor,
      this.minZoom,
      this.minZoom * this.maxZoomFactor,
    );
    if (nextZoom === this.camera.zoom) return;
    const metrics = this.metrics();
    this.camera.setZoom(nextZoom);
    const scrollX = before.x - ((clientX - metrics.left) * metrics.scaleX) / nextZoom;
    const scrollY = before.y - ((clientY - metrics.top) * metrics.scaleY) / nextZoom;
    this.setCenter(
      scrollX + this.camera.width / (2 * nextZoom),
      scrollY + this.camera.height / (2 * nextZoom),
    );
  }

  private setCenter(x: number, y: number): void {
    this.centerX = wrap(x, this.worldSize);
    this.centerY = wrap(y, this.worldSize);
    this.camera.centerOn(this.centerX, this.centerY);
  }

  private metrics(): {
    left: number;
    top: number;
    scaleX: number;
    scaleY: number;
  } {
    const bounds = this.element.getBoundingClientRect();
    return {
      left: bounds.left,
      top: bounds.top,
      scaleX: bounds.width > 0 ? this.camera.width / bounds.width : 1,
      scaleY: bounds.height > 0 ? this.camera.height / bounds.height : 1,
    };
  }
}

function firstTwo(
  pointers: Map<number, PointerPosition>,
): [PointerPosition, PointerPosition] | null {
  const values = pointers.values();
  const first = values.next().value;
  const second = values.next().value;
  return first && second ? [first, second] : null;
}

function midpoint(left: PointerPosition, right: PointerPosition): PointerPosition {
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}

function distance(left: PointerPosition, right: PointerPosition): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function wrap(value: number, size: number): number {
  return ((value % size) + size) % size;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
