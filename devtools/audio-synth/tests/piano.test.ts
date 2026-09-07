import { describe, it, expect } from 'vitest';
import { piano } from '@volstudio/audio-synth';

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

function allFinite(channels: Float32Array[]): boolean {
  return channels.every((ch) => ch.every((s) => Number.isFinite(s)));
}

function rms(buffer: Float32Array): number {
  let sum = 0;
  for (const s of buffer) sum += s * s;
  return Math.sqrt(sum / buffer.length);
}

describe('piano (modal physical modeling)', () => {
  it('aynı seed ile deterministik çıktı üretir', () => {
    const a = piano({ frequency: 220, duration: 0.2, seed: 42 });
    const b = piano({ frequency: 220, duration: 0.2, seed: 42 });
    expect(a.channels[0]).toEqual(b.channels[0]);
    expect(a.channels[1]).toEqual(b.channels[1]);
  });

  it('farklı seed farklı faz ilişkisi üretir', () => {
    const a = piano({ frequency: 220, duration: 0.2, seed: 1 });
    const b = piano({ frequency: 220, duration: 0.2, seed: 2 });
    expect(a.channels[0]).not.toEqual(b.channels[0]);
  });

  it('varsayılan parametrelerle sonlu çıktı üretir', () => {
    const result = piano({ frequency: 220, duration: 0.5 });
    expect(allFinite(result.channels)).toBe(true);
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
      { inharmonicity: -0.5 },
      { inharmonicity: 0.1 },
      { partials: -5 },
      { hammerHardness: 2 },
      { bodyResonance: 0.0001 },
    ];
    for (const overrides of cases) {
      const result = piano({ frequency: 220, duration: 0.2, ...overrides });
      expect(result.channels[0].length).toBeGreaterThan(0);
      expect(allFinite(result.channels)).toBe(true);
    }
  });

  it('süre boyunca genlik söner', () => {
    const result = piano({ frequency: 220, duration: 2, decay: 0.6, gain: 1 });
    const head = rms(result.channels[0].slice(1000, 2000));
    const tail = rms(result.channels[0].slice(-1000));
    expect(tail).toBeLessThan(head * 0.5);
  });

  it('bodyResonance açıkken seçilen frekansta ek enerji vardır', () => {
    const resonance = 250;
    const withBody = piano({
      frequency: 150,
      duration: 1.0,
      bodyResonance: resonance,
      bodyAmount: 0.8,
      gain: 1,
    });
    const withoutBody = piano({
      frequency: 150,
      duration: 1.0,
      bodyResonance: 0,
      gain: 1,
    });
    const eWith = toneEnergy(withBody.channels[0], withBody.sampleRate, resonance);
    const eWithout = toneEnergy(withoutBody.channels[0], withoutBody.sampleRate, resonance);
    expect(eWith).toBeGreaterThan(eWithout * 1.5);
  });

  it('unison detune stereo kanalları farklılaştırır', () => {
    const mono = piano({ frequency: 440, duration: 0.5, unisonDetune: 0 });
    const detuned = piano({ frequency: 440, duration: 0.5, unisonDetune: 15 });
    const start = Math.floor(mono.sampleRate * 0.05);
    let diffMono = 0;
    let diffDetuned = 0;
    let count = 0;
    for (let i = start; i < mono.channels[0].length; i++) {
      diffMono += Math.abs(mono.channels[0][i] - mono.channels[1][i]);
      diffDetuned += Math.abs(detuned.channels[0][i] - detuned.channels[1][i]);
      count++;
    }
    expect(diffDetuned / count).toBeGreaterThan(diffMono / count);
  });

  it('sert çekiç daha fazla üst ton enerjisi taşır', () => {
    const soft = piano({ frequency: 220, duration: 0.5, hammerHardness: 0.1, gain: 1 });
    const hard = piano({ frequency: 220, duration: 0.5, hammerHardness: 0.9, gain: 1 });
    const eSoft = toneEnergy(soft.channels[0], soft.sampleRate, 1100);
    const eHard = toneEnergy(hard.channels[0], hard.sampleRate, 1100);
    expect(eHard).toBeGreaterThan(eSoft);
  });

  it('inharmonicite kısmi tonları tam katsayıdan kaydırır', () => {
    const result = piano({ frequency: 220, duration: 1.0, inharmonicity: 0.002, gain: 1 });
    const at2x = toneEnergy(result.channels[0], result.sampleRate, 440);
    const atInharm = toneEnergy(
      result.channels[0],
      result.sampleRate,
      440 * Math.sqrt(1 + 0.002 * 4),
    );
    expect(atInharm).toBeGreaterThan(at2x * 1.2);
  });
});
