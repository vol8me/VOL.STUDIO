import { Presets } from '../../src/index';
import type { SynthesisResult } from '../../src/types';

/**
 * Enstrüman kataloğu sözleşmesinin paylaşılan verisi.
 *
 * `instrumentContract` ağır test dosyaları ikiye bölündü; ortak yardımcılar
 * bu dosyada tek kaynakta yaşar.
 */
export const INSTRUMENTS = Object.entries(Presets.PRESET_CATALOG)
  .filter(([, meta]) => meta.category === 'instrument')
  .map(([name, meta]) => ({ name, meta }));

export interface Measurement {
  peak: number;
  dc: number;
  nonFinite: number;
  first: number;
  last: number;
}

export function measure(result: SynthesisResult): Measurement {
  const samples = result.channels[0];
  if (!samples || samples.length === 0) throw new Error('kanal yok');
  let peak = 0;
  let sum = 0;
  let nonFinite = 0;
  for (const value of samples) {
    if (!Number.isFinite(value)) {
      nonFinite++;
      continue;
    }
    peak = Math.max(peak, Math.abs(value));
    sum += value;
  }
  return {
    peak,
    dc: Math.abs(sum / samples.length),
    nonFinite,
    first: Math.abs(samples[0]),
    last: Math.abs(samples[samples.length - 1]),
  };
}

export function testPitches(range: [number, number]): number[] {
  const [low, high] = range;
  return [low, Math.sqrt(low * high), high];
}
