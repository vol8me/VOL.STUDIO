import { DisposableScope } from '../../lifecycle/DisposableScope';
import { triggerBack } from '../../platform/backNavigation';
import { GAMEPAD_BUTTON, readStick, type PadLike } from '../../input/GamepadState';
import { pickDirectionalTarget, type NavDirection } from './directional';
import { listFocusable } from './focusable';

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
 * Metin alanında (`input`/`textarea`/`contenteditable`) ok tuşları ve
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
}

/** Nav sürücülü odağın taşıdığı sınıf — CSS halkası bunu okur. */
export const FOCUS_NAV_CLASS = 'vol-focusnav-current';

const STICK_NAV_THRESHOLD = 0.6;
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
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

export class FocusNavController {
  private readonly scope = new DisposableScope();
  private readonly options: FocusNavOptions;
  private readonly root: ParentNode;
  private prevButtons = new Set<number>();
  private stickDir: NavDirection | null = null;
  private started = false;

  constructor(options: FocusNavOptions = {}) {
    this.options = options;
    this.root = options.root ?? document;
  }

  /** Dinleyicileri ve kol yoklamasını kurar; `destroy` ile geri alınır. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.scope.addListener(document, 'keydown', (event: KeyboardEvent) => this.onKeydown(event));
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
    const candidates = listFocusable(this.root);
    if (candidates.length === 0) return;
    const current = this.focused;
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
    this.focused?.click();
  }

  /** Geri yığınına düşürür (B / Escape / Android geri). */
  back(): boolean {
    this.clearRing();
    return triggerBack();
  }

  private focusElement(element: HTMLElement | null): void {
    if (!element) return;
    this.clearRing();
    element.focus({ preventScroll: false });
    element.classList.add(FOCUS_NAV_CLASS);
  }

  private clearRing(): void {
    document.activeElement?.classList?.remove(FOCUS_NAV_CLASS);
    for (const el of document.querySelectorAll(`.${FOCUS_NAV_CLASS}`)) {
      el.classList.remove(FOCUS_NAV_CLASS);
    }
  }

  private onKeydown(event: KeyboardEvent): void {
    if (isEditingTarget(event.target)) return;
    if (event.key === 'Escape') {
      if (this.back()) event.preventDefault();
      return;
    }
    const dir = KEY_BY_DIR[event.key];
    if (dir) {
      event.preventDefault();
      this.move(dir);
    }
  }

  private selectPad(): PadLike | null {
    const getter =
      this.options.getGamepads ??
      (() =>
        typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function'
          ? (navigator.getGamepads() as readonly (PadLike | null)[])
          : []);
    for (const pad of getter()) {
      if (pad?.connected && pad.mapping === 'standard') return pad;
    }
    return null;
  }

  /** Kolu yokla: kenar basımları ve çubuk yön değişimi tek karede işlenir. */
  pollPad(pad: PadLike | null = this.selectPad()): void {
    const pressed = new Set<number>();
    if (pad) {
      pad.buttons.forEach((button, index) => {
        if (button.pressed) pressed.add(index);
      });
      for (const index of pressed) {
        if (this.prevButtons.has(index)) continue;
        this.onPadButton(index);
      }
      const stick = readStick(pad, [0, 1]);
      const dir = this.dominantStickDir(stick.x, stick.y);
      if (dir && dir !== this.stickDir) this.move(dir);
      this.stickDir = dir;
    } else {
      this.stickDir = null;
    }
    this.prevButtons = pressed;
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
        return this.activate();
      case GAMEPAD_BUTTON.secondary:
        this.back();
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
    this.started = false;
    this.clearRing();
    this.scope.dispose();
  }
}
