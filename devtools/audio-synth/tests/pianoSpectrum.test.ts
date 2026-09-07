import { describe, expect, it } from 'vitest';
import { Presets, synthesize } from '../src/index';
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

function rms(samples: Float32Array): number {
  let sum = 0;
  for (const s of samples) sum += s * s;
  return Math.sqrt(sum / samples.length);
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
    values.push(rms(samples.subarray(start, start + windowSize)));
  }
  if (values.length < 4) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
}

describe('piano presetleri', () => {
  it('grandPiano inharmonik kısmi tonlar tam sayı katı değil', () => {
    const params = Presets.grandPiano(440, 1.0);
    const h = params.harmonics!;
    expect(h.length).toBeGreaterThan(3);
    expect(h[1].ratio).toBeGreaterThan(2.0005);
    expect(h[1].ratio).toBeLessThan(2.005);
  });

  it('mutasyon: grandPiano inharmonik 8. kısmi tonu tam sayı ile değiştirmek onu yok eder', () => {
    const params = { ...Presets.grandPiano(220, 1.0), gain: 0.3, normalize: false };
    const inharmonic8 = 220 * 8 * Math.sqrt(1 + 0.00025 * 64);
    const integer8 = 220 * 8;
    const original = render(params);
    const mutated = render({
      ...params,
      harmonics: [
        { ratio: 1, gain: 1 },
        { ratio: 2, gain: 0.45 },
        { ratio: 3, gain: 0.22 },
      ],
    });
    const eOriginal = toneEnergy(original.samples, original.sampleRate, inharmonic8);
    const eOriginalInt = toneEnergy(original.samples, original.sampleRate, integer8);
    const eMutated = toneEnergy(mutated.samples, mutated.sampleRate, inharmonic8);
    expect(eOriginal).toBeGreaterThan(eOriginalInt * 1.2);
    expect(eOriginal).toBeGreaterThan(eMutated * 2);
  });

  it('grandPiano üst tonlar zamanla solar', () => {
    const { samples, sampleRate } = render(Presets.grandPiano(220, 1.5));
    const partialFreq = 220 * 2 * Math.sqrt(1 + 0.00025 * 4);
    const head = toneEnergy(
      samples.subarray(0, Math.floor(sampleRate * 0.2)),
      sampleRate,
      partialFreq,
    );
    const tail = toneEnergy(
      samples.subarray(Math.floor(sampleRate * 1.0), Math.floor(sampleRate * 1.2)),
      sampleRate,
      partialFreq,
    );
    expect(tail).toBeLessThan(head * 0.6);
  });

  it('mutasyon: preparedPiano lowpass zarfı kapanınca üst ton daha uzun sürer', () => {
    const original = { ...Presets.preparedPiano(220, 0.8), gain: 0.3, normalize: false };
    const mutated = {
      ...original,
      lowpass: { ...original.lowpass!, envelope: undefined, slide: 0, envAmount: 0 },
    };
    const { samples: orig, sampleRate } = render(original);
    const { samples: mut } = render(mutated);
    const partialFreq = 220 * 5 * Math.sqrt(1 + 0.0015 * 25);
    const start = Math.floor(sampleRate * 0.4);
    const end = Math.floor(sampleRate * 0.6);
    const origTail = toneEnergy(orig.subarray(start, end), sampleRate, partialFreq);
    const mutTail = toneEnergy(mut.subarray(start, end), sampleRate, partialFreq);
    expect(mutTail).toBeGreaterThan(origTail * 2);
  });

  it("mutasyon: honkyTonkPiano detune'u kapatınca beating azalır", () => {
    const honky = { ...Presets.honkyTonkPiano(440, 2.0), gain: 0.3, normalize: false };
    const muted = { ...honky, detune: 0 };
    const { samples: honkySamples, sampleRate } = render(honky);
    const { samples: mutedSamples } = render(muted);
    const vHonky = rmsVariance(honkySamples, sampleRate, 0.005, 0.3, 1.3);
    const vMuted = rmsVariance(mutedSamples, sampleRate, 0.005, 0.3, 1.3);
    expect(vHonky).toBeGreaterThan(vMuted * 1.5);
  });

  it('preparedPiano kısa ve az üst tonlu çıktı üretir', () => {
    const prep = { ...Presets.preparedPiano(220, 0.8), gain: 0.3, normalize: false };
    const grand = { ...Presets.grandPiano(220, 0.8), gain: 0.3, normalize: false };
    const prep5 = 220 * 5 * Math.sqrt(1 + 0.0015 * 25);
    const grand5 = 220 * 5 * Math.sqrt(1 + 0.00025 * 25);
    const { samples: prepSamples } = render(prep);
    const { samples: grandSamples, sampleRate } = render(grand);
    const head = Math.floor(sampleRate * 0.15);
    const ePrep = toneEnergy(prepSamples.subarray(0, head), sampleRate, prep5);
    const eGrand = toneEnergy(grandSamples.subarray(0, head), sampleRate, grand5);
    expect(ePrep).toBeLessThan(eGrand * 0.8);
    expect(rms(prepSamples.slice(-1000))).toBeLessThan(0.15);
  });

  it('piano presetleri normalize öncesi clip yapmaz', () => {
    for (const presetName of ['grandPiano', 'uprightPiano', 'honkyTonkPiano', 'preparedPiano']) {
      const fn = Presets[presetName as keyof typeof Presets] as (
        f?: number,
        d?: number,
      ) => SynthParams;
      const { samples } = render(fn(330, 1.0));
      expect(peak(samples)).toBeLessThanOrEqual(1.0);
    }
  });

  it('uprightPiano grandPianodan daha çabuk söner', () => {
    const { samples: up, sampleRate } = render(Presets.uprightPiano(220, 1.2));
    const { samples: gr } = render(Presets.grandPiano(220, 1.2));
    const upTail = rms(up.slice(-Math.floor(sampleRate * 0.1)));
    const grTail = rms(gr.slice(-Math.floor(sampleRate * 0.1)));
    expect(upTail).toBeLessThan(grTail);
  });

  it('piano presetleri deterministiktir', () => {
    const a = render(Presets.grandPiano(440, 0.5));
    const b = render(Presets.grandPiano(440, 0.5));
    expect(a.samples).toEqual(b.samples);
  });
});
