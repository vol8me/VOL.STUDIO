import type { Rect } from '../../math/geometry';
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
}

export interface WorldCameraPoint {
  readonly x: number;
  readonly y: number;
}

export interface WorldCameraControllerOptions {
  readonly bounds: Readonly<Rect>;
  readonly maxZoomFactor?: number;
  readonly wheelSensitivity?: number;
  readonly wheelSmoothingMs?: number;
  readonly panMomentumMs?: number;
  readonly initialZoomFactor?: number;
  readonly onChange?: (state: WorldCameraState) => void;
}

interface TrackedPointer {
  readonly x: number;
  readonly y: number;
  readonly timeMs: number;
}

interface PinchGesture {
  readonly ids: readonly [number, number];
  readonly distance: number;
  readonly zoom: number;
  readonly worldAnchor: WorldCameraPoint;
}

interface WheelMotion {
  readonly clientX: number;
  readonly clientY: number;
  readonly worldAnchor: WorldCameraPoint;
}

const WHEEL_LINE_PX = 16;
const MAX_WHEEL_DELTA_PX = 240;
const DEFAULT_POINTER_FRAME_MS = 16;
const POINTER_VELOCITY_WINDOW_MS = 80;
const MIN_VALID_POINTER_DELTA_MS = 1;
const MIN_MOMENTUM_UNITS_PER_MS = 0.000001;
const MAX_MOMENTUM_UNITS_PER_MS = 3;

export class WorldCameraController {
  private readonly scope = new DisposableScope();
  private readonly pointers = new Map<number, TrackedPointer>();
  private readonly pointerHistory = new Map<number, TrackedPointer[]>();
  private readonly bounds: Readonly<Rect>;
  private readonly maxZoomFactor: number;
  private readonly wheelSensitivity: number;
  private readonly wheelSmoothingMs: number;
  private readonly panMomentumMs: number;
  private readonly initialZoomFactor: number;
  private readonly onChange?: (state: WorldCameraState) => void;
  private centerX: number;
  private centerY: number;
  private targetCenterX: number;
  private targetCenterY: number;
  private targetZoom = 1;
  private minZoom = 1;
  private panVelocityX = 0;
  private panVelocityY = 0;
  private momentumCenterX = 0;
  private momentumCenterY = 0;
  private pinch: PinchGesture | null = null;
  private wheelMotion: WheelMotion | null = null;

  constructor(
    private readonly element: HTMLElement,
    private readonly camera: WorldCamera,
    options: WorldCameraControllerOptions,
  ) {
    validateBounds(options.bounds);
    this.bounds = options.bounds;
    this.maxZoomFactor = options.maxZoomFactor ?? 8;
    this.wheelSensitivity = options.wheelSensitivity ?? 0.0015;
    this.wheelSmoothingMs = options.wheelSmoothingMs ?? 90;
    this.panMomentumMs = options.panMomentumMs ?? 140;
    this.initialZoomFactor = options.initialZoomFactor ?? 1;
    if (!(this.initialZoomFactor >= 1) || !Number.isFinite(this.initialZoomFactor)) {
      throw new RangeError(
        `Başlangıç zoom çarpanı 1 veya daha büyük olmalı: ${this.initialZoomFactor}`,
      );
    }
    this.onChange = options.onChange;
    this.centerX = options.bounds.x + options.bounds.width / 2;
    this.centerY = options.bounds.y + options.bounds.height / 2;
    this.targetCenterX = this.centerX;
    this.targetCenterY = this.centerY;
    this.momentumCenterX = this.centerX;
    this.momentumCenterY = this.centerY;
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
    this.minZoom = this.resolveMinZoom();
    this.targetZoom = clamp(
      this.minZoom * this.initialZoomFactor,
      this.minZoom,
      this.minZoom * this.maxZoomFactor,
    );
    this.targetCenterX = this.bounds.x + this.bounds.width / 2;
    this.targetCenterY = this.bounds.y + this.bounds.height / 2;
    this.stopMomentum();
    this.applyState(this.targetCenterX, this.targetCenterY, this.targetZoom);
  }

