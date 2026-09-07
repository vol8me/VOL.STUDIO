import { describe, expect, it } from 'vitest';
import { bowedString } from '../src/instruments/strings/bowed';

function allFinite(channels: Float32Array[]): boolean {
  return channels.every((ch) => ch.every((s) => Number.isFinite(s)));
}

function rms(samples: Float32Array): number {
  let sum = 0;
  for (const s of samples) sum += s * s;
  return Math.sqrt(sum / samples.length);
}

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

describe('bowedString (yaylı tel fiziksel modeli)', () => {
  it('aynı parametrelerle deterministik ve sonlu çıktı üretir', () => {
    const a = bowedString({ frequency: 220, duration: 0.5, seed: 42 });
    const b = bowedString({ frequency: 220, duration: 0.5, seed: 42 });
    expect(a.channels[0]).toEqual(b.channels[0]);
    expect(a.channels[1]).toEqual(b.channels[1]);
    expect(allFinite(a.channels)).toBe(true);
  });

  it('farklı seed farklı faz/gürültü ilişkisi üretir', () => {
    const a = bowedString({ frequency: 220, duration: 0.5, seed: 1 });
    const b = bowedString({ frequency: 220, duration: 0.5, seed: 2 });
    expect(a.channels[0]).not.toEqual(b.channels[0]);
  });

  it('geçersiz frequency/duration/sampleRate çökme veya boş çıktı üretmez', () => {
    const cases = [
      { frequency: NaN },
      { frequency: Infinity },
      { frequency: -100 },
      { frequency: 0 },
      { duration: NaN },
      { duration: Infinity },
      { duration: -1 },
      { sampleRate: 0 },
      { sampleRate: NaN },
      { vibratoDepth: 1000 },
      { inharmonicity: -0.5 },
      { inharmonicity: 0.02 },
      { partials: -5 },
      { bowNoise: 2 },
    ];
    for (const overrides of cases) {
      const result = bowedString({ frequency: 220, duration: 0.2, ...overrides });
      expect(result.channels[0].length).toBeGreaterThan(0);
      expect(allFinite(result.channels)).toBe(true);
    }
  });

  it('yaylı tel sürdürümlüdür: kuyruk RMS baş RMSten en az %30', () => {
    const result = bowedString({ frequency: 220, duration: 2.0 });
    const samples = result.channels[0];
    const window = Math.floor(result.sampleRate * 0.5);
    const head = rms(samples.subarray(0, window));
    const tail = rms(samples.subarray(samples.length - window));
    expect(tail).toBeGreaterThanOrEqual(head * 0.3);
  });

  it('mutasyon: vibratoDepth=0 frekans modülasyon yan bant enerjisini azaltır', () => {
    const base = {
      frequency: 220,
      duration: 2.0,
      inharmonicity: 0,
      vibratoRate: 6,
      vibratoDepth: 4,
      gain: 0.8,
      seed: 7,
    } as const;

    const def = bowedString(base);
    const muted = bowedString({ ...base, vibratoDepth: 0 });
    const sideband = 226; // 220 + vibratoRate

    const eDef = toneEnergy(def.channels[0], def.sampleRate, sideband);
    const eMuted = toneEnergy(muted.channels[0], muted.sampleRate, sideband);

    expect(eDef).toBeGreaterThan(eMuted * 3);
  });
});
