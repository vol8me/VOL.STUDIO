import { describe, expect, it } from 'vitest';
import { synthesize } from '../src/engine/synthesize';
import { cello, doubleBass, viola, violin } from '../src/presets/bowed';
import type { SynthParams } from '../src/types';

function toneEnergy(samples: Float32Array, sampleRate: number, frequency: number): number {
  const omega = (2 * Math.PI * frequency) / sampleRate;
  const coeff = 2 * Math.cos(omega);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const s0 = samples[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2)) / samples.length;
}

function render(params: SynthParams): { samples: Float32Array; sampleRate: number } {
  const result = synthesize(params);
  return { samples: result.channels[0], sampleRate: result.sampleRate };
}

function peak(samples: Float32Array): number {
  let p = 0;
  for (const s of samples) p = Math.max(p, Math.abs(s));
  return p;
}

function rmsVariance(
  samples: Float32Array,
  sampleRate: number,
  windowSec: number,
  from: number,
  to: number,
): number {
  const windowSize = Math.floor(sampleRate * windowSec);
  const values: number[] = [];
  for (
    let start = Math.floor(from * sampleRate);
    start + windowSize < to * sampleRate;
    start += windowSize
  ) {
    let sum = 0;
    for (let i = start; i < start + windowSize; i++) sum += samples[i] * samples[i];
    values.push(Math.sqrt(sum / windowSize));
  }
  if (values.length < 4) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
}

describe('bowed presetleri', () => {
  it('violin temel tonu seçili üst kısmi tondan güçlüdür', () => {
    const params = violin(440, 2.0);
    const h = params.harmonics!;
    expect(h.length).toBeGreaterThan(5);

    const { samples, sampleRate } = render({ ...params, gain: 0.3, normalize: false });
    const fundamental = 440 * h[0].ratio;
    const highPartial = 440 * h[7].ratio;

    const eFund = toneEnergy(samples, sampleRate, fundamental);
    const eHigh = toneEnergy(samples, sampleRate, highPartial);
    expect(eFund).toBeGreaterThan(eHigh * 1.5);
  });

  it('viyola daha düşük frekans karakteri taşır ve viyolonselden tizdir', () => {
    const v = render({ ...viola(220, 1.5), gain: 0.3, normalize: false });
    const cl = render({ ...cello(130.8, 1.5), gain: 0.3, normalize: false });

    const vaHigh = 220 * 8; // sınama frekansı, lowpass etkisini ölçer
    const eViola = toneEnergy(v.samples, v.sampleRate, vaHigh);
    const eCello = toneEnergy(cl.samples, cl.sampleRate, vaHigh);

    expect(eViola).toBeGreaterThan(eCello);
  });

  it('cello kemanla kıyasla daha düşük lowpass kesime sahiptir', () => {
    const v = violin(440, 1.0);
    const c = cello(130.8, 1.0);
    expect(c.lowpass!.cutoff).toBeLessThan(v.lowpass!.cutoff);
  });

  it('presets normalize öncesi kırpmaz', () => {
    for (const fn of [violin, viola, cello, doubleBass]) {
      const { samples } = render({ ...fn(330, 1.0), gain: 0.3, normalize: false });
      expect(peak(samples)).toBeLessThanOrEqual(1.0);
    }
  });

  it('presets deterministiktir', () => {
    for (const fn of [violin, viola, cello, doubleBass]) {
      const a = render(fn(330, 0.8));
      const b = render(fn(330, 0.8));
      expect(a.samples).toEqual(b.samples);
    }
  });

  it('yaylı karakter vibrato ile zamanla frekans salınımı yaratır', () => {
    const withVibrato = { ...violin(440, 1.5), gain: 0.3, normalize: false };
    const noVibrato = { ...withVibrato, vibratoDepth: 0 };

    const { samples: withSamples, sampleRate } = render(withVibrato);
    const { samples: noSamples } = render(noVibrato);

    const vWith = rmsVariance(withSamples, sampleRate, 0.05, 0.3, 1.2);
    const vNo = rmsVariance(noSamples, sampleRate, 0.05, 0.3, 1.2);

    expect(vWith).toBeGreaterThan(vNo * 1.2);
  });
});
