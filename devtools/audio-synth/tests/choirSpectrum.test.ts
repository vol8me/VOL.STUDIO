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

describe('koro presetleri', () => {
  it('soprano temel tonu üst kısmi tondan güçlü', () => {
    const { samples, sampleRate } = render(Presets.soprano(440, 1.2));
    const f0 = toneEnergy(samples, sampleRate, 440);
    const f4 = toneEnergy(samples, sampleRate, 440 * 4);
    expect(f0).toBeGreaterThan(f4);
  });

  it('mutasyon: soprano lowpass kesimi kapanırsa üst tonlar artar', () => {
    // Taban durumda lowpass 1000 Hz'e kısıtlanır, sonra açılır.
    // Böylece 5. kısmi ton üzerindeki etki kontrollü ve ölçülebilir.
    const baseParams = Presets.soprano(440, 1.0);
    const closed: SynthParams = {
      ...baseParams,
      lowpass: { ...baseParams.lowpass!, cutoff: 1000, resonance: 0.05, poles: 2, type: 'lowpass' },
    };
    const open: SynthParams = {
      ...baseParams,
      lowpass: {
        ...baseParams.lowpass!,
        cutoff: 20000,
        resonance: 0.05,
        poles: 2,
        type: 'lowpass',
      },
    };
    const partial = 440 * 5;
    const eClosed = toneEnergy(render(closed).samples, render(closed).sampleRate, partial);
    const eOpen = toneEnergy(render(open).samples, render(open).sampleRate, partial);
    expect(eOpen).toBeGreaterThan(eClosed * 1.5);
  });

  it('bassChoir soprano’dan daha az üst ton taşır', () => {
    const { samples: bass, sampleRate } = render(Presets.bassChoir(130.8, 1.2));
    const { samples: sop } = render(Presets.soprano(440, 1.2));
    // Aynı mutlak frekansta (≈2 kHz) karşılaştır: soprano'da bu aralık
    // zengin harmoniklere, bassChoir'de ise daha az kısmi tona denk gelir.
    const testFreq = 2000;
    const eBass = toneEnergy(bass, sampleRate, testFreq);
    const eSop = toneEnergy(sop, sampleRate, testFreq);
    expect(eBass).toBeLessThan(eSop);
  });

  it('koro presetleri normalize öncesi clip yapmaz', () => {
    for (const name of ['soprano', 'alto', 'tenor', 'bassChoir']) {
      const fn = Presets[name as keyof typeof Presets] as (f?: number, d?: number) => SynthParams;
      const { samples } = render(fn(330, 1.0));
      expect(peak(samples)).toBeLessThanOrEqual(1.0);
    }
  });

  it('koro presetleri deterministiktir', () => {
    const a = render(Presets.soprano(440, 0.8));
    const b = render(Presets.soprano(440, 0.8));
    expect(a.samples).toEqual(b.samples);
  });
});
