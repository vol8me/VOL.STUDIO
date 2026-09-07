import { describe, expect, it } from 'vitest';
import { synthesize } from '../src/engine';
import { trumpet, trombone, frenchHorn, tuba } from '../src/presets/brass';
import { BRASS_CATALOG } from '../src/presets/catalog/brass';
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

function highPartialEnergy(
  samples: Float32Array,
  sampleRate: number,
  f0: number,
  fromN: number,
  toN: number,
): number {
  let sum = 0;
  for (let n = fromN; n <= toN; n++) {
    sum += toneEnergy(samples, sampleRate, f0 * n);
  }
  return sum;
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

describe('brass presetleri — kısmi ton yapısı', () => {
  it('trompet aynı perdede tubadan daha fazla üst ton enerjisi taşır', () => {
    const f0 = 220;
    const { samples: tSamples, sampleRate: tRate } = render({
      ...trumpet(f0, 1.0),
      normalize: false,
    });
    const { samples: bSamples, sampleRate: bRate } = render({
      ...tuba(f0, 1.0),
      normalize: false,
    });

    const tHigh = highPartialEnergy(tSamples, tRate, f0, 4, 6);
    const bHigh = highPartialEnergy(bSamples, bRate, f0, 4, 6);

    expect(tHigh).toBeGreaterThan(bHigh * 2);
  });

  it('presetler normalize öncesi kırpma yapmaz', () => {
    for (const fn of [trumpet, trombone, frenchHorn, tuba]) {
      const { samples } = render({ ...fn(220, 1.0), normalize: false });
      expect(peak(samples), `${fn.name} kırpıyor`).toBeLessThanOrEqual(1.0);
    }
  });

  it('presetler deterministiktir', () => {
    const a = render(trumpet(330, 0.8)).samples;
    const b = render(trumpet(330, 0.8)).samples;
    expect(a).toEqual(b);

    const c = render(tuba(110, 1.0)).samples;
    const d = render(tuba(110, 1.0)).samples;
    expect(c).toEqual(d);
  });
});

describe('brass kataloğu', () => {
  it('BRASS_CATALOG dört preset içerir', () => {
    expect(Object.keys(BRASS_CATALOG).sort()).toEqual([
      'frenchHorn',
      'trombone',
      'trumpet',
      'tuba',
    ]);
  });

  it('her brass preset katalogda ve çağrılabilir', () => {
    for (const name of ['trumpet', 'trombone', 'frenchHorn', 'tuba']) {
      expect(BRASS_CATALOG[name]).toBeDefined();
      expect(
        typeof (
          {
            trumpet,
            trombone,
            frenchHorn,
            tuba,
          } as Record<string, unknown>
        )[name],
      ).toBe('function');
    }
  });
});