  refreshViewport(): void {
    const previousMinZoom = this.minZoom;
    const zoomFactor = previousMinZoom > 0 ? this.targetZoom / previousMinZoom : 1;
    this.minZoom = this.resolveMinZoom();
    this.targetZoom = clamp(
      this.minZoom * zoomFactor,
      this.minZoom,
      this.minZoom * this.maxZoomFactor,
    );
    const target = this.clampCenter(this.targetCenterX, this.targetCenterY, this.targetZoom);
    this.targetCenterX = target.x;
    this.targetCenterY = target.y;
    this.applyState(target.x, target.y, this.targetZoom);
    this.resetPinch();
    this.stopMomentum();
    this.wheelMotion = null;
  }

  update(deltaMs: number): void {
    if (!(deltaMs > 0) || !Number.isFinite(deltaMs)) return;
    if (this.applyMomentum(deltaMs)) return;
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
    const center = this.wheelMotion
      ? this.centerForAnchor(
          this.wheelMotion.clientX,
          this.wheelMotion.clientY,
          this.wheelMotion.worldAnchor,
          zoom,
        )
      : {
          x: mix(this.centerX, this.targetCenterX, alpha),
          y: mix(this.centerY, this.targetCenterY, alpha),
          timeMs: 0,
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
    };
  }

  screenToWorld(clientX: number, clientY: number): WorldCameraPoint {
    return this.screenToWorldAt(clientX, clientY, this.centerX, this.centerY, this.camera.zoom);
  }

  destroy(): void {
    this.scope.dispose();
    this.pointers.clear();
    this.pointerHistory.clear();
    this.pinch = null;
    this.wheelMotion = null;
    this.stopMomentum();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    const position = pointerPosition(event);
    this.pointers.set(event.pointerId, position);
    this.pointerHistory.set(event.pointerId, [position]);
    this.wheelMotion = null;
    this.targetZoom = this.camera.zoom;
    this.targetCenterX = this.centerX;
    this.targetCenterY = this.centerY;
    this.stopMomentum();
    this.element.setPointerCapture?.(event.pointerId);
    this.resetPinch();
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;
    const current = pointerPosition(event);
    this.pointers.set(event.pointerId, current);
    this.recordPointerHistory(event.pointerId, event, current);
    if (this.pointers.size === 1) {
      this.pinch = null;
      this.panBy(current.x - previous.x, current.y - previous.y);
      this.updatePanVelocity(event.pointerId);
      this.momentumCenterX = this.centerX;
      this.momentumCenterY = this.centerY;
      return;
    }
    this.stopMomentum();
    if (!this.pinch || !this.pinch.ids.includes(event.pointerId)) return;
    this.applyPinch(this.pinch);
  };

  private readonly onPointerEnd = (event: PointerEvent): void => {
    const wasSinglePointer = this.pointers.size === 1;
    const previous = this.pointers.get(event.pointerId);
    if (wasSinglePointer && previous) {
      const current = pointerPosition(event);
      this.recordPointerHistory(event.pointerId, event, current);
      if (current.x !== previous.x || current.y !== previous.y) {
        this.panBy(current.x - previous.x, current.y - previous.y);
      }
      this.updatePanVelocity(event.pointerId);
      this.momentumCenterX = this.centerX;
      this.momentumCenterY = this.centerY;
    }
    this.pointers.delete(event.pointerId);
    this.pointerHistory.delete(event.pointerId);
    if (this.element.hasPointerCapture?.(event.pointerId)) {
      this.element.releasePointerCapture(event.pointerId);
    }
    if (!wasSinglePointer) {
      this.stopMomentum();
      for (const [id, position] of this.pointers) this.pointerHistory.set(id, [position]);
    }
    this.resetPinch();
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.stopMomentum();
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
    const metrics = this.metrics();
    const requestedX = this.centerX - (clientDeltaX * metrics.scaleX) / this.camera.zoom;
    const requestedY = this.centerY - (clientDeltaY * metrics.scaleY) / this.camera.zoom;
    const target = this.clampCenter(requestedX, requestedY, this.camera.zoom);
    this.targetCenterX = target.x;
    this.targetCenterY = target.y;
    this.wheelMotion = null;
    this.applyState(target.x, target.y, this.camera.zoom);
  }

