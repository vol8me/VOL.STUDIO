import { describe, expect, it } from 'vitest';
import { brass } from '../src/instruments/brass/brass';

function allFinite(channels: Float32Array[]): boolean {
  return channels.every((ch) => ch.every((s) => Number.isFinite(s)));
}

function rms(samples: Float32Array, from: number, to: number): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (to - from));
}

/** Hedef frekanstaki enerji (Goertzel). */
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

/** İlk `windowSec`lik RMS'i hesaplar. */
function earlyRms(samples: Float32Array, sampleRate: number, windowSec: number): number {
  const end = Math.min(samples.length, Math.floor(sampleRate * windowSec));
  return rms(samples, 0, end);
}

/** Yüksek kısmi ton enerjisini toplar (4. - 8. harmonik). */
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

describe('brass (lip-reed fiziksel modeli)', () => {
  it('aynı parametrelerle deterministik ve sonlu çıktı üretir', () => {
    const a = brass({ frequency: 220, duration: 0.5, seed: 42 });
    const b = brass({ frequency: 220, duration: 0.5, seed: 42 });
    expect(a.channels[0]).toEqual(b.channels[0]);
    expect(a.channels[1]).toEqual(b.channels[1]);
    expect(a.sampleRate).toBe(b.sampleRate);
    expect(a.duration).toBe(b.duration);
    expect(allFinite(a.channels)).toBe(true);
  });

  it('farklı seed farklı faz ilişkisi üretir', () => {
    const a = brass({ frequency: 220, duration: 0.5, seed: 1 });
    const b = brass({ frequency: 220, duration: 0.5, seed: 2 });
    let differing = 0;
    for (let i = 0; i < a.channels[0].length; i++) {
      if (a.channels[0][i] !== b.channels[0][i]) differing++;
    }
    expect(differing).toBeGreaterThan(0);
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
      { lowpassCutoff: -500 },
      { lowpassCutoff: 30000 },
      { attack: 100 },
      { gain: 2 },
      { brightness: 2 },
      { lipNoise: -0.5 },
    ];
    for (const overrides of cases) {
      const result = brass({ frequency: 220, duration: 0.2, ...overrides });
      expect(result.channels[0].length).toBeGreaterThan(0);
      expect(allFinite(result.channels)).toBe(true);
    }
  });

  it('açık lowpass, kapatılmış lowpassten daha fazla üst ton enerjisi taşır', () => {
    const base = { frequency: 220, duration: 1.0, brightness: 0.8, gain: 0.5, seed: 7 };
    const open = brass({ ...base, lowpassCutoff: 8000 });
    const muted = brass({ ...base, lowpassCutoff: 1000 });

    const openEnergy = highPartialEnergy(open.channels[0], open.sampleRate, 220, 4, 8);
    const mutedEnergy = highPartialEnergy(muted.channels[0], muted.sampleRate, 220, 4, 8);

    expect(openEnergy).toBeGreaterThan(mutedEnergy * 2);
  });

  it('hızlı atak yavaş ataktan önce yükselir', () => {
    const base = { frequency: 220, duration: 2.0, brightness: 0.7, gain: 0.5, seed: 5 };
    const fast = brass({ ...base, attack: 0.005 });
    const slow = brass({ ...base, attack: 0.2 });

    const fastRms = earlyRms(fast.channels[0], fast.sampleRate, 0.03);
    const slowRms = earlyRms(slow.channels[0], slow.sampleRate, 0.03);

    expect(fastRms).toBeGreaterThan(slowRms * 3);
  });
});
