import type { MusicContext, MusicState, Stem, StemGainMap } from './types';

/** İki `IntensityGainPoint` arasında linear interpolasyon yapar. */
function interpolateGain(points: { threshold: number; gain: number }[], value: number): number {
  if (points.length === 0) return 0;
  if (value <= points[0].threshold) return points[0].gain;
  if (value >= points[points.length - 1].threshold) return points[points.length - 1].gain;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (value >= a.threshold && value <= b.threshold) {
      const t =
        b.threshold === a.threshold ? 0 : (value - a.threshold) / (b.threshold - a.threshold);
      return a.gain + t * (b.gain - a.gain);
    }
  }
  return points[points.length - 1].gain;
}

/** Bir gain map'ten ilgili state değerine göre gain değeri döner. */
function resolveGainMap(map: StemGainMap, state: MusicState, key: string): number | undefined {
  const entry = map[key];
  if (!entry) return undefined;

  const value = state[key];
  if (value === undefined) return undefined;

  if (Array.isArray(entry)) {
    const sorted = entry.slice().sort((a, b) => a.threshold - b.threshold);
    const numericValue = typeof value === 'number' ? value : Number(value);
    return interpolateGain(sorted, Number.isNaN(numericValue) ? 0 : numericValue);
  }

  if (typeof entry === 'object') {
    const exact = entry[String(value)];
    if (exact !== undefined) return exact;
    // Sayısal değerler için string key'e de bak
    if (typeof value === 'number' && entry[String(value)] !== undefined) {
      return entry[String(value)];
    }
    // String state için numeric string key match
    if (typeof value === 'string' && !Number.isNaN(Number(value))) {
      const numeric = entry[String(Number(value))];
      if (numeric !== undefined) return numeric;
    }
  }

  return undefined;
}

/** Stem'in hedef gain'ini state ve context'e göre hesaplar. */
export function resolveStemGain(stem: Stem, state: MusicState, ctx: MusicContext): number {
  const baseGain = stem.gain ?? 1;

  if (stem.gainFn) {
    return Math.max(0, Math.min(1, stem.gainFn(state, ctx) * baseGain));
  }

  if (stem.gainMap) {
    let factor = 1;
    for (const key of Object.keys(stem.gainMap)) {
      const gain = resolveGainMap(stem.gainMap, state, key);
      if (gain !== undefined) {
        factor *= gain;
      }
    }
    return Math.max(0, Math.min(1, baseGain * factor));
  }

  return baseGain;
}