  private recordPointerHistory(
    pointerId: number,
    event: PointerEvent,
    current: TrackedPointer,
  ): void {
    const history = this.pointerHistory.get(pointerId) ?? [];
    const coalesced = event.getCoalescedEvents?.() ?? [];
    for (const sample of coalesced) appendDistinctSample(history, pointerPosition(sample));
    appendDistinctSample(history, current);
    const cutoff = current.timeMs - POINTER_VELOCITY_WINDOW_MS;
    while (history.length > 2 && history[1].timeMs < cutoff) history.shift();
    this.pointerHistory.set(pointerId, history);
  }

  private updatePanVelocity(pointerId: number): void {
    const history = this.pointerHistory.get(pointerId);
    if (!history || history.length < 2) return;
    const first = history[0];
    const last = history[history.length - 1];
    const measuredDeltaMs = last.timeMs - first.timeMs;
    const deltaMs =
      measuredDeltaMs >= MIN_VALID_POINTER_DELTA_MS
        ? measuredDeltaMs
        : DEFAULT_POINTER_FRAME_MS * (history.length - 1);
    const metrics = this.metrics();
    this.panVelocityX = clamp(
      (-(last.x - first.x) * metrics.scaleX) / this.camera.zoom / deltaMs,
      -MAX_MOMENTUM_UNITS_PER_MS,
      MAX_MOMENTUM_UNITS_PER_MS,
    );
    this.panVelocityY = clamp(
      (-(last.y - first.y) * metrics.scaleY) / this.camera.zoom / deltaMs,
      -MAX_MOMENTUM_UNITS_PER_MS,
      MAX_MOMENTUM_UNITS_PER_MS,
    );
  }

  private applyMomentum(deltaMs: number): boolean {
    if (this.pointers.size > 0 || this.wheelMotion) return false;
    if (
      Math.abs(this.panVelocityX) < MIN_MOMENTUM_UNITS_PER_MS &&
      Math.abs(this.panVelocityY) < MIN_MOMENTUM_UNITS_PER_MS
    ) {
      this.momentumCenterX += this.panVelocityX * this.panMomentumMs;
      this.momentumCenterY += this.panVelocityY * this.panMomentumMs;
      const finalCenter = this.softClampMomentumCenter(
        this.momentumCenterX,
        this.momentumCenterY,
        this.camera.zoom,
      );
      this.applyState(finalCenter.x, finalCenter.y, this.camera.zoom);
      this.targetCenterX = this.centerX;
      this.targetCenterY = this.centerY;
      this.stopMomentum();
      return true;
    }
    const decay = Math.exp(-deltaMs / this.panMomentumMs);
    const travelMs = this.panMomentumMs * (1 - decay);
    this.momentumCenterX += this.panVelocityX * travelMs;
    this.momentumCenterY += this.panVelocityY * travelMs;
    const softened = this.softClampMomentumCenter(
      this.momentumCenterX,
      this.momentumCenterY,
      this.camera.zoom,
    );
    this.applyState(softened.x, softened.y, this.camera.zoom);
    this.panVelocityX *= decay;
    this.panVelocityY *= decay;
    this.targetCenterX = this.centerX;
    this.targetCenterY = this.centerY;
    return true;
  }

  private softClampMomentumCenter(
    centerX: number,
    centerY: number,
    zoom: number,
  ): WorldCameraPoint {
    const halfWidth = this.camera.width / (2 * zoom);
    const halfHeight = this.camera.height / (2 * zoom);
    return {
      x: softClamp(
        centerX,
        this.bounds.x + halfWidth,
        this.bounds.x + this.bounds.width - halfWidth,
        halfWidth * 2 * 0.08,
      ),
      y: softClamp(
        centerY,
        this.bounds.y + halfHeight,
        this.bounds.y + this.bounds.height - halfHeight,
        halfHeight * 2 * 0.08,
      ),
    };
  }

  private stopMomentum(): void {
    this.panVelocityX = 0;
    this.panVelocityY = 0;
    this.momentumCenterX = this.centerX;
    this.momentumCenterY = this.centerY;
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
    const requested = this.centerForAnchor(center.x, center.y, gesture.worldAnchor, zoom);
    const target = this.clampCenter(requested.x, requested.y, zoom);
    this.targetZoom = zoom;
    this.wheelMotion = null;
    this.targetCenterX = target.x;
    this.targetCenterY = target.y;
    this.applyState(target.x, target.y, zoom);
  }

