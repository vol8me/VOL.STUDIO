import { INPUT, UI_SIZE } from '../../constants';

export interface SquareJoystickVector {
  x: number;
  y: number;
}

export interface SquareJoystickOptions {
  /** Kare tabanın yarım kenar uzunluğu (piksel) — taban toplamda bu değerin iki katı boyutundadır. Varsayılan 56. */
  size?: number;
  /** Merkeze dönüş bölgesi; bu oranın altındaki değerler 0 sayılır. Varsayılan 0.15. */
  deadZone?: number;
  onMove?: (vector: SquareJoystickVector) => void;
  onRelease?: () => void;
}

/**
 * Joystick'in kare tabanlı varyantı — ayrı bir component'tir (Joystick'i
 * genişletmez). Fark: thumb dairesel bir sınıra değil, kare bir sınıra (her
 * eksende ayrı min/max ile) kenetlenir — 8 yönlü grid hareketinde dairesel
 * sınırın köşelere doğru getirdiği orantısız kısıtlamayı önler.
 *
 * `onMove` -1..1 normalize x/y döner, ama kare geometriye göre normalize
 * edilir (dairesel clamp yok) — çapraz yönlerde büyüklük √2 olabilir.
 */
export class SquareJoystick {
  readonly element: HTMLDivElement;
  private readonly base: HTMLDivElement;
  private readonly thumb: HTMLDivElement;
  private readonly halfSize: number;
  private readonly deadZone: number;
  private readonly onMoveHandler?: (vector: SquareJoystickVector) => void;
  private readonly onReleaseHandler?: () => void;
  private activePointerId: number | null = null;
  private originX = 0;
  private originY = 0;

  private readonly boundPointerDown: (event: PointerEvent) => void;
  private readonly boundPointerMove: (event: PointerEvent) => void;
  private readonly boundPointerUp: (event: PointerEvent) => void;

  constructor(options: SquareJoystickOptions = {}) {
    const {
      size = UI_SIZE.JOYSTICK_DEFAULT,
      deadZone = INPUT.DEAD_ZONE_RATIO,
      onMove,
      onRelease,
    } = options;
    this.halfSize = size;
    this.deadZone = deadZone;
    this.onMoveHandler = onMove;
    this.onReleaseHandler = onRelease;

    this.element = document.createElement('div');
    this.element.className = 'vol-square-joystick';
    this.element.style.setProperty('--vol-square-joystick-size', `${size}px`);

    this.base = document.createElement('div');
    this.base.className = 'vol-square-joystick__base';
    this.element.appendChild(this.base);

    this.thumb = document.createElement('div');
    this.thumb.className = 'vol-square-joystick__thumb';
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
    this.base.classList.add('vol-square-joystick__base--active');
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
    this.base.classList.remove('vol-square-joystick__base--active');
    this.thumb.style.transform = 'translate(-50%, -50%)';
    this.onReleaseHandler?.();
  }

  /** Joystick.updateFromPointer'dan farkı: dairesel clamp yerine her eksen ayrı ayrı kare sınıra (halfSize) kenetlenir. */
  private updateFromPointer(clientX: number, clientY: number): void {
    const dx = clientX - this.originX;
    const dy = clientY - this.originY;

    const clampedX = Math.max(-this.halfSize, Math.min(this.halfSize, dx));
    const clampedY = Math.max(-this.halfSize, Math.min(this.halfSize, dy));
    this.thumb.style.transform = `translate(calc(-50% + ${clampedX}px), calc(-50% + ${clampedY}px))`;

    const rawX = clampedX / this.halfSize;
    const rawY = clampedY / this.halfSize;
    const x = Math.abs(rawX) < this.deadZone ? 0 : rawX;
    const y = Math.abs(rawY) < this.deadZone ? 0 : rawY;

    this.onMoveHandler?.({ x, y });
  }
}
