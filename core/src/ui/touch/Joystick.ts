import { INPUT, UI_SIZE } from '../../constants';
import { DisposableScope } from '../../lifecycle/DisposableScope';
import { i18next } from '../../i18n/I18n';

const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

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
  /** Erişilebilir ad (klavyeyle odaklanan çubuk için); verilmezse `core:joystick.label`. */
  label?: string;
}

/**
 * DOM tabanlı sanal analog çubuk. `core/src/phaser/input/TouchController.ts`
 * (Phaser canvas'ta çizilen gerçek oyun input'u) ile karıştırılmamalı — bu
 * component menü önizlemesi veya DOM tabanlı bir HUD için kullanılır.
 * `onMove` vektörü -1..1 aralığında normalize edilmiş x/y döndürür.
 *
 * **Klavye:** çubuk odaklanabilir; ok tuşları basılı tutuldukça vektör üretir (çapraz birim uzunluğa
 * normalize), son tuş bırakılınca ya da odak kaybında `onRelease` çağrılır. İşaretçi basılıyken tuşlar yok sayılır.
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
  /** Bileşen ömrü boyunca yaşayan tek kaynak: `base`'e bağlı `pointerdown`. */
  private readonly scope = new DisposableScope();
  /** Yalnızca bir sürükleme oturumu boyunca yaşar — bkz. `attachDragListeners`. */
  private dragScope: DisposableScope | null = null;
  private readonly heldKeys = new Set<string>();

  constructor(options: JoystickOptions = {}) {
    const {
      radius = UI_SIZE.JOYSTICK_DEFAULT_PX,
      deadZone = INPUT.DEAD_ZONE_RATIO,
      onMove,
      onRelease,
    } = options;
    const label = options.label;
    this.radius = radius;
    this.deadZone = deadZone;
    this.onMoveHandler = onMove;
    this.onReleaseHandler = onRelease;

    this.element = document.createElement('div');
    this.element.className = 'vol-joystick';
    this.element.style.setProperty('--vol-joystick-radius', `${radius}px`);

    this.base = document.createElement('div');
    this.base.className = 'vol-joystick__base';
    this.base.tabIndex = 0;
    this.base.setAttribute('role', 'group');
    this.base.setAttribute('aria-label', label ?? i18next.t('core:joystick.label'));
    this.base.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowLeft ArrowRight');
    this.element.appendChild(this.base);

    this.thumb = document.createElement('div');
    this.thumb.className = 'vol-joystick__thumb';
    this.base.appendChild(this.thumb);

    this.boundPointerDown = (event) => this.onPointerDown(event);
    this.boundPointerMove = (event) => this.onPointerMove(event);
    this.boundPointerUp = (event) => this.onPointerUp(event);

    // Global dinleyiciler yalnızca sürükleme süresince bağlı tutulur. Constructor'da
    // bağlamak, hiç dokunulmayan bir joystick için bile sayfadaki her pointermove'u
    // handler'a sokardı (bkz. RadialMenu/Kanban aynı deseni kullanır).
    this.scope.addListener(this.base, 'pointerdown', this.boundPointerDown as EventListener);
    this.scope.addListener(this.base, 'keydown', ((event: KeyboardEvent) =>
      this.onKeyDown(event)) as EventListener);
    this.scope.addListener(this.base, 'keyup', ((event: KeyboardEvent) =>
      this.onKeyUp(event)) as EventListener);
    this.scope.addListener(this.base, 'blur', () => this.releaseKeys());
  }

  destroy(): void {
    this.dragScope?.dispose();
    this.scope.dispose();
    this.element.remove();
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (!ARROWS.includes(event.key) || this.activePointerId !== null) return;
    event.preventDefault();
    if (event.repeat) return;
    this.heldKeys.add(event.key);
    this.applyKeys();
  }

  private onKeyUp(event: KeyboardEvent): void {
    if (!this.heldKeys.delete(event.key)) return;
    event.preventDefault();
    if (this.heldKeys.size === 0) this.releaseKeys();
    else this.applyKeys();
  }

  /** Tutulan ok tuşlarını birim uzunlukta bir vektöre çevirir ve başparmağı oraya taşır. */
  private applyKeys(): void {
    const x = (this.heldKeys.has('ArrowRight') ? 1 : 0) - (this.heldKeys.has('ArrowLeft') ? 1 : 0);
    const y = (this.heldKeys.has('ArrowDown') ? 1 : 0) - (this.heldKeys.has('ArrowUp') ? 1 : 0);
    const length = Math.hypot(x, y);
    const vx = length === 0 ? 0 : x / length;
    const vy = length === 0 ? 0 : y / length;
    this.base.classList.toggle('vol-joystick__base--active', length > 0);
    this.thumb.style.transform = `translate(calc(-50% + ${vx * this.radius}px), calc(-50% + ${vy * this.radius}px))`;
    this.onMoveHandler?.({ x: vx, y: vy });
  }

  private releaseKeys(): void {
    if (this.heldKeys.size === 0 && !this.base.classList.contains('vol-joystick__base--active')) {
      return;
    }
    this.heldKeys.clear();
    if (this.activePointerId !== null) return;
    this.base.classList.remove('vol-joystick__base--active');
    this.thumb.style.transform = 'translate(-50%, -50%)';
    this.onReleaseHandler?.();
  }

  private attachDragListeners(): void {
    this.dragScope = new DisposableScope();
    this.dragScope.addListener(window, 'pointermove', this.boundPointerMove as EventListener);
    this.dragScope.addListener(window, 'pointerup', this.boundPointerUp as EventListener);
    this.dragScope.addListener(window, 'pointercancel', this.boundPointerUp as EventListener);
  }

  private detachDragListeners(): void {
    this.dragScope?.dispose();
    this.dragScope = null;
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
