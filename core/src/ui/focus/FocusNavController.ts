import { DisposableScope } from '../../lifecycle/DisposableScope';
import { triggerBack } from '../../platform/backNavigation';
import { GAMEPAD_BUTTON, readStick, type PadLike } from '../../input/GamepadState';
import { pickDirectionalTarget, type NavDirection } from './directional';
import { listFocusable } from './focusable';
import { activateWithIntent } from './activationIntent';
import { FOCUS_PRESS_EVENT, FOCUS_RELEASE_EVENT, HOLD_MARKER } from '../buttons/holdInput';
import { selectGamepad } from '../../input/selectGamepad';

/**
 * Kol (ve ok tuşları) ile arayüz gezinmesi.
 *
 * - **D-pad ve sol çubuk** uzamsal odak taşır (`pickDirectionalTarget`).
 * - **A (primary)** odaktaki elemanı `click` ile etkinleştirir.
 * - **B (secondary)** ve **Escape** ortak geri yığınına düşer
 *   (`triggerBack` — Android geri ile aynı zincir).
 * - **Menu/Start** `onMenu`'ye, **LB/RB** `onPrevTab`/`onNextTab`'a gider.
 *
 * **Odak halkası:** nav-sürücülü odak `vol-focusnav-current` sınıfı taşır;
 * işaretçi etkileşimi (pointerdown) sınıfı siler. Böylece halka yalnız kol
 * ve klavye kipinde görünür — fareyle tıklanan eleman halka göstermez.
 * Görsel kural CSS'tedir, sınıf burada yalnız işaretçidir.
 *
 * Metin alanında ok tuşları ve
 * Escape gezinmeyi devralmaz — düzenleme davranışı kazansın.
 */
export interface FocusNavOptions {
  /** Tarama kökü; varsayılan `document`. */
  root?: ParentNode;
  /** Menu/Start düğmesi (duraklatma tüketicide). */
  onMenu?: () => void;
  /** LB → önceki sekme, RB → sonraki sekme. */
  onPrevTab?: () => void;
  onNextTab?: () => void;
  /** Kol listesi; varsayılan `navigator.getGamepads`. */
  getGamepads?: () => readonly (PadLike | null)[];
  /** Yön ve A gezinmesi; B/Escape/Menu ortak geri yolunu kullanmayı sürdürür. */
  isNavigationActive?: () => boolean;
  /** Çubuk tekrarının monoton saati; varsayılan `performance.now`. */
  now?: () => number;
  /** true dönerse A niyetini tüketir; ör. sanal pointer down/up sahibidir. */
  onActivate?: () => boolean;
}

/** Nav sürücülü odağın taşıdığı sınıf — CSS halkası bunu okur. */
export const FOCUS_NAV_CLASS = 'vol-focusnav-current';

const STICK_NAV_THRESHOLD = 0.6;
const STICK_REPEAT_DELAY_MS = 280;
const STICK_REPEAT_INTERVAL_MS = 105;
const DIR_BY_BUTTON: Readonly<Record<number, NavDirection>> = {
  [GAMEPAD_BUTTON.dpadUp]: 'up',
  [GAMEPAD_BUTTON.dpadDown]: 'down',
  [GAMEPAD_BUTTON.dpadLeft]: 'left',
  [GAMEPAD_BUTTON.dpadRight]: 'right',
};
const KEY_BY_DIR: Readonly<Record<string, NavDirection>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

function isEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const editable = target.closest('[contenteditable]');
  if (editable && editable.getAttribute('contenteditable') !== 'false') return true;
  const input = target.closest('input, textarea');
  if (!input) return false;
  return (
    !(input instanceof HTMLInputElement) ||
    !['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'file', 'color'].includes(
      input.type,
    )
  );
}