  private setZoomTargetAt(clientX: number, clientY: number, requestedZoom: number): void {
    const sameAnchor =
      this.wheelMotion?.clientX === clientX && this.wheelMotion.clientY === clientY;
    const anchor = sameAnchor
      ? this.wheelMotion!.worldAnchor
      : this.screenToWorld(clientX, clientY);
    this.wheelMotion = { clientX, clientY, worldAnchor: anchor };
    this.targetZoom = clamp(requestedZoom, this.minZoom, this.minZoom * this.maxZoomFactor);
    const requested = this.centerForAnchor(clientX, clientY, anchor, this.targetZoom);
    const target = this.clampCenter(requested.x, requested.y, this.targetZoom);
    this.targetCenterX = target.x;
    this.targetCenterY = target.y;
  }

  private centerForAnchor(
    clientX: number,
    clientY: number,
    anchor: WorldCameraPoint,
    zoom: number,
  ): WorldCameraPoint {
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
  ): WorldCameraPoint {
    const metrics = this.metrics();
    return {
      x: centerX + ((clientX - metrics.left) * metrics.scaleX - this.camera.width / 2) / zoom,
      y: centerY + ((clientY - metrics.top) * metrics.scaleY - this.camera.height / 2) / zoom,
    };
  }

  private applyState(centerX: number, centerY: number, zoom: number): void {
    const center = this.clampCenter(centerX, centerY, zoom);
    this.centerX = center.x;
    this.centerY = center.y;
    this.camera.setZoom(zoom);
    this.camera.centerOn(center.x, center.y);
    this.onChange?.(this.getState());
  }

  private clampCenter(centerX: number, centerY: number, zoom: number): WorldCameraPoint {
    const halfWidth = this.camera.width / (2 * zoom);
    const halfHeight = this.camera.height / (2 * zoom);
    return {
      x: clamp(centerX, this.bounds.x + halfWidth, this.bounds.x + this.bounds.width - halfWidth),
      y: clamp(
        centerY,
        this.bounds.y + halfHeight,
        this.bounds.y + this.bounds.height - halfHeight,
      ),
    };
  }

  private resolveMinZoom(): number {
    return Math.max(this.camera.width / this.bounds.width, this.camera.height / this.bounds.height);
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

function validateBounds(bounds: Readonly<Rect>): void {
  if (
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !(bounds.width > 0) ||
    !Number.isFinite(bounds.width) ||
    !(bounds.height > 0) ||
    !Number.isFinite(bounds.height)
  ) {
    throw new RangeError('Dünya sınırı sonlu koordinatlara ve pozitif boyutlara sahip olmalı.');
  }
}

function pointerPosition(event: PointerEvent): TrackedPointer {
  return { x: event.clientX, y: event.clientY, timeMs: event.timeStamp };
}

function appendDistinctSample(history: TrackedPointer[], sample: TrackedPointer): void {
  const previous = history.at(-1);
  if (previous?.x === sample.x && previous.y === sample.y && previous.timeMs === sample.timeMs) {
    return;
  }
  history.push(sample);
}

function firstTwoEntries(
  pointers: Map<number, TrackedPointer>,
): [[number, TrackedPointer], [number, TrackedPointer]] | null {
  const values = pointers.entries();
  const first = values.next().value;
  const second = values.next().value;
  return first && second ? [first, second] : null;
}

function midpoint(left: TrackedPointer, right: TrackedPointer): WorldCameraPoint {
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}

function distance(left: WorldCameraPoint, right: WorldCameraPoint): number {
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

function softClamp(value: number, minimum: number, maximum: number, zone: number): number {
  if (value <= minimum) return minimum;
  if (value >= maximum) return maximum;
  if (value < minimum + zone) {
    const progress = (value - minimum) / zone;
    return minimum + zone * progress * progress * (2 - progress);
  }
  if (value > maximum - zone) {
    const progress = (maximum - value) / zone;
    return maximum - zone * progress * progress * (2 - progress);
  }
  return value;
}
