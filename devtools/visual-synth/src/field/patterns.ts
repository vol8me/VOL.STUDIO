/**
 * Desenler — §4.1'in desen ailesi.
 *
 * **Bunlar D9'un BİLİNÇLİ ve SINIRLI bir istisnasıdır.** `stripes`, `dots` ve
 * `grid` `repeat` + bir SDF + eşik bileşimiyle ifade edilebilir, yani
 * doktrine göre primitif sayılmazlar. Yine de tutuluyorlar çünkü çok sık
 * gereken bir şeyi dört düğümlük bir bileşime çevirmek belgeyi okunmaz yapar
 * ve agent'ın yazma maliyetini gereksiz artırır. İstisna DESENLERLE sınırlı
 * ve burada yazılı; kural gevşetilmiş değil, bir kez ve gerekçesiyle
 * delinmiştir.
 *
 * `checker` ve `hex` gerçekten türetilemez: birincisi katlamadan elde
 * edilemeyen bir PARİTE taşır, ikincisi dikdörtgen olmayan bir kafestir.
 *
 * Hepsi 0..1 kapsama döndürür ve kenarları KESKİNDİR; yumuşatma isteyen
 * `blur` ya da SDF tabanlı bir bileşim kullanır.
 */

import { clamp01 } from '@volstudio/core/math/interpolation';
import type { FieldFn } from './fn';

function frac(value: number): number {
  return value - Math.floor(value);
}

/** Dama deseni; `size` bir karenin birim uzaydaki kenarı. */
export function checkerPatternField(size: number): FieldFn {
  return (x, y) => (((Math.floor(x / size) + Math.floor(y / size)) & 1) === 0 ? 1 : 0);
}

/** Çizgiler; `duty` dolu kısmın periyoda oranı. */
export function stripesPatternField(freq: number, angleRad: number, duty: number): FieldFn {
  const dx = Math.cos(angleRad);
  const dy = Math.sin(angleRad);
  const scale = freq / 2;
  return (x, y) => (frac((x * dx + y * dy) * scale) < duty ? 1 : 0);
}

/** Noktalar; `r` nokta yarıçapının hücre YARI genişliğine oranı. */
export function dotsPatternField(freq: number, r: number): FieldFn {
  const scale = freq / 2;
  return (x, y) => {
    const lx = frac(x * scale) - 0.5;
    const ly = frac(y * scale) - 0.5;
    return Math.hypot(lx, ly) * 2 <= r ? 1 : 0;
  };
}

/** Izgara çizgileri; `thickness` çizginin hücre genişliğine oranı. */
export function gridPatternField(freq: number, thickness: number): FieldFn {
  const scale = freq / 2;
  const edge = 1 - thickness;
  return (x, y) => {
    const lx = Math.abs(frac(x * scale) - 0.5) * 2;
    const ly = Math.abs(frac(y * scale) - 0.5) * 2;
    return lx >= edge || ly >= edge ? 1 : 0;
  };
}

/** Altıgen kafesin dikey adımı — `sqrt(3)`. */
const HEX_ROW = Math.sqrt(3);

/**
 * Altıgen döşeme: hücre merkezinde 1, kenarında 0.
 *
 * Altıgen kafes, biri diğerine göre yarım adım kaymış İKİ dikdörtgen
 * kafesin birleşimidir; her nokta hangi merkeze yakınsa ona bağlanır.
 * `repeat` dikdörtgen olduğu için bu kafes ondan türetilemez.
 */
export function hexPatternField(freq: number): FieldFn {
  const scale = freq / 2;

  return (px, py) => {
    const x = px * scale;
    const y = (py * scale) / HEX_ROW;

    const ax = frac(x) - 0.5;
    const ay = (frac(y) - 0.5) * HEX_ROW;
    const bx = frac(x + 0.5) - 0.5;
    const by = (frac(y + 0.5) - 0.5) * HEX_ROW;

    const useA = ax * ax + ay * ay < bx * bx + by * by;
    const lx = Math.abs(useA ? ax : bx);
    const ly = Math.abs(useA ? ay : by);

    // Altıgen norm: düz kenarlara olan uzaklık (0 = merkez, 0.5 = kenar).
    const norm = Math.max(lx, lx * 0.5 + ly * (HEX_ROW / 2));
    return clamp01(1 - norm * 2);
  };
}
