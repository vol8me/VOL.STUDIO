/** Gölge çokgeninin köşe sayısı sınırı: en çok üç eklemli (kalça, diz, ayak) bir uzuv. */
const MAX_JOINTS = 3;
/** Dar açıda sivri uç oluşmasın diye köşe genişliğinin üst sınırı (yarı genişliğin katı). */
const MITRE_LIMIT = 1.8;

/** Bir uzvun gölge çokgeni: sol kenar eklemden uca, sağ kenar uçtan eklemeye; düz `[x0, y0, x1, y1, …]`. */
export interface LimbOutline {
  readonly points: number[];
  count: number;
}

/** Kemik normalleri için ayrılmış çalışma tamponları: çağrı başına ayırma yapılmaz. */
const NORMAL_X = new Array<number>(MAX_JOINTS - 1).fill(0);
const NORMAL_Y = new Array<number>(MAX_JOINTS - 1).fill(0);

export function createLimbOutline(): LimbOutline {
  return { points: new Array<number>(MAX_JOINTS * 4).fill(0), count: 0 };
}

/**
 * Yere düşen uzuv gölgesini TEK kapalı çokgen olarak kurar: eklemler arasında kemik kalınlığında bir
 * şerit, eklem köşelerinde dirsek birleşimiyle. Tek çokgen olduğu için yarı saydam dolgu eklemde iki kez
 * çizilip koyulaşmaz; çizgi gölgesinin aksine gölge kemiğin gerçek eni kadardır.
 *
 * @param xs,ys eklemlerin gölge uzayındaki konumu (kalçadan uca).
 * @param widths her eklemdeki tam kalınlık (dünya birimi).
 * @param joints kullanılan eklem sayısı (2 ya da 3).
 */
export function limbOutline(
  xs: readonly number[],
  ys: readonly number[],
  widths: readonly number[],
  joints: number,
  out: LimbOutline,
): LimbOutline {
  const n = Math.min(joints, MAX_JOINTS);
  // Kemik doğrultuları ve birim normalleri.
  const nx = NORMAL_X;
  const ny = NORMAL_Y;
  for (let i = 0; i < n - 1; i++) {
    const dx = xs[i + 1] - xs[i];
    const dy = ys[i + 1] - ys[i];
    const length = Math.hypot(dx, dy);
    if (length < 1e-6) {
      nx[i] = i > 0 ? nx[i - 1] : 0;
      ny[i] = i > 0 ? ny[i - 1] : 1;
    } else {
      nx[i] = -dy / length;
      ny[i] = dx / length;
    }
  }
  out.count = n * 2;
  for (let i = 0; i < n; i++) {
    let px = nx[Math.min(i, n - 2)];
    let py = ny[Math.min(i, n - 2)];
    let scale = 1;
    if (i > 0 && i < n - 1) {
      // Ara eklemde iki kemiğin normali ortalanır ve açı daraldıkça genişlik büyür (sınırlı).
      const mx = nx[i - 1] + nx[i];
      const my = ny[i - 1] + ny[i];
      const length = Math.hypot(mx, my);
      if (length > 1e-6) {
        px = mx / length;
        py = my / length;
        const cos = px * nx[i] + py * ny[i];
        scale = Math.min(MITRE_LIMIT, 1 / Math.max(cos, 1e-3));
      }
    }
    const half = (widths[i] / 2) * scale;
    out.points[i * 2] = xs[i] + px * half;
    out.points[i * 2 + 1] = ys[i] + py * half;
    const back = (n * 2 - 1 - i) * 2;
    out.points[back] = xs[i] - px * half;
    out.points[back + 1] = ys[i] - py * half;
  }
  return out;
}
