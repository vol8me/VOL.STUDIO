/**
 * Simülasyonun tek adımda okuduğu oyuncu niyeti. Girdi cihazından bağımsızdır:
 * klavye, kol ve dokunmatik aynı kayda çevrilir.
 */
export interface TankCommand {
  /** Ekran eksenlerinde hareket yönü; uzunluk [0, 1]. */
  moveX: number;
  moveY: number;
  /** Nişan yönü; uzunluk 0 (nişan yok) ya da 1. */
  aimX: number;
  aimY: number;
  fire: boolean;
  boost: boolean;
  /** Paletleri kilitler: tank kinetik sürtünmeyle kayarak durur. */
  brake: boolean;
}

export function idleCommand(): TankCommand {
  return { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, boost: false, brake: false };
}
