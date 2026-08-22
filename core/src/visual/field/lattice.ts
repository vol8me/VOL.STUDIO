/**
 * Gürültü kafesi ve döşeme sarması — §5.2.
 *
 * `freq` KISA KENAR boyunca hücre sayısıdır. İki kip vardır:
 *
 * - **Serbest.** `u = x · freq / 2`. İzotropiktir; hücreler her iki eksende
 *   aynı boyuttadır ve sınır yoktur.
 * - **Döşenebilir.** Görüntü TAM SAYIDA hücre kaplamalıdır, yoksa karşı
 *   kenarlar tutmaz. Eksen başına periyot `round(freq · uzunluk / kısa kenar)`
 *   olarak hesaplanır ve hücre indeksleri o periyoda göre sarılır.
 *
 * Dikdörtgen bir çıktıda iki periyodun ikisi birden tam sayı olmak zorunda
 * olduğu için hücre en-boy oranı yuvarlama kadar sapabilir. Sapma yarım
 * hücreyi geçmez ve alternatifi (döşemenin tutmaması) çok daha kötüdür.
 */

import type { UnitSpace } from './space';

export interface Lattice {
  /** Birim x → kafes koordinatı. */
  u(x: number): number;
  /** Birim y → kafes koordinatı. */
  v(y: number): number;
  /** Hücre indeksini periyoda sarar; serbest kipte kimliktir. */
  wrapX(ix: number): number;
  wrapY(iy: number): number;
  /** Eksen başına hücre sayısı; serbest kipte 0 (periyot yok). */
  readonly periodX: number;
  readonly periodY: number;
}

function wrapIndex(index: number, period: number): number {
  const value = index % period;
  return value < 0 ? value + period : value;
}

export function createLattice(space: UnitSpace, freq: number, tileable: boolean): Lattice {
  if (!tileable) {
    const scale = freq / 2;
    return {
      u: (x) => x * scale,
      v: (y) => y * scale,
      wrapX: (ix) => ix,
      wrapY: (iy) => iy,
      periodX: 0,
      periodY: 0,
    };
  }

  const halfX = space.width / space.short;
  const halfY = space.height / space.short;
  const periodX = Math.max(1, Math.round(freq * halfX));
  const periodY = Math.max(1, Math.round(freq * halfY));

  return {
    u: (x) => ((x + halfX) / (2 * halfX)) * periodX,
    v: (y) => ((y + halfY) / (2 * halfY)) * periodY,
    wrapX: (ix) => wrapIndex(ix, periodX),
    wrapY: (iy) => wrapIndex(iy, periodY),
    periodX,
    periodY,
  };
}
