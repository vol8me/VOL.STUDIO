import type { CurveEntry } from './registry';

/** `[saniye, değer]` — değer bağlanan parametrenin biriminde. */
export type GesturePoint = readonly [number, number];

/** Segment `k` (nokta k → k+1) içinde `u ∈ [0, 1]` için değer. */
export type SegmentEvaluator = (k: number, u: number) => number;

const NO_PARAMS = {} as const;
const CURVE_RESOURCE = {
  model: 'O(kare + nokta)',
  workPerFrame: () => 1,
  stateBytes: () => 0,
};
const DETERMINISTIC = { stochastic: false, substreams: [] } as const;

function curve(
  id: string,
  description: string,
  capabilities: readonly string[],
  prepare: (points: readonly GesturePoint[]) => SegmentEvaluator,
  segmentIssue: (a: number, b: number) => string | null = () => null,
): CurveEntry {
  return {
    id,
    kind: 'curve',
    version: 1,
    description,
    capabilities,
    params: NO_PARAMS,
    causal: [],
    determinism: DETERMINISTIC,
    resource: CURVE_RESOURCE,
    prepare,
    segmentIssue,
  };
}

const segmentwise =
  (interpolate: (a: number, b: number, u: number) => number) =>
  (points: readonly GesturePoint[]): SegmentEvaluator =>
  (k, u) =>
    interpolate(points[k][1], points[k + 1][1], u);

export const LINEAR_CURVE = curve(
  'curve.linear',
  'Noktalar arasında doğrusal ara değer. Eğim noktalarda süreksizdir (C0).',
  ['continuous-c0', 'range-preserving'],
  segmentwise((a, b, u) => a + (b - a) * u),
);

export const COSINE_CURVE = curve(
  'curve.cosine',
  'Yükselen-kosinüs ara değer: her noktada eğim sıfırdır (C1), aşım yoktur. Yumuşak ' +
    'başlayıp biten hareket için.',
  ['continuous-c1', 'range-preserving'],
  segmentwise((a, b, u) => a + ((b - a) * (1 - Math.cos(Math.PI * u))) / 2),
);

export const EXPONENTIAL_CURVE = curve(
  'curve.exponential',
  'Geometrik ara değer a·(b/a)^u: frekansta eşit sürede eşit aralık (oktav/sn) verir. İki ' +
    'uç aynı işaretli ve sıfırdan farklı olmalı.',
  ['continuous-c0', 'range-preserving', 'log-domain'],
  segmentwise((a, b, u) => a * Math.pow(b / a, u)),
  (a, b) =>
    a * b > 0 ? null : 'exponential eğri için iki uç aynı işaretli ve sıfırdan farklı olmalı',
);

/**
 * PCHIP (Fritsch–Carlson/Butland): parça-parça kübik Hermite, teğetler
 * monotonluğu koruyacak biçimde seçilir. Üç ve daha fazla noktadan C1 geçer
 * ve segment uçlarının dışına TAŞMAZ — Catmull-Rom'un aşımı parametre
 * aralığını delebilirdi; bu yüzden aralık denetimi noktalarda yeterlidir.
 */
function pchipTangents(points: readonly GesturePoint[]): Float64Array {
  const n = points.length;
  const h = new Float64Array(Math.max(0, n - 1));
  const d = new Float64Array(Math.max(0, n - 1));
  for (let k = 0; k < n - 1; k++) {
    h[k] = points[k + 1][0] - points[k][0];
    d[k] = h[k] > 0 ? (points[k + 1][1] - points[k][1]) / h[k] : 0;
  }
  const m = new Float64Array(n);
  if (n < 3) {
    if (n === 2) m[0] = m[1] = d[0];
    return m;
  }
  for (let k = 1; k < n - 1; k++) {
    if (d[k - 1] * d[k] <= 0 || h[k - 1] === 0 || h[k] === 0) continue;
    const w1 = 2 * h[k] + h[k - 1];
    const w2 = h[k] + 2 * h[k - 1];
    m[k] = (w1 + w2) / (w1 / d[k - 1] + w2 / d[k]);
  }
  const end = (h0: number, h1: number, d0: number, d1: number): number => {
    if (h0 === 0) return 0;
    const t = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
    if (Math.sign(t) !== Math.sign(d0)) return 0;
    return Math.sign(d0) !== Math.sign(d1) && Math.abs(t) > 3 * Math.abs(d0) ? 3 * d0 : t;
  };
  m[0] = end(h[0], h[1], d[0], d[1]);
  m[n - 1] = end(h[n - 2], h[n - 3], d[n - 2], d[n - 3]);
  return m;
}

export const SPLINE_CURVE = curve(
  'curve.spline',
  'Monoton kübik Hermite (PCHIP): üç ve daha çok noktadan C1 geçer, noktalar arasında ' +
    'aşım yapmaz. Çok noktalı doğal perde/basınç kontürleri için.',
  ['continuous-c1', 'range-preserving', 'multi-point'],
  (points) => {
    const m = pchipTangents(points);
    return (k, u) => {
      const [t0, v0] = points[k];
      const [t1, v1] = points[k + 1];
      const h = t1 - t0;
      const u2 = u * u;
      const u3 = u2 * u;
      return (
        (2 * u3 - 3 * u2 + 1) * v0 +
        (u3 - 2 * u2 + u) * h * m[k] +
        (-2 * u3 + 3 * u2) * v1 +
        (u3 - u2) * h * m[k + 1]
      );
    };
  },
);

export const CURVES: readonly CurveEntry[] = [
  LINEAR_CURVE,
  COSINE_CURVE,
  EXPONENTIAL_CURVE,
  SPLINE_CURVE,
];

/**
 * Bir gesture'ı örnek başına tampona yazar. Sınır semantiği: ilk noktadan
 * önce ilk değer, son noktadan sonra son değer TUTULUR; eşit zamanlı iki
 * nokta anlık basamaktır (o andan itibaren ikinci değer geçerlidir).
 * Zaman `i / sampleRate` ile örnek-doğru hesaplanır; birikimli toplam
 * kullanılmaz (uzun tamponda kayma olmaz). Döngü örnek başına ayırma yapmaz.
 */
export function renderGesture(
  points: readonly GesturePoint[],
  entry: CurveEntry,
  out: Float32Array,
  sampleRate: number,
): void {
  const at = entry.prepare(points);
  const last = points.length - 1;
  let k = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate;
    while (k < last && t >= points[k + 1][0]) k++;
    if (k === last || t < points[0][0]) {
      out[i] = t < points[0][0] ? points[0][1] : points[last][1];
      continue;
    }
    out[i] = at(k, (t - points[k][0]) / (points[k + 1][0] - points[k][0]));
  }
}
