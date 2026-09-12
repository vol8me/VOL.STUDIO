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

export interface WorldCameraState {
  readonly centerX: number;
  readonly centerY: number;
  readonly zoom: number;
  readonly minZoom: number;
  readonly overview: boolean;
}

export interface WorldCameraControllerOptions {
  readonly worldSize: number;
  readonly maxZoomFactor?: number;
  readonly wheelSensitivity?: number;
  readonly wheelSmoothingMs?: number;
  readonly onChange?: (state: WorldCameraState) => void;
}

interface PointerPosition {
  readonly x: number;
  readonly y: number;
}

interface PinchGesture {
  readonly ids: readonly [number, number];
  readonly distance: number;
  readonly zoom: number;
  readonly worldAnchor: PointerPosition;
}

interface WheelMotion {
  readonly clientX: number;
  readonly clientY: number;
  readonly worldAnchor: PointerPosition;
}

const WHEEL_LINE_PX = 16;
const MAX_WHEEL_DELTA_PX = 240;
const OVERVIEW_EPSILON = 0.001;

export class WorldCameraController {
  private readonly scope = new DisposableScope();
  private readonly pointers = new Map<number, PointerPosition>();
  private readonly worldSize: number;
  private readonly maxZoomFactor: number;
  private readonly wheelSensitivity: number;
  private readonly wheelSmoothingMs: number;
  private readonly onChange?: (state: WorldCameraState) => void;
  private centerX: number;
  private centerY: number;
  private targetCenterX: number;
  private targetCenterY: number;
  private targetZoom = 1;
  private minZoom = 1;
  private pinch: PinchGesture | null = null;
  private wheelMotion: WheelMotion | null = null;

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
    this.wheelSmoothingMs = options.wheelSmoothingMs ?? 90;
    this.onChange = options.onChange;
    this.centerX = this.worldSize / 2;
    this.centerY = this.worldSize / 2;
    this.targetCenterX = this.centerX;
    this.targetCenterY = this.centerY;
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
    this.targetZoom = this.minZoom;
    this.targetCenterX = this.worldSize / 2;
    this.targetCenterY = this.worldSize / 2;
    this.applyState(this.targetCenterX, this.targetCenterY, this.targetZoom);
  }

  refreshViewport(): void {
    const previousMinZoom = this.minZoom;
    const zoomFactor = previousMinZoom > 0 ? this.targetZoom / previousMinZoom : 1;
    this.minZoom = Math.min(this.camera.width, this.camera.height) / this.worldSize;
    this.targetZoom = clamp(
      this.minZoom * zoomFactor,
      this.minZoom,
      this.minZoom * this.maxZoomFactor,
    );
    if (this.isOverview(this.targetZoom)) {
      this.targetCenterX = this.worldSize / 2;
      this.targetCenterY = this.worldSize / 2;
    }
    this.applyState(this.targetCenterX, this.targetCenterY, this.targetZoom);
    this.resetPinch();
    this.wheelMotion = null;
  }

  update(deltaMs: number): void {
    if (!(deltaMs > 0) || !Number.isFinite(deltaMs)) return;
    if (
      this.camera.zoom === this.targetZoom &&
      this.centerX === this.targetCenterX &&
      this.centerY === this.targetCenterY
    ) {
      return;
    }
    const alpha =
      deltaMs >= this.wheelSmoothingMs * 8 ? 1 : 1 - Math.exp(-deltaMs / this.wheelSmoothingMs);
    const zoom = Math.exp(mix(Math.log(this.camera.zoom), Math.log(this.targetZoom), alpha));
    const center =
      this.wheelMotion && !this.isOverview(zoom)
        ? this.centerForAnchor(
            this.wheelMotion.clientX,
            this.wheelMotion.clientY,
            this.wheelMotion.worldAnchor,
            zoom,
          )
        : {
            x: mix(this.centerX, this.targetCenterX, alpha),
            y: mix(this.centerY, this.targetCenterY, alpha),
          };
    this.applyState(center.x, center.y, zoom);
    if (alpha === 1) this.wheelMotion = null;
  }

  getState(): WorldCameraState {
    return {
      centerX: this.centerX,
      centerY: this.centerY,
      zoom: this.camera.zoom,
      minZoom: this.minZoom,
      overview: this.isOverview(this.camera.zoom),
    };
  }

  screenToWorld(clientX: number, clientY: number): PointerPosition {
    return this.screenToWorldAt(clientX, clientY, this.centerX, this.centerY, this.camera.zoom);
  }

  destroy(): void {
    this.scope.dispose();
    this.pointers.clear();
    this.pinch = null;
    this.wheelMotion = null;
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.wheelMotion = null;
    this.element.setPointerCapture?.(event.pointerId);
    this.resetPinch();
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size === 1) {
      this.pinch = null;
      this.panBy(event.clientX - previous.x, event.clientY - previous.y);
      return;
    }
    if (!this.pinch || !this.pinch.ids.includes(event.pointerId)) return;
    this.applyPinch(this.pinch);
  };

  private readonly onPointerEnd = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
    if (this.element.hasPointerCapture?.(event.pointerId)) {
      this.element.releasePointerCapture(event.pointerId);
    }
    this.resetPinch();
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const metrics = this.metrics();
    const deltaPx = normalizeWheelDelta(event, metrics.height);
    const boundedDelta = clamp(deltaPx, -MAX_WHEEL_DELTA_PX, MAX_WHEEL_DELTA_PX);
    this.setZoomTargetAt(
      event.clientX,
      event.clientY,
      this.targetZoom * Math.exp(-boundedDelta * this.wheelSensitivity),
    );
  };

  private panBy(clientDeltaX: number, clientDeltaY: number): void {
    if (this.isOverview(this.camera.zoom)) return;
    const metrics = this.metrics();
    this.targetCenterX = this.centerX - (clientDeltaX * metrics.scaleX) / this.camera.zoom;
    this.targetCenterY = this.centerY - (clientDeltaY * metrics.scaleY) / this.camera.zoom;
    this.wheelMotion = null;
    this.applyState(this.targetCenterX, this.targetCenterY, this.camera.zoom);
  }

  private resetPinch(): void {
    const pair = firstTwoEntries(this.pointers);
    if (!pair) {
      this.pinch = null;
      return;
    }
    const [left, right] = pair;
    const center = midpoint(left[1], right[1]);
    this.pinch = {
      ids: [left[0], right[0]],
      distance: distance(left[1], right[1]),
      zoom: this.camera.zoom,
      worldAnchor: this.screenToWorld(center.x, center.y),
    };
  }

  private applyPinch(gesture: PinchGesture): void {
    const left = this.pointers.get(gesture.ids[0]);
    const right = this.pointers.get(gesture.ids[1]);
    if (!left || !right || gesture.distance <= 0) return;
    const center = midpoint(left, right);
    const zoom = clamp(
      gesture.zoom * (distance(left, right) / gesture.distance),
      this.minZoom,
      this.minZoom * this.maxZoomFactor,
    );
    const target = this.centerForAnchor(center.x, center.y, gesture.worldAnchor, zoom);
    this.targetZoom = zoom;
    this.wheelMotion = null;
    this.targetCenterX = target.x;
    this.targetCenterY = target.y;
    if (this.isOverview(zoom)) {
      this.targetCenterX = this.worldSize / 2;
      this.targetCenterY = this.worldSize / 2;
    }
    this.applyState(this.targetCenterX, this.targetCenterY, zoom);
  }

  private setZoomTargetAt(clientX: number, clientY: number, requestedZoom: number): void {
    const sameAnchor =
      this.wheelMotion?.clientX === clientX && this.wheelMotion.clientY === clientY;
    const anchor = sameAnchor
      ? this.wheelMotion!.worldAnchor
      : this.screenToWorld(clientX, clientY);
    this.wheelMotion = { clientX, clientY, worldAnchor: anchor };
    this.targetZoom = clamp(requestedZoom, this.minZoom, this.minZoom * this.maxZoomFactor);
    const target = this.centerForAnchor(clientX, clientY, anchor, this.targetZoom);
    this.targetCenterX = target.x;
    this.targetCenterY = target.y;
    if (this.isOverview(this.targetZoom)) {
      this.targetCenterX = this.worldSize / 2;
      this.targetCenterY = this.worldSize / 2;
    }
  }

  private centerForAnchor(
    clientX: number,
    clientY: number,
    anchor: PointerPosition,
    zoom: number,
  ): PointerPosition {
    const metrics = this.metrics();
    return {
      x: anchor.x - ((clientX - metrics.left) * metrics.scaleX - this.camera.width / 2) / zoom,
      y: anchor.y - ((clientY - metrics.top) * metrics.scaleY - this.camera.height / 2) / zoom,
    };
  }

  private screenToWorldAt(
    clientX: number,
    clientY: number,
    centerX: number,
    centerY: number,
    zoom: number,
  ): PointerPosition {
    const metrics = this.metrics();
    return {
      x: centerX + ((clientX - metrics.left) * metrics.scaleX - this.camera.width / 2) / zoom,
      y: centerY + ((clientY - metrics.top) * metrics.scaleY - this.camera.height / 2) / zoom,
    };
  }

  private applyState(centerX: number, centerY: number, zoom: number): void {
    this.centerX = centerX;
    this.centerY = centerY;
    this.camera.setZoom(zoom);
    this.camera.centerOn(centerX, centerY);
    this.onChange?.(this.getState());
  }

  private isOverview(zoom: number): boolean {
    return zoom <= this.minZoom * (1 + OVERVIEW_EPSILON);
  }

  private metrics(): {
    left: number;
    top: number;
    width: number;
    height: number;
    scaleX: number;
    scaleY: number;
  } {
    const bounds = this.element.getBoundingClientRect();
    return {
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
      scaleX: bounds.width > 0 ? this.camera.width / bounds.width : 1,
      scaleY: bounds.height > 0 ? this.camera.height / bounds.height : 1,
    };
  }
}

function firstTwoEntries(
  pointers: Map<number, PointerPosition>,
): [[number, PointerPosition], [number, PointerPosition]] | null {
  const values = pointers.entries();
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

function normalizeWheelDelta(event: WheelEvent, pageHeight: number): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * WHEEL_LINE_PX;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * pageHeight;
  return event.deltaY;
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
