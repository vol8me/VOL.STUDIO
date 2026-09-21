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

  it('sonlu olmayan değer ve geçersiz temel nicelik adıyla reddedilir', () => {
    // NaN'ı aralığın tabanına sabitlemek bozuk girdiyi geçerli bir sese
    // çevirirdi; süre/frekans/örnek oranı da sessizce kaydırılmaz.
    const cases: [Record<string, number>, string, string][] = [
      [{ frequency: NaN }, 'bowedString.frequency', 'non-finite'],
      [{ frequency: Infinity }, 'bowedString.frequency', 'non-finite'],
      [{ frequency: -100 }, 'bowedString.frequency', 'range'],
      [{ duration: NaN }, 'bowedString.duration', 'non-finite'],
      [{ duration: -1 }, 'bowedString.duration', 'range'],
      [{ sampleRate: 0 }, 'bowedString.sampleRate', 'range'],
      [{ sampleRate: NaN }, 'bowedString.sampleRate', 'non-finite'],
      [{ bowNoise: NaN }, 'bowedString.bowNoise', 'non-finite'],
    ];
    for (const [overrides, path, issue] of cases) {
      expect(() => bowedString({ frequency: 220, duration: 0.2, ...overrides })).toThrow(
        expect.objectContaining({ name: 'AudioParamError', path, issue }),
      );
    }
  });

  it('sonlu şekillendirme değerleri modelin fiziksel aralığına kelepçelenir', () => {
    const cases = [
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

describe('bowedString gain yalnız çıkış seviyesidir', () => {
  it('çıktı gain ile orantılıdır — ton/gürültü oranı gain ile değişmez', () => {
    // Değişmez: out(g) = g · out(1). Oran korunmuyorsa gain tınıyı da
    // değiştiriyordur (eskiden düşük gain'de yay gürültüsü orantısız büyüyordu).
    const base = { frequency: 196, duration: 0.6, bowNoise: 0.3, seed: 5 } as const;
    const reference = bowedString({ ...base, gain: 1 });
    for (const gain of [0.1, 0.35, 0.8]) {
      const scaled = bowedString({ ...base, gain });
      for (let ch = 0; ch < 2; ch++) {
        let worst = 0;
        for (let i = 0; i < reference.channels[ch].length; i++) {
          worst = Math.max(
            worst,
            Math.abs(scaled.channels[ch][i] - gain * reference.channels[ch][i]),
          );
        }
        expect(worst, `gain ${gain} kanal ${ch}`).toBeLessThan(1e-6);
      }
    }
  });
});
