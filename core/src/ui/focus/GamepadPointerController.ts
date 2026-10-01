import { DisposableScope } from '../../lifecycle/DisposableScope';
import { GAMEPAD_BUTTON, readStick, type PadLike } from '../../input/GamepadState';
import { selectGamepad } from '../../input/selectGamepad';
import { FOCUSABLE_SELECTOR, listFocusable } from './focusable';
import type { RectLike } from './directional';

type Point = { x: number; y: number };

export interface GamepadPointerOptions {
  root?: Document | HTMLElement;
  isActive?: () => boolean;
  getGamepads?: () => readonly (PadLike | null)[];
  hitTest?: (x: number, y: number) => Element | null;
  getBounds?: () => RectLike;
  initialPosition?: Point;
  axes?: readonly [number, number];
  button?: number;
  deadZone?: number;
  /** En yüksek hız, CSS piksel/saniye. */
  speed?: number;
  /** Hız değişimi, CSS piksel/saniye²; 0 anlık hızdır. */
  acceleration?: number;
  scrollEdgeSize?: number;
  scrollSpeed?: number;
}

type MotionOptions = Pick<GamepadPointerOptions, 'deadZone' | 'speed' | 'acceleration'>;
type Surface = {
  modal: HTMLElement | null;
  generationRoot: Element | null;
  generation: string | null;
};
type Press = { target: HTMLElement; surface: Surface };
const POINTER_ID = -1;
const HOVER_CLASS = 'vol-gamepad-hover';
const GENERATION_ATTRIBUTE = 'data-vol-activation-generation';
const DIALOG_SELECTOR = '[role="dialog"][aria-modal="true"]';

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function deltaSeconds(deltaMs: number): number {
  return Number.isFinite(deltaMs) ? clamp(deltaMs, 0, 100) / 1000 : 0;
}

export function computeGamepadPointerVelocity(
  stick: Point,
  previous: Point,
  deltaMs: number,
  options: MotionOptions,
): Point {
  const magnitude = Math.hypot(stick.x, stick.y);
  const deadZone = clamp(options.deadZone ?? 0.2, 0, 0.99);
  if (!Number.isFinite(magnitude) || magnitude <= deadZone) return { x: 0, y: 0 };
  const strength = (Math.min(1, magnitude) - deadZone) / (1 - deadZone);
  const speed = Math.max(0, options.speed ?? 760) * strength;
  const desired = { x: (stick.x / magnitude) * speed, y: (stick.y / magnitude) * speed };
  const acceleration = options.acceleration ?? 2800;
  if (acceleration <= 0) return desired;
  const dx = desired.x - previous.x;
  const dy = desired.y - previous.y;
  const difference = Math.hypot(dx, dy);
  const maximum = acceleration * deltaSeconds(deltaMs);
  const ratio = difference > 0 ? Math.min(1, maximum / difference) : 0;
  return { x: previous.x + dx * ratio, y: previous.y + dy * ratio };
}

