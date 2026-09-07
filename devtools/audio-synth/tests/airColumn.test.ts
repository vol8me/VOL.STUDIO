import { describe, expect, it } from 'vitest';
import { airColumn } from '../src/instruments/wind/airColumn';
import { AIR_COLUMN_CATALOG } from '../src/presets/catalog/airColumn';

function allFinite(channels: Float32Array[]): boolean {
  return channels.every((ch) => ch.every((s) => Number.isFinite(s)));
}

function peak(samples: Float32Array): number {
  let p = 0;
  for (const s of samples) p = Math.max(p, Math.abs(s));
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

function highPartialEnergy(
  samples: Float32Array,
  sampleRate: number,
  fundamental: number,
  from = 3,
  to = 8,
): number {
  let sum = 0;
  for (let n = from; n <= to; n++) {
    sum += toneEnergy(samples, sampleRate, fundamental * n);
  }
  return sum;
}

describe('airColumn fiziksel modeli', () => {
  it('aynı parametrelerle deterministik ve sonlu çıktı üretir', () => {
    const a = airColumn({ frequency: 440, duration: 0.5, seed: 123 });
    const b = airColumn({ frequency: 440, duration: 0.5, seed: 123 });
    expect(a.channels[0]).toEqual(b.channels[0]);
    expect(a.channels[1]).toEqual(b.channels[1]);
    expect(allFinite(a.channels)).toBe(true);
    expect(peak(a.channels[0])).toBeLessThanOrEqual(1.0);
  });

  it('farklı seed farklı çıktı üretir', () => {
    const a = airColumn({ frequency: 440, duration: 0.4, seed: 1 });
    const b = airColumn({ frequency: 440, duration: 0.4, seed: 2 });
    expect(a.channels[0]).not.toEqual(b.channels[0]);
  });

  it('gürültü uyarımı + rezonant bandpass ile temel perde, yakın yan perdeden daha fazla enerji taşır', () => {
    const f0 = 440;
    const result = airColumn({
      frequency: f0,
      duration: 1.0,
      resonatorCutoff: 2500,
      resonance: 0.75,
      seed: 77,
    });
    const samples = result.channels[0];
    const fundamental = toneEnergy(samples, result.sampleRate, f0);
    const offPitch = toneEnergy(samples, result.sampleRate, f0 + 20);
    expect(fundamental).toBeGreaterThan(0);
    expect(fundamental).toBeGreaterThan(offPitch * 1.15);
  });

  it('mutasyon: resonator kesim frekansını yükseltmek üst kısmi ton enerjisini artırır', () => {
    const f0 = 440;
    const low = airColumn({
      frequency: f0,
      duration: 1.0,
      resonatorCutoff: 1000,
      resonance: 0.55,
      seed: 88,
    });
    const high = airColumn({
      frequency: f0,
      duration: 1.0,
      resonatorCutoff: 3500,
      resonance: 0.55,
      seed: 88,
    });
    const lowHigh = highPartialEnergy(low.channels[0], low.sampleRate, f0, 4, 6);
    const highHigh = highPartialEnergy(high.channels[0], high.sampleRate, f0, 4, 6);
    expect(highHigh).toBeGreaterThan(lowHigh * 2);
  });

  it('kapalı boru yazılışı tek kat harmonikleri açık borudan daha az üst tonlu bırakır', () => {
    const f0 = 220;
    const open = airColumn({
      frequency: f0,
      duration: 0.8,
      resonatorCutoff: 2000,
      register: 'open',
      seed: 99,
    });
    const closed = airColumn({
      frequency: f0,
      duration: 0.8,
      resonatorCutoff: 2000,
      register: 'closed',
      seed: 99,
    });
    const openHigh = highPartialEnergy(open.channels[0], open.sampleRate, f0, 2, 5);
    const closedHigh = highPartialEnergy(closed.channels[0], closed.sampleRate, f0, 2, 5);
    expect(closedHigh).toBeLessThan(openHigh);
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
      { resonatorCutoff: -500 },
      { resonance: 5 },
      { turbulence: -2 },
      { gain: 2 },
    ];
    for (const override of cases) {
      const result = airColumn({ frequency: 220, duration: 0.3, ...override });
      expect(result.channels[0].length).toBeGreaterThan(0);
      expect(allFinite(result.channels)).toBe(true);
    }
  });
});

describe('AIR_COLUMN_CATALOG', () => {
  it('dört ahşap üflemeli preset için metadata içerir', () => {
    expect(Object.keys(AIR_COLUMN_CATALOG).sort()).toEqual([
      'bassoon',
      'clarinet',
      'flute',
      'oboe',
    ]);
    for (const key of ['flute', 'clarinet', 'oboe', 'bassoon']) {
      const meta = AIR_COLUMN_CATALOG[key];
      expect(meta.category).toBe('instrument');
      expect(meta.typicalFrequency).toBeGreaterThan(0);
      expect(meta.typicalDuration).toBeGreaterThan(0);
      expect(meta.tags).toContain('woodwind');
    }
  });
});
