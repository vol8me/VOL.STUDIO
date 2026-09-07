import { describe, expect, it } from 'vitest';
import { synth } from '../src/engine/synthesize';
import { flute, clarinet, oboe, bassoon } from '../src/presets/airColumn';

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

function peak(samples: Float32Array): number {
  let p = 0;
  for (const s of samples) p = Math.max(p, Math.abs(s));
  return p;
}

function highPartialRatio(samples: Float32Array, sampleRate: number, fundamental: number): number {
  let high = 0;
  for (let n = 3; n <= 8; n++) {
    high += toneEnergy(samples, sampleRate, fundamental * n);
  }
  const f0 = toneEnergy(samples, sampleRate, fundamental);
  return f0 > 0 ? high / f0 : 0;
}

describe('airColumn preset spektrumu', () => {
  it('flüt aynı perdede fagottan daha parlaktır (daha fazla üst ton)', () => {
    const fundamental = 440;
    const duration = 1.2;

    const fluteResult = synth(duration, { ...flute(fundamental, duration), normalize: false });
    const bassoonResult = synth(duration, { ...bassoon(fundamental, duration), normalize: false });

    const fluteRatio = highPartialRatio(
      fluteResult.channels[0],
      fluteResult.sampleRate,
      fundamental,
    );
    const bassoonRatio = highPartialRatio(
      bassoonResult.channels[0],
      bassoonResult.sampleRate,
      fundamental,
    );

    expect(fluteRatio).toBeGreaterThan(bassoonRatio * 1.05);
  });

  it('tüm ahşap üflemeli presetler normalize öncesi clip yapmaz', () => {
    for (const preset of [flute, clarinet, oboe, bassoon]) {
      const { duration } = preset(330, 0.8);
      const result = synth(duration, { ...preset(330, 0.8), normalize: false });
      expect(peak(result.channels[0])).toBeLessThanOrEqual(1.0);
    }
  });

  it('ahşap üflemeli presetler deterministiktir', () => {
    for (const preset of [flute, clarinet, oboe, bassoon]) {
      const a = synth(0.6, { ...preset(330, 0.6), normalize: false });
      const b = synth(0.6, { ...preset(330, 0.6), normalize: false });
      expect(a.channels[0]).toEqual(b.channels[0]);
    }
  });

  it('flüt spektrumu açık boru karakterine uyar — çift kat harmonikler vardır', () => {
    const fundamental = 440;
    const duration = 1.0;
    const result = synth(duration, { ...flute(fundamental, duration), normalize: false });
    const samples = result.channels[0];

    const f0 = toneEnergy(samples, result.sampleRate, fundamental);
    const f2 = toneEnergy(samples, result.sampleRate, fundamental * 2);
    const f3 = toneEnergy(samples, result.sampleRate, fundamental * 3);

    expect(f0).toBeGreaterThan(0);
    expect(f2).toBeGreaterThan(f0 * 0.1);
    expect(f3).toBeGreaterThan(f0 * 0.05);
  });

  it('klarnet spektrumu kapalı boru karakterine uyar — tek kat harmonikler baskın', () => {
    const fundamental = 262;
    const duration = 1.0;
    const result = synth(duration, { ...clarinet(fundamental, duration), normalize: false });
    const samples = result.channels[0];

    const f2 = toneEnergy(samples, result.sampleRate, fundamental * 2);
    const f3 = toneEnergy(samples, result.sampleRate, fundamental * 3);
    const f5 = toneEnergy(samples, result.sampleRate, fundamental * 5);

    // İkinci harmonik temelde çok daha zayıftır; tek kat (3. ve 5.) daha güçlüdür.
    expect(f3).toBeGreaterThan(f2);
    expect(f5).toBeGreaterThan(f2);
  });
});
