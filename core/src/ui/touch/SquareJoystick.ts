import { INPUT, UI_SIZE } from '../../constants';
import { DisposableScope } from '../../lifecycle/DisposableScope';
import { i18next } from '../../i18n/I18n';
import { ArrowKeyHold } from './arrowKeys';

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
  /** Erişilebilir ad (klavyeyle odaklanan çubuk için); verilmezse `core:joystick.label`. */
  label?: string;
}

/**
 * Joystick'in kare tabanlı varyantı — ayrı bir component'tir (Joystick'i
 * genişletmez). Fark: thumb dairesel bir sınıra değil, kare bir sınıra (her
 * eksende ayrı min/max ile) kenetlenir — 8 yönlü grid hareketinde dairesel
 * sınırın köşelere doğru getirdiği orantısız kısıtlamayı önler.
 *
 * `onMove` -1..1 normalize x/y döner, ama kare geometriye göre normalize
 * edilir (dairesel clamp yok) — çapraz yönlerde büyüklük √2 olabilir.
 *
 * **Klavye:** Joystick ile aynı (`ArrowKeyHold`): çubuk odaklanabilir, ok tuşları basılı tutuldukça kare geometrinin ham
 * ekseninde (-1/0/1) vektör üretir, son tuş bırakılınca ya da odak kaybında `onRelease` çağrılır; işaretçi basılıyken
 * tuşlar yok sayılır.
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
  /** Bileşen ömrü boyunca yaşayan tek kaynak: `base`'e bağlı `pointerdown`. */
  private readonly scope = new DisposableScope();
  /** Yalnızca bir sürükleme oturumu boyunca yaşar — bkz. `attachDragListeners`. */
  private dragScope: DisposableScope | null = null;
  private readonly keys = new ArrowKeyHold({
    onChange: (x, y) => this.applyKeys(x, y),
    onRelease: () => this.releaseKeys(),
    isBlocked: () => this.activePointerId !== null,
  });

  constructor(options: SquareJoystickOptions = {}) {
    const {
      size = UI_SIZE.JOYSTICK_DEFAULT_PX,
      deadZone = INPUT.DEAD_ZONE_RATIO,
      onMove,
      onRelease,
      label,
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
    this.base.tabIndex = 0;
    this.base.setAttribute('role', 'group');
    this.base.setAttribute('aria-label', label ?? i18next.t('core:joystick.label'));
    this.base.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowLeft ArrowRight');
    this.element.appendChild(this.base);

    this.thumb = document.createElement('div');
    this.thumb.className = 'vol-square-joystick__thumb';
    this.base.appendChild(this.thumb);

    this.boundPointerDown = (event) => this.onPointerDown(event);
    this.boundPointerMove = (event) => this.onPointerMove(event);
    this.boundPointerUp = (event) => this.onPointerUp(event);

    // Global dinleyiciler yalnızca sürükleme süresince bağlı tutulur. Constructor'da
    // bağlamak, hiç dokunulmayan bir joystick için bile sayfadaki her pointermove'u
    // handler'a sokardı (bkz. RadialMenu/Kanban aynı deseni kullanır).
    this.scope.addListener(this.base, 'pointerdown', this.boundPointerDown as EventListener);
    this.scope.addListener(this.base, 'keydown', ((event: KeyboardEvent) =>
      this.keys.keydown(event)) as EventListener);
    this.scope.addListener(this.base, 'keyup', ((event: KeyboardEvent) =>
      this.keys.keyup(event)) as EventListener);
    this.scope.addListener(this.base, 'blur', () => this.keys.release());
  }

  destroy(): void {
    this.dragScope?.dispose();
    this.scope.dispose();
    this.element.remove();
  }

  /** Tutulan ok tuşlarının ham ekseni (-1/0/1): kare geometride çapraz da tam kenara varır. */
  private applyKeys(x: number, y: number): void {
    this.base.classList.toggle('vol-square-joystick__base--active', x !== 0 || y !== 0);
    this.thumb.style.transform = `translate(calc(-50% + ${x * this.halfSize}px), calc(-50% + ${y * this.halfSize}px))`;
    this.onMoveHandler?.({ x, y });
  }

  private releaseKeys(): void {
    this.base.classList.remove('vol-square-joystick__base--active');
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
