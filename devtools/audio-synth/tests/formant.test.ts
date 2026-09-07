import { describe, expect, it } from 'vitest';
import { formant } from '../src/instruments/voice/formant';

function allFinite(channels: Float32Array[]): boolean {
  return channels.every((ch) => ch.every((s) => Number.isFinite(s)));
}

function peak(channels: Float32Array[]): number {
  let p = 0;
  for (const ch of channels) for (const s of ch) p = Math.max(p, Math.abs(s));
  return p;
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

describe('formant (formant / koro fiziksel modeli)', () => {
  it('aynı parametrelerle deterministik ve sonlu çıktı üretir', () => {
    const a = formant({ frequency: 220, duration: 0.5, seed: 42 });
    const b = formant({ frequency: 220, duration: 0.5, seed: 42 });
    expect(a.channels[0]).toEqual(b.channels[0]);
    expect(a.channels[1]).toEqual(b.channels[1]);
    expect(allFinite(a.channels)).toBe(true);
    expect(peak(a.channels)).toBeLessThanOrEqual(1.0);
  });

  it('farklı seed farklı çıktı üretir', () => {
    const a = formant({ frequency: 220, duration: 0.5, seed: 1 });
    const b = formant({ frequency: 220, duration: 0.5, seed: 2 });
    expect(a.channels[0]).not.toEqual(b.channels[0]);
  });

  it('formant filtreleri seçili frekansta enerji vurgusu yaratır', () => {
    // f0=100 Hz seçiliyor ki 7. ve 12. harmonikler (700, 1200 Hz)
    // formant merkezlerine tam otursun; 9. harmonik (900 Hz) ise bant dışı.
    const f0 = 100;
    const result = formant({
      frequency: f0,
      duration: 1.0,
      formants: [
        { frequency: 700, gain: 1.0, bandwidth: 30 },
        { frequency: 1220, gain: 0.6, bandwidth: 50 },
      ],
      gain: 0.6,
      seed: 11,
    });
    const eFormant = toneEnergy(result.channels[0], result.sampleRate, 700);
    const eOff = toneEnergy(result.channels[0], result.sampleRate, 900);
    expect(eFormant).toBeGreaterThan(eOff * 2);
  });

  it('mutasyon: formant kapatılınca yüksek harmonik enerjisi artar', () => {
    const base = { frequency: 220, duration: 1.0, gain: 0.6, seed: 22 } as const;
    const withFormant = formant(base);
    const withoutFormant = formant({ ...base, formants: [] });
    // 18. kısmi ton (≈3960 Hz) formant bantlarının üstündedir;
    // filtreler kapalıyken daha yüksek enerji taşımalıdır.
    const testFreq = 4000;
    const eFormant = toneEnergy(withFormant.channels[0], withFormant.sampleRate, testFreq);
    const eNoFormant = toneEnergy(withoutFormant.channels[0], withoutFormant.sampleRate, testFreq);
    expect(eNoFormant).toBeGreaterThan(eFormant * 1.5);
  });

  it('geçersiz parametreler çökme veya sonsuz değer üretmez', () => {
    const cases = [
      { frequency: NaN },
      { frequency: Infinity },
      { frequency: -100 },
      { duration: NaN },
      { duration: -1 },
      { sampleRate: 0 },
      { sampleRate: NaN },
      { vibratoDepth: 1000 },
      { voices: -3 },
      { gain: 2 },
    ];
    for (const override of cases) {
      const result = formant({ frequency: 220, duration: 0.3, ...override });
      expect(result.channels[0].length).toBeGreaterThan(0);
      expect(allFinite(result.channels)).toBe(true);
      expect(peak(result.channels)).toBeLessThanOrEqual(1.0);
    }
  });
});
