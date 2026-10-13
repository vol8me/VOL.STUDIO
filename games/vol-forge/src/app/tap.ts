export interface TapOptions {
  /** Bu pikselden fazla kayan işaretçi kaydırmadır, dokunma değildir. */
  readonly slopPx: number;
  /** Bu süreden kısa basış dokunmadır. */
  readonly maxMs: number;
  /** Dokunmatikte `maxMs` ile bu süre arasındaki kımıldamayan basış ikincil (silme) dokunuşudur. */
  readonly longPressMs: number;
}

export interface Tap {
  readonly x: number;
  readonly y: number;
  /** Sağ fare tuşu ya da dokunmatikte uzun basış. */
  readonly secondary: boolean;
}

interface Down {
  readonly x: number;
  readonly y: number;
  readonly at: number;
  readonly button: number;
  readonly touch: boolean;
  moved: boolean;
}

/**
 * Ham işaretçi olaylarından dokunma ayıklar: kamera kaydırması ve parmak sıkıştırma dokunma sayılmaz.
 * Zaman ve konum dışarıdan gelir; DOM'a dokunmaz.
 */
export class TapDetector {
  private readonly downs = new Map<number, Down>();
  /** İkinci parmak indiğinde ilk parmağın bırakılışı da dokunma olmaz. */
  private multi = false;

  constructor(private readonly options: TapOptions) {}

  down(id: number, x: number, y: number, at: number, button: number, touch: boolean): void {
    if (this.downs.size > 0) {
      this.multi = true;
      for (const other of this.downs.values()) other.moved = true;
    }
    this.downs.set(id, { x, y, at, button, touch, moved: this.multi });
  }

  move(id: number, x: number, y: number): void {
    const down = this.downs.get(id);
    if (!down || down.moved) return;
    if (Math.hypot(x - down.x, y - down.y) > this.options.slopPx) down.moved = true;
  }

  up(id: number, x: number, y: number, at: number): Tap | null {
    const down = this.downs.get(id);
    if (!down) return null;
    this.downs.delete(id);
    if (this.downs.size === 0) this.multi = false;
    if (down.moved || Math.hypot(x - down.x, y - down.y) > this.options.slopPx) return null;
    const duration = at - down.at;
    if (duration < 0) return null;
    // Fare: yalnız sol (0) ve sağ (2) tuş; orta tuş ve diğerleri dokunma değildir.
    if (!down.touch && down.button !== 0 && down.button !== 2) return null;
    if (down.button === 2 && !down.touch) return { x, y, secondary: true };
    if (duration <= this.options.maxMs) return { x, y, secondary: false };
    if (down.touch && duration <= this.options.longPressMs) return { x, y, secondary: true };
    return null;
  }

  cancel(id: number): void {
    this.downs.delete(id);
    if (this.downs.size === 0) this.multi = false;
  }

  get active(): number {
    return this.downs.size;
  }
}
