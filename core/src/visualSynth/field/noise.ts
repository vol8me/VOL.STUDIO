/**
 * Gürültü üreteçleri — §4.1'in gürültü ailesi.
 *
 * Üçü de birim aralıkta (0..1) değer döndürür ve KONUMUN fonksiyonudur
 * (bkz. `hash.ts`). Oktav toplama burada değil `fbm`dedir: aynı işi iki
 * yerde yapmak D9'un yasakladığı türetilebilir primitiftir.
 */

import { clamp01 } from '../../math/interpolation';
import { gradient2, hash2, hash2b } from './hash';
import type { Lattice } from './lattice';
import { quintic, type FieldFn } from './fn';

/** Değer gürültüsü: kafes köşelerinden çift doğrusal, beşinci derece yumuşatmayla. */
export function valueNoiseField(lattice: Lattice, seed: number): FieldFn {
  return (x, y) => {
    const u = lattice.u(x);
    const v = lattice.v(y);
    const ix = Math.floor(u);
    const iy = Math.floor(v);
    const wx = quintic(u - ix);
    const wy = quintic(v - iy);

    const x0 = lattice.wrapX(ix);
    const x1 = lattice.wrapX(ix + 1);
    const y0 = lattice.wrapY(iy);
    const y1 = lattice.wrapY(iy + 1);

    const n00 = hash2(x0, y0, seed);
    const n10 = hash2(x1, y0, seed);
    const n01 = hash2(x0, y1, seed);
    const n11 = hash2(x1, y1, seed);

    const top = n00 + (n10 - n00) * wx;
    const bottom = n01 + (n11 - n01) * wx;
    return top + (bottom - top) * wy;
  };
}

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
/** Üç köşe katkısının toplamını yaklaşık [-1, 1]'e taşıyan standart ölçek. */
const SIMPLEX_SCALE = 70;

/**
 * Simplex gürültü.
 *
 * Değer gürültüsünün kare kafesi yatay/dikey hizalanmış yapaylık üretir;
 * simplex eşkenar üçgen kafes kullandığı için bu yönelim dağılır. Bedeli:
 * kafes EĞİKTİR, dolayısıyla ızgara sarma uygulanamaz ve döşenebilir belgede
 * kullanılamaz (§5.2). Doğrulayıcı bunu sınırda reddeder.
 */
export function simplexNoiseField(freq: number, seed: number): FieldFn {
  const scale = freq / 2;

  const corner = (dx: number, dy: number, gx: number, gy: number): number => {
    const t = 0.5 - dx * dx - dy * dy;
    if (t <= 0) return 0;
    const [ux, uy] = gradient2(gx, gy, seed);
    const t2 = t * t;
    return t2 * t2 * (ux * dx + uy * dy);
  };

  return (px, py) => {
    const x = px * scale;
    const y = py * scale;

    // Kare kafese eğ (skew), hücreyi bul, geri düzelt (unskew).
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t);
    const y0 = y - (j - t);

    // Hücre iki üçgene bölünür; hangisindeyiz?
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;

    const total =
      corner(x0, y0, i, j) +
      corner(x0 - i1 + G2, y0 - j1 + G2, i + i1, j + j1) +
      corner(x0 - 1 + 2 * G2, y0 - 1 + 2 * G2, i + 1, j + 1);

    return clamp01(0.5 + 0.5 * SIMPLEX_SCALE * total);
  };
}

export type WorleyMode = 'F1' | 'F2' | 'F2-F1';

/**
 * Hücresel (Worley) gürültü.
 *
 * Her hücrede tohumdan türetilmiş bir öznitelik noktası vardır; değer o
 * noktalara olan uzaklıktan gelir. `F2-F1` hücre KENARLARINI verir — hücre
 * içinde sıfıra yakın, sınırlarda yüksek.
 */
export function worleyNoiseField(lattice: Lattice, mode: WorleyMode, seed: number): FieldFn {
  return (x, y) => {
    const u = lattice.u(x);
    const v = lattice.v(y);
    const cx = Math.floor(u);
    const cy = Math.floor(v);

    let first = Infinity;
    let second = Infinity;

    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const gx = cx + ox;
        const gy = cy + oy;
        // Karma SARILMIŞ indeksten okunur (döşeme), konum ise sarılmamış
        // hücreden gelir — yoksa komşuluk kenarda kopardı.
        const wx = lattice.wrapX(gx);
        const wy = lattice.wrapY(gy);
        const fx = gx + hash2(wx, wy, seed);
        const fy = gy + hash2b(wx, wy, seed);
        const distance = Math.hypot(fx - u, fy - v);

        if (distance < first) {
          second = first;
          first = distance;
        } else if (distance < second) {
          second = distance;
        }
      }
    }

    if (mode === 'F1') return clamp01(first);
    if (mode === 'F2') return clamp01(second);
    return clamp01(second - first);
  };
}

/** Oktavlar arası sabit döndürme açısı (§5.1). */
const OCTAVE_ROTATION = 0.5;

/**
 * Kesirli Brown hareketi — oktav toplayıcı sarmalayıcı.
 *
 * **Oktavlar arasında DÖNDÜRME uygulanır (§5.1).** Naif fbm yalnızca
 * ölçekler ve oktavlar üst üste binince eksen hizalı yapaylık göze çarpar.
 * Maliyeti oktav başına bir 2×2 çarpım.
 *
 * `rotate: false` yalnızca döşenebilir belgelerde kullanılır: döndürme
 * periyodikliği bozar, dolayısıyla döşeme ile §5.1 aynı anda elde edilemez.
 * Bu bilinçli bir takastır ve döşemenin lehine çözülmüştür — dikişli bir
 * doku, eksen yapaylığından çok daha görünür bir hatadır.
 */
export function fbmField(
  base: FieldFn,
  octaves: number,
  lacunarity: number,
  gain: number,
  rotate: boolean,
): FieldFn {
  const cos = rotate ? Math.cos(OCTAVE_ROTATION) : 1;
  const sin = rotate ? Math.sin(OCTAVE_ROTATION) : 0;

  return (x, y) => {
    let sum = 0;
    let weight = 0;
    let amplitude = 1;
    let frequency = 1;
    let px = x;
    let py = y;

    for (let octave = 0; octave < octaves; octave++) {
      sum += amplitude * base(px * frequency, py * frequency);
      weight += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
      const rx = px * cos - py * sin;
      py = px * sin + py * cos;
      px = rx;
    }

    return weight > 0 ? sum / weight : 0;
  };
}
