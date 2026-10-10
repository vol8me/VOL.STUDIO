const ARROWS: readonly string[] = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

export interface ArrowKeyHoldHandlers {
  /** Tutulan ok tuşlarının eksen değerleri (-1, 0 ya da 1); en az bir tuş basılıyken her değişimde çağrılır. */
  onChange(x: number, y: number): void;
  /** Son tuş bırakıldı ya da odak kayboldu; eksen değerleri artık 0. */
  onRelease(): void;
  /** `true` iken (işaretçi basılı) tuşlar yok sayılır: iki girdi aynı çubuğu aynı anda sürmez. */
  isBlocked(): boolean;
}

/**
 * Çubukların klavye eşdeğeri: ok tuşları basılı tutuldukça yön üretir (basış = hareket, bırakış = durma). Joystick ve
 * SquareJoystick aynı semantiği paylaşır; biri çoğaltılırsa ikisi ayrışır. Tuşlar `keydown`/`keyup`/`blur` olaylarından
 * beslenir; çubuk kendi geometrisine göre dönüştürür (daire birim uzunluğa normalize eder, kare ham eksen verir).
 */
export class ArrowKeyHold {
  private readonly held = new Set<string>();
  private engaged = false;

  constructor(private readonly handlers: ArrowKeyHoldHandlers) {}

  keydown(event: KeyboardEvent): void {
    if (!ARROWS.includes(event.key) || this.handlers.isBlocked()) return;
    event.preventDefault();
    if (event.repeat) return;
    this.held.add(event.key);
    this.apply();
  }

  keyup(event: KeyboardEvent): void {
    if (!this.held.delete(event.key)) return;
    event.preventDefault();
    if (this.held.size === 0) this.release();
    else this.apply();
  }

  /** Bırakır: tuş yoksa ya da klavye hiç devreye girmediyse sessizdir; işaretçi basılıyken `onRelease` çağrılmaz. */
  release(): void {
    const wasEngaged = this.engaged;
    this.held.clear();
    this.engaged = false;
    if (!wasEngaged || this.handlers.isBlocked()) return;
    this.handlers.onRelease();
  }

  private apply(): void {
    const x = (this.held.has('ArrowRight') ? 1 : 0) - (this.held.has('ArrowLeft') ? 1 : 0);
    const y = (this.held.has('ArrowDown') ? 1 : 0) - (this.held.has('ArrowUp') ? 1 : 0);
    this.engaged = true;
    this.handlers.onChange(x, y);
  }
}
