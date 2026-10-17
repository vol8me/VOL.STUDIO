import type { Vector2 } from '../math/Vector2';

/** Sanal çubuk adı: hareket (sol) ve nişan (sağ). */
export type VirtualStick = 'move' | 'aim';

interface StickValue {
  x: number;
  y: number;
  held: boolean;
}

/**
 * Ekran üstü sabit joystick'lerin (CORE `Joystick`) eksen kaydı;
 * `VirtualActionSource`un eksen karşılığı. Joystick `onMove`/`onRelease` ile
 * yazar, dokunmatik sağlayıcı (`TouchStickState`) okur.
 *
 * **Ayrı provider DEĞİL:** dokunmatik sağlayıcının kümesine karışır; serbest
 * çubuk, sabit joystick ve ekran düğmeleri aynı karede birleşir.
 *
 * Değerler -1..1 normalize eksendir. Ölü bölge burada UYGULANMAZ: sağlayıcı
 * serbest çubukla aynı ölü bölgeyi ve normalizasyonu uygular; joystick'in
 * kendi ölü bölgesi 0 verilmelidir, yoksa iki kez uygulanır.
 */
export class VirtualStickSource {
  readonly #suppressed = new Set<VirtualStick>();
  readonly #sticks: Record<VirtualStick, StickValue> = {
    move: { x: 0, y: 0, held: false },
    aim: { x: 0, y: 0, held: false },
  };

  /** Çubuğun konumunu yazar ve basılı sayar. Sonlu olmayan eksen 0 okunur. */
  set(stick: VirtualStick, x: number, y: number): void {
    if (this.#suppressed.has(stick)) return;
    const value = this.#sticks[stick];
    value.x = Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
    value.y = Number.isFinite(y) ? Math.max(-1, Math.min(1, y)) : 0;
    value.held = true;
  }

  release(stick: VirtualStick): void {
    this.#suppressed.delete(stick);
    const value = this.#sticks[stick];
    value.x = 0;
    value.y = 0;
    value.held = false;
  }

  /** İkisini de bırakır (duraklatma, arka plana geçiş). */
  clear(): void {
    for (const value of Object.values(this.#sticks)) {
      value.x = 0;
      value.y = 0;
      value.held = false;
    }
  }

  /** Geçişten önce tutulan çubuk yeni parmak hareketiyle yeniden açılmaz. */
  suppressUntilRelease(stick: VirtualStick): void {
    if (this.isHeld(stick)) this.#suppressed.add(stick);
  }

  isHeld(stick: VirtualStick): boolean {
    return this.#sticks[stick].held;
  }

  /** Herhangi bir çubuk tutuluyor mu — sağlayıcının etkinliği için. */
  get hasInput(): boolean {
    return this.#sticks.move.held || this.#sticks.aim.held;
  }

  /** Çubuk değerini `out`a yazar (ayırmasız); tutulmuyorsa sıfır. */
  write(stick: VirtualStick, out: Vector2): Vector2 {
    const value = this.#sticks[stick];
    out.x = value.x;
    out.y = value.y;
    return out;
  }
}
