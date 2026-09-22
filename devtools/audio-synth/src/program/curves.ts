import type { CurveEntry } from './registry';

/** `[saniye, değer]` — değer bağlanan parametrenin biriminde. */
export type GesturePoint = readonly [number, number];

const NO_PARAMS = {} as const;
const CURVE_RESOURCE = {
  model: 'O(kare + nokta)',
  workPerFrame: () => 1,
  stateBytes: () => 0,
};
const DETERMINISTIC = { stochastic: false, substreams: [] } as const;

function segmentCurve(
  id: string,
  description: string,
  interpolate: (a: number, b: number, u: number) => number,
  capabilities: readonly string[],
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
    interpolate,
    segmentIssue,
  };
}

export const LINEAR_CURVE = segmentCurve(
  'curve.linear',
  'Noktalar arasında doğrusal ara değer. Eğim noktalarda süreksizdir (C0).',
  (a, b, u) => a + (b - a) * u,
  ['continuous-c0', 'range-preserving'],
);

export const WAVE1_CURVES: readonly CurveEntry[] = [LINEAR_CURVE];

/**
 * Bir gesture'ı örnek başına tampona yazar. Sınır semantiği: ilk noktadan
 * önce ilk değer, son noktadan sonra son değer TUTULUR; eşit zamanlı iki
 * nokta anlık basamaktır (o andan itibaren ikinci değer geçerlidir).
 * Zaman `i / sampleRate` ile örnek-doğru hesaplanır; birikimli toplam
 * kullanılmaz (uzun tamponda kayma olmaz).
 */
export function renderGesture(
  points: readonly GesturePoint[],
  curve: CurveEntry,
  out: Float32Array,
  sampleRate: number,
): void {
  const last = points.length - 1;
  let k = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate;
    while (k < last && t >= points[k + 1][0]) k++;
    if (k === last || t < points[0][0]) {
      out[i] = t < points[0][0] ? points[0][1] : points[last][1];
      continue;
    }
    const [t0, v0] = points[k];
    const [t1, v1] = points[k + 1];
    out[i] = curve.interpolate(v0, v1, (t - t0) / (t1 - t0));
  }
}