function isVisible(element: Element): boolean {
  for (let current: Element | null = element; current; current = current.parentElement) {
    if (current instanceof HTMLElement && (current.hidden || current.inert)) return false;
    if (current.hasAttribute('inert') || current.getAttribute('aria-hidden') === 'true')
      return false;
    const style = getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}

export class GamepadPointerController {
  private readonly scope = new DisposableScope();
  private readonly root: Document | HTMLElement;
  private readonly document: Document;
  private point: Point;
  private positionReady: boolean;
  private velocity: Point = { x: 0, y: 0 };
  private previousPad: PadLike | null = null;
  private primaryHeld = false;
  private activationArmed = true;
  private activeWas = false;
  private neutralRequired = false;
  private owned = false;
  private hovered: HTMLElement | null = null;
  private hoverPath: HTMLElement[] = [];
  private press: Press | null = null;
  private started = false;
  private destroyed = false;
  private updating = false;

  constructor(private readonly options: GamepadPointerOptions = {}) {
    this.root = options.root ?? document;
    this.document = this.root instanceof Document ? this.root : this.root.ownerDocument;
    const rect = this.bounds();
    this.point = options.initialPosition ?? {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    };
    this.positionReady =
      options.initialPosition !== undefined || (rect.width > 0 && rect.height > 0);
  }

  get ownsPointer(): boolean {
    return this.owned;
  }
  get position(): Point {
    return { ...this.point };
  }

  start(): void {
    if (this.started || this.destroyed) return;
    this.started = true;
    const nativePointer = (event: PointerEvent): void => {
      if (event.pointerType === 'gamepad' || event.pointerId === POINTER_ID) return;
      this.releaseOwnership(true);
      if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
        this.point = { x: event.clientX, y: event.clientY };
        this.positionReady = true;
        this.constrainPoint();
      }
    };
    this.scope.addListener(this.document, 'pointermove', nativePointer);
    this.scope.addListener(this.document, 'pointerdown', nativePointer);
    this.scope.addListener(this.document, 'pointerup', nativePointer);
    this.scope.addListener(this.document, 'keydown', () => this.releaseOwnership(true));
    this.scope.addListener(this.document.defaultView ?? window, 'blur', () =>
      this.releaseOwnership(true),
    );
    let previousTime: number | null = null;
    const tick = (time: number): void => {
      if (!this.started) return;
      this.update(previousTime === null ? 0 : time - previousTime);
      previousTime = time;
      this.scope.addAnimationFrame(tick);
    };
    this.scope.addAnimationFrame(tick);
  }

  update(deltaMs: number, pad?: PadLike | null): void {
    if (this.destroyed || this.updating) return;
    this.updating = true;
    try {
      this.poll(deltaMs, pad === undefined ? this.selectPad() : pad);
    } finally {
      this.updating = false;
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.started = false;
    this.releaseOwnership(false);
    this.scope.dispose();
  }

  private selectPad(): PadLike | null {
    const pads =
      this.options.getGamepads?.() ??
      (typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : []);
    return selectGamepad(pads, this.previousPad, { deadZone: this.options.deadZone });
  }

  private poll(deltaMs: number, pad: PadLike | null): void {
    const modal = this.topModal();
    const active =
      this.options.isActive?.() !== false &&
      (!modal || this.root.contains(modal)) &&
      pad?.connected === true &&
      pad.mapping === 'standard';
    const primary = pad?.buttons[this.options.button ?? GAMEPAD_BUTTON.primary]?.pressed === true;
    const changedPad = pad?.index !== this.previousPad?.index || pad?.id !== this.previousPad?.id;
    if (changedPad) {
      this.releaseOwnership(false);
      this.primaryHeld = primary;
      this.activationArmed = !primary;
    }
    if (active && !this.activeWas) this.activationArmed = !primary;
    if (!primary) this.activationArmed = true;
    if (!active || !pad) {
      this.releaseOwnership(false);
    } else {
      const stick = readStick(pad, this.options.axes ?? [2, 3]);
      const moving = Math.hypot(stick.x, stick.y) > (this.options.deadZone ?? 0.2);
      if (!moving) this.neutralRequired = false;
      const navigation = readStick(pad, [0, 1]);
      const dpad = [
        GAMEPAD_BUTTON.dpadUp,
        GAMEPAD_BUTTON.dpadDown,
        GAMEPAD_BUTTON.dpadLeft,
        GAMEPAD_BUTTON.dpadRight,
      ].some((index) => pad.buttons[index]?.pressed);
      if (dpad || Math.hypot(navigation.x, navigation.y) > (this.options.deadZone ?? 0.2)) {
        this.releaseOwnership(moving);
      } else if (moving && !this.neutralRequired) {
        this.owned = true;
      }
      if (this.owned) {
        if (!this.positionReady) {
          const rect = this.bounds();
          if (rect.width > 0 && rect.height > 0) {
            this.point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
            this.positionReady = true;
          }
        }
        this.velocity = computeGamepadPointerVelocity(stick, this.velocity, deltaMs, this.options);
        const previous = this.position;
        this.point.x += this.velocity.x * deltaSeconds(deltaMs);
        this.point.y += this.velocity.y * deltaSeconds(deltaMs);
        this.constrainPoint();
        const hit = this.hitTarget();
        const hoverChanged = this.setHover(hit);
        if (hoverChanged || previous.x !== this.point.x || previous.y !== this.point.y)
          this.dispatch(hit ?? this.document, 'pointermove', primary ? 1 : 0);
        if (this.press && !this.sameSurface(this.press)) this.cancelPress();
        if (primary && !this.primaryHeld && this.activationArmed) this.beginPress(hit);
        if (!primary && this.primaryHeld) this.endPress(hit);
        if (moving && hit) this.scrollAtEdge(hit, deltaMs);
      }
    }
    this.primaryHeld = primary;
    this.activeWas = active;
    this.previousPad = pad;
  }

  private bounds(): RectLike {
    if (this.options.getBounds) return this.options.getBounds();
    if (this.root instanceof HTMLElement) return this.root.getBoundingClientRect();
    const view = this.document.defaultView;
    return { x: 0, y: 0, width: view?.innerWidth ?? 1, height: view?.innerHeight ?? 1 };
  }

  private constrainPoint(): void {
    const rect = this.bounds();
    this.point.x = clamp(this.point.x, rect.x, rect.x + Math.max(0, rect.width - 1));
    this.point.y = clamp(this.point.y, rect.y, rect.y + Math.max(0, rect.height - 1));
  }

  private topModal(): HTMLElement | null {
    const dialogs = Array.from(this.document.querySelectorAll<HTMLElement>(DIALOG_SELECTOR)).filter(
      (dialog) => isVisible(dialog) && dialog.getBoundingClientRect().width > 0,
    );
    return dialogs[dialogs.length - 1] ?? null;
  }

  private hitTarget(): HTMLElement | null {
    const hit =
      this.options.hitTest?.(this.point.x, this.point.y) ??
      (this.options.hitTest ? null : this.document.elementFromPoint?.(this.point.x, this.point.y));
    if (!(hit instanceof HTMLElement) || !this.root.contains(hit) || !isVisible(hit)) return null;
    const modal = this.topModal();
    return modal && !modal.contains(hit) ? null : hit;
  }

  private interactive(hit: HTMLElement | null): HTMLElement | null {
    const target = hit?.closest<HTMLElement>(FOCUSABLE_SELECTOR) ?? null;
    return target && !target.matches(':disabled') && listFocusable(this.root).includes(target)
      ? target
      : null;
  }

  private setHover(hit: HTMLElement | null): boolean {
    if (hit === this.hovered) return false;
    const old = this.hovered;
    const oldPath = this.hoverPath;
    const nextPath: HTMLElement[] = [];
    for (let element = hit; element; element = element.parentElement) {
      nextPath.push(element);
      if (element === this.root || element === this.document.documentElement) break;
    }
    if (old) this.dispatch(old, 'pointerout', 0, hit);
    for (const element of oldPath) {
      if (nextPath.includes(element)) continue;
      element.classList.remove(HOVER_CLASS);
      this.dispatch(element, 'pointerleave', 0, hit, false);
    }
    this.hovered = hit;
    this.hoverPath = nextPath;
    if (hit) this.dispatch(hit, 'pointerover', 0, old);
    for (const element of nextPath) {
      if (oldPath.includes(element)) continue;
      element.classList.add(HOVER_CLASS);
      this.dispatch(element, 'pointerenter', 0, old, false);
    }
    const target = this.interactive(hit);
    if (target && !target.matches('input, select, textarea, [contenteditable]'))
      target.focus({ preventScroll: true });
    return true;
  }

  private surface(target: HTMLElement): Surface {
    const generationRoot = target.closest(`[${GENERATION_ATTRIBUTE}]`);
    return {
      modal: this.topModal(),
      generationRoot,
      generation: generationRoot?.getAttribute(GENERATION_ATTRIBUTE) ?? null,
    };
  }

  private sameSurface(press: Press): boolean {
    if (!press.target.isConnected || !isVisible(press.target) || !this.root.contains(press.target))
      return false;
    const surface = this.surface(press.target);
    return (
      press.surface.modal === surface.modal &&
      press.surface.generationRoot === surface.generationRoot &&
      press.surface.generation === surface.generation
    );
  }

  private beginPress(hit: HTMLElement | null): void {
    const target = this.interactive(hit);
    if (!target) return;
    this.press = { target, surface: this.surface(target) };
    target.focus({ preventScroll: true });
    if (!this.dispatch(target, 'pointerdown', 1)) this.cancelPress();
  }

  private endPress(hit: HTMLElement | null): void {
    const press = this.press;
    this.press = null;
    if (!press) return;
    const target = this.interactive(hit);
    if (target !== press.target || !this.sameSurface(press)) {
      this.dispatch(press.target, 'pointercancel', 0);
      return;
    }
    if (this.dispatch(target, 'pointerup', 0) && this.sameSurface(press))
      this.dispatch(target, 'click', 0);
  }

  private cancelPress(): void {
    const press = this.press;
    this.press = null;
    if (press) this.dispatch(press.target, 'pointercancel', 0);
  }

  private releaseOwnership(requireNeutral: boolean): void {
    this.owned = false;
    this.velocity = { x: 0, y: 0 };
    if (requireNeutral) this.neutralRequired = true;
    this.cancelPress();
    this.setHover(null);
  }

  private dispatch(
    target: EventTarget,
    type: string,
    buttons: number,
    relatedTarget: EventTarget | null = null,
    bubbles = true,
  ): boolean {
    return target.dispatchEvent(
      new PointerEvent(type, {
        pointerId: POINTER_ID,
        pointerType: 'gamepad',
        clientX: this.point.x,
        clientY: this.point.y,
        button: type === 'pointermove' ? -1 : 0,
        buttons,
        relatedTarget,
        bubbles,
        cancelable: type !== 'pointerenter' && type !== 'pointerleave',
        detail: type === 'click' ? 1 : 0,
      }),
    );
  }

  private scrollAtEdge(hit: HTMLElement, deltaMs: number): void {
    const modal = this.topModal();
    for (let element: HTMLElement | null = hit; element; element = element.parentElement) {
      const style = getComputedStyle(element);
      const vertical =
        /^(auto|scroll)$/.test(style.overflowY) && element.scrollHeight > element.clientHeight;
      const horizontal =
        /^(auto|scroll)$/.test(style.overflowX) && element.scrollWidth > element.clientWidth;
      if (vertical || horizontal) {
        const rect = element.getBoundingClientRect();
        const edge = Math.max(1, this.options.scrollEdgeSize ?? 24);
        const speed = (this.options.scrollSpeed ?? 600) * deltaSeconds(deltaMs);
        const direction = (value: number, low: number, high: number): number =>
          value < low + edge
            ? -clamp((low + edge - value) / edge, 0, 1)
            : value > high - edge
              ? clamp((value - high + edge) / edge, 0, 1)
              : 0;
        if (vertical)
          element.scrollTop = clamp(
            element.scrollTop + direction(this.point.y, rect.top, rect.bottom) * speed,
            0,
            element.scrollHeight - element.clientHeight,
          );
        if (horizontal)
          element.scrollLeft = clamp(
            element.scrollLeft + direction(this.point.x, rect.left, rect.right) * speed,
            0,
            element.scrollWidth - element.clientWidth,
          );
        return;
      }
      if (element === modal || element === this.root) return;
    }
  }
}
