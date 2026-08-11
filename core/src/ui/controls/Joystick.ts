import { INPUT, UI_SIZE } from '../../constants';

export interface JoystickVector {
  x: number;
  y: number;
}

export interface JoystickOptions {
  /** Dış halka yarıçapı (piksel). Varsayılan 56. */
  radius?: number;
  /** Merkeze dönüş bölgesi; bu oranın altındaki değerler 0 sayılır. Varsayılan 0.15. */
  deadZone?: number;
  onMove?: (vector: JoystickVector) => void;
  onRelease?: () => void;
}

/**
 * DOM tabanlı sanal analog çubuk. `core/src/input/TouchController.ts`
 * (Phaser canvas'ta çizilen gerçek oyun input'u) ile karıştırılmamalı — bu
 * component menü önizlemesi veya DOM tabanlı bir HUD için kullanılır.
 * `onMove` vektörü -1..1 aralığında normalize edilmiş x/y döndürür.
 */
export class Joystick {
  readonly element: HTMLDivElement;
  private readonly base: HTMLDivElement;
  private readonly thumb: HTMLDivElement;
  private readonly radius: number;
  private readonly deadZone: number;
  private readonly onMoveHandler?: (vector: JoystickVector) => void;
  private readonly onReleaseHandler?: () => void;
  private activePointerId: number | null = null;
  private originX = 0;
  private originY = 0;

  private readonly boundPointerDown: (event: PointerEvent) => void;
  private readonly boundPointerMove: (event: PointerEvent) => void;
  private readonly boundPointerUp: (event: PointerEvent) => void;

  constructor(options: JoystickOptions = {}) {
    const {
      radius = UI_SIZE.JOYSTICK_DEFAULT,
      deadZone = INPUT.DEAD_ZONE_RATIO,
      onMove,
      onRelease,
    } = options;
    this.radius = radius;
    this.deadZone = deadZone;
    this.onMoveHandler = onMove;
    this.onReleaseHandler = onRelease;

    this.element = document.createElement('div');
    this.element.className = 'vol-joystick';
    this.element.style.setProperty('--vol-joystick-radius', `${radius}px`);

    this.base = document.createElement('div');
    this.base.className = 'vol-joystick__base';
    this.element.appendChild(this.base);

    this.thumb = document.createElement('div');
    this.thumb.className = 'vol-joystick__thumb';
    this.base.appendChild(this.thumb);

    this.boundPointerDown = (event) => this.onPointerDown(event);
    this.boundPointerMove = (event) => this.onPointerMove(event);
    this.boundPointerUp = (event) => this.onPointerUp(event);

    // Global dinleyiciler yalnizca surukleme suresince bagli tutulur. Constructor'da
    // baglamak, hic dokunulmayan bir joystick icin bile sayfadaki her pointermove'u
    // handler'a sokardi (bkz. RadialMenu/Kanban ayni deseni kullanir).
    this.base.addEventListener('pointerdown', this.boundPointerDown);
  }

  destroy(): void {
    this.base.removeEventListener('pointerdown', this.boundPointerDown);
    this.detachDragListeners();
    this.element.remove();
  }

  private attachDragListeners(): void {
    window.addEventListener('pointermove', this.boundPointerMove);
    window.addEventListener('pointerup', this.boundPointerUp);
    window.addEventListener('pointercancel', this.boundPointerUp);
  }

  private detachDragListeners(): void {
    window.removeEventListener('pointermove', this.boundPointerMove);
    window.removeEventListener('pointerup', this.boundPointerUp);
    window.removeEventListener('pointercancel', this.boundPointerUp);
  }

  private onPointerDown(event: PointerEvent): void {
    if (this.activePointerId !== null) {
      return;
    }
    this.activePointerId = event.pointerId;
    this.attachDragListeners();
    const rect = this.base.getBoundingClientRect();
    this.originX = rect.left + rect.width / 2;
    this.originY = rect.top + rect.height / 2;
    this.base.classList.add('vol-joystick__base--active');
    this.updateFromPointer(event.clientX, event.clientY);
  }

  private onPointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.activePointerId) {
      return;
    }
    this.updateFromPointer(event.clientX, event.clientY);
  }

  private onPointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.activePointerId) {
      return;
    }
    this.activePointerId = null;
    this.detachDragListeners();
    this.base.classList.remove('vol-joystick__base--active');
    this.thumb.style.transform = 'translate(-50%, -50%)';
    this.onReleaseHandler?.();
  }

  private updateFromPointer(clientX: number, clientY: number): void {
    const dx = clientX - this.originX;
    const dy = clientY - this.originY;
    const distance = Math.hypot(dx, dy);
    const clampedDistance = Math.min(distance, this.radius);
    const angle = Math.atan2(dy, dx);

    const thumbX = Math.cos(angle) * clampedDistance;
    const thumbY = Math.sin(angle) * clampedDistance;
    this.thumb.style.transform = `translate(calc(-50% + ${thumbX}px), calc(-50% + ${thumbY}px))`;

    const ratio = clampedDistance / this.radius;
    const normalized = ratio < this.deadZone ? 0 : ratio;
    const x = normalized === 0 ? 0 : Math.cos(angle) * normalized;
    const y = normalized === 0 ? 0 : Math.sin(angle) * normalized;

    this.onMoveHandler?.({ x, y });
  }
}