function adjustRange(input: HTMLInputElement, direction: NavDirection): boolean {
  const style = getComputedStyle(input);
  const vertical = /^(vertical|sideways)-/.test(style.writingMode);
  if (
    vertical
      ? direction === 'left' || direction === 'right'
      : direction === 'up' || direction === 'down'
  ) {
    return false;
  }
  const forward = vertical ? direction === 'down' : direction === 'right';
  const increase = style.direction === 'rtl' ? !forward : forward;
  const previous = input.value;
  if (input.step === 'any') {
    input.value = String(input.valueAsNumber + (increase ? 1 : -1));
  } else if (increase) {
    input.stepUp();
  } else {
    input.stepDown();
  }
  if (input.value !== previous) {
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return true;
}

export class FocusNavController {
  private readonly scope = new DisposableScope();
  private readonly options: FocusNavOptions;
  private readonly root: ParentNode;
  private prevButtons = new Set<number>();
  private stickDir: NavDirection | null = null;
  private nextStickMoveAt = 0;
  private escapeHeld = false;
  private padBackHeld = false;
  private navWasActive = true;
  private activationArmed = true;
  private started = false;
  private previousPad: PadLike | null = null;
  /** A basılıyken odaktaki basılı-tutma denetimi: A bırakılınca, odak değişince ya da söküm anında bırakılır. */
  private heldTarget: HTMLElement | null = null;

  constructor(options: FocusNavOptions = {}) {
    this.options = options;
    this.root = options.root ?? document;
  }

  /** Dinleyicileri ve kol yoklamasını kurar; `destroy` ile geri alınır. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.scope.addListener(document, 'keydown', (event: KeyboardEvent) => this.onKeydown(event));
    this.scope.addListener(document, 'keyup', (event: KeyboardEvent) => {
      if (event.key === 'Escape') this.escapeHeld = false;
    });
    this.scope.addListener(window, 'blur', () => {
      this.escapeHeld = false;
    });
    // İşaretçiyle odaklanınca nav halkasını temizle: halka yalnız kol/klavye
    // gezinmesinin işaretidir.
    this.scope.addListener(document, 'pointerdown', () => this.clearRing());
    const pump = (): void => {
      if (this.started) {
        this.pollPad();
        this.scope.addAnimationFrame(pump);
      }
    };
    this.scope.addAnimationFrame(pump);
  }

  /** Geçerli odak — nav sürücülüyse halka işaretli eleman. */
  get focused(): HTMLElement | null {
    const active = document.activeElement;
    return active instanceof HTMLElement ? active : null;
  }

  /** Yön tuşu/çubuk hareketi: odak yoksa ilk adaya, varsa uzamsal komşuya. */
  move(direction: NavDirection): void {
    if (this.options.isNavigationActive?.() === false) return;
    const candidates = listFocusable(this.root);
    if (candidates.length === 0) return;
    const current = this.focused;
    if (
      current instanceof HTMLInputElement &&
      current.type === 'range' &&
      candidates.includes(current) &&
      adjustRange(current, direction)
    ) {
      return;
    }
    const next =
      current && candidates.includes(current)
        ? pickDirectionalTarget(
            current.getBoundingClientRect(),
            candidates
              .filter((el) => el !== current)
              .map((el) => ({ element: el, rect: el.getBoundingClientRect() })),
            direction,
          )
        : candidates[0];
    this.focusElement(next ?? current ?? candidates[0]);
  }

  /** Odaktaki elemanı etkinleştirir (A / Enter). */
  activate(): void {
    if (this.options.isNavigationActive?.() === false) return;
    if (this.options.onActivate?.()) return;
    const candidates = listFocusable(this.root);
    const current = this.focused;
    if (current && candidates.includes(current)) {
      activateWithIntent(current);
    } else {
      this.focusElement(candidates[0] ?? null);
    }
  }

  /**
   * Kol A tuşu. Basılı-tutma denetimi (`data-vol-hold`) `click` yerine basış ve bırakış alır: kenar
   * tetikli tek `click` Hold/Charge/LongPress'i çalıştıramaz. Diğer her öğe `activate` yolunu izler.
   */
  private pressPrimary(): void {
    const current = this.focused;
    if (
      current &&
      current.dataset[HOLD_MARKER] !== undefined &&
      this.options.isNavigationActive?.() !== false &&
      !this.options.onActivate?.() &&
      listFocusable(this.root).includes(current)
    ) {
      this.heldTarget = current;
      current.dispatchEvent(new Event(FOCUS_PRESS_EVENT));
      return;
    }
    this.activate();
  }

  private releaseHeld(): void {
    const target = this.heldTarget;
    this.heldTarget = null;
    target?.dispatchEvent(new Event(FOCUS_RELEASE_EVENT));
  }

  /** Geri yığınına düşürür (B / Escape / Android geri). */
  back(): boolean {
    if (isEditingTarget(this.focused)) return false;
    this.clearRing();
    return triggerBack();
  }

  private focusElement(element: HTMLElement | null): void {
    if (!element) return;
    this.clearRing();
    element.focus({ preventScroll: true });
    element.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    element.classList.add(FOCUS_NAV_CLASS);
  }

  private clearRing(): void {
    document.activeElement?.classList?.remove(FOCUS_NAV_CLASS);
    for (const el of document.querySelectorAll(`.${FOCUS_NAV_CLASS}`)) {
      el.classList.remove(FOCUS_NAV_CLASS);
    }
  }

  private onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (event.defaultPrevented || isEditingTarget(event.target)) {
        this.escapeHeld = true;
        return;
      }
      if (event.repeat || this.escapeHeld) {
        this.escapeHeld = true;
        event.preventDefault();
        return;
      }
      this.escapeHeld = true;
      const pad = this.selectPad();
      if (pad && !pad.buttons[GAMEPAD_BUTTON.secondary]?.pressed) this.padBackHeld = false;
      const handledByPad = this.padBackHeld;
      if (pad?.buttons[GAMEPAD_BUTTON.secondary]?.pressed) this.padBackHeld = true;
      if (handledByPad || this.back()) event.preventDefault();
      return;
    }
    if (event.defaultPrevented || isEditingTarget(event.target)) return;
    if (event.target instanceof HTMLElement && event.target.closest('select')) return;
    const dir = KEY_BY_DIR[event.key];
    if (dir && this.options.isNavigationActive?.() !== false) {
      event.preventDefault();
      this.move(dir);
    }
  }

  private selectPad(): PadLike | null {
    const getter =
      this.options.getGamepads ??
      (() =>
        typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function'
          ? navigator.getGamepads()
          : []);
    this.previousPad = selectGamepad(getter(), this.previousPad);
    return this.previousPad?.mapping === 'standard' ? this.previousPad : null;
  }

  /** Kolu yokla: kenar basımları ve çubuk yön değişimi tek karede işlenir. */
  pollPad(pad: PadLike | null = this.selectPad()): void {
    const pressed = new Set<number>();
    if (pad) {
      pad.buttons.forEach((button, index) => {
        if (button.pressed) pressed.add(index);
      });
      const active = this.options.isNavigationActive?.() !== false;
      if (active && !this.navWasActive) this.activationArmed = false;
      if (!pressed.has(GAMEPAD_BUTTON.primary)) this.activationArmed = true;
      for (const index of pressed) {
        if (this.prevButtons.has(index)) continue;
        if (
          index === GAMEPAD_BUTTON.start ||
          index === GAMEPAD_BUTTON.secondary ||
          index === GAMEPAD_BUTTON.leftBumper ||
          index === GAMEPAD_BUTTON.rightBumper ||
          active
        ) {
          this.onPadButton(index);
        }
      }
      if (active) {
        const stick = readStick(pad, [0, 1]);
        const dir = this.dominantStickDir(stick.x, stick.y);
        const now = this.options.now?.() ?? performance.now();
        if (dir && (dir !== this.stickDir || now >= this.nextStickMoveAt)) {
          this.move(dir);
          this.nextStickMoveAt =
            now + (dir === this.stickDir ? STICK_REPEAT_INTERVAL_MS : STICK_REPEAT_DELAY_MS);
        }
        this.stickDir = dir;
      } else {
        this.stickDir = null;
      }
      this.navWasActive = active;
    } else {
      this.stickDir = null;
    }
    this.padBackHeld = pressed.has(GAMEPAD_BUTTON.secondary);
    this.prevButtons = pressed;
    if (
      this.heldTarget &&
      (!pressed.has(GAMEPAD_BUTTON.primary) || this.options.isNavigationActive?.() === false)
    ) {
      this.releaseHeld();
    }
  }

  private dominantStickDir(x: number, y: number): NavDirection | null {
    if (Math.hypot(x, y) < STICK_NAV_THRESHOLD) return null;
    return Math.abs(x) >= Math.abs(y) ? (x > 0 ? 'right' : 'left') : y > 0 ? 'down' : 'up';
  }

  private onPadButton(index: number): void {
    const dir = DIR_BY_BUTTON[index];
    if (dir) return this.move(dir);
    switch (index) {
      case GAMEPAD_BUTTON.primary:
        if (this.activationArmed) this.pressPrimary();
        return;
      case GAMEPAD_BUTTON.secondary:
        if (!this.escapeHeld && !this.padBackHeld) this.back();
        return;
      case GAMEPAD_BUTTON.start:
        this.options.onMenu?.();
        return;
      case GAMEPAD_BUTTON.leftBumper:
        this.options.onPrevTab?.();
        return;
      case GAMEPAD_BUTTON.rightBumper:
        this.options.onNextTab?.();
    }
  }

  destroy(): void {
    this.releaseHeld();
    this.started = false;
    this.clearRing();
    this.scope.dispose();
  }
}
