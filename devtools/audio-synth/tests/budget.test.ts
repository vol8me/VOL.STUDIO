import { describe, expect, it } from 'vitest';

import { RenderBudgetError, piano, synthesize } from '../src/index';
import { downsample2x } from '../src/engine/render';
import { assertRenderBudget, estimateSynthCost } from '../src/guard/budget';
import { resolveSynthParams } from '../src/guard/synth';
import type { SynthParams } from '../src/types';

/**
 * Kaynak bütçesi: aşırı iş ayırmadan ÖNCE, adıyla reddedilir. Süre tek başına
 * ölçü değildir — örnek oranı, oversampling, kanal, ara tampon ve tekrar
 * birlikte sayılır.
 */

function rejectsWith(build: () => unknown, resource: 'memory' | 'work'): void {
  const start = performance.now();
  expect(build).toThrow(RenderBudgetError);
  try {
    build();
  } catch (error) {
    expect((error as RenderBudgetError).resource).toBe(resource);
    expect((error as RenderBudgetError).estimate).toBeGreaterThan(
      (error as RenderBudgetError).limit,
    );
  }
  // Ayırma yapılsaydı GB'larca tampon saniyeler sürerdi; ret anlıktır.
  expect(performance.now() - start).toBeLessThan(500);
}

describe('render kaynak bütçesi', () => {
  it('uzun, yüksek oranlı render bellek bütçesinde düşer', () => {
    rejectsWith(
      () =>
        synthesize({
          wave: 'sawtooth',
          frequency: 110,
          duration: 600,
          sampleRate: 192000,
          reverb: { decay: 2 },
        }),
      'memory',
    );
  });

  it('üst üste binen bin tekrar iş bütçesinde düşer', () => {
    // Süre 60 sn'de kalır ama tekrarlar üst üste biner (repeatTime 0): iş
    // tek sesin bin katıdır.
    rejectsWith(
      () => synthesize({ wave: 'sine', frequency: 220, duration: 60, repeat: 1000 }),
      'work',
    );
  });

  it('fiziksel model de aynı bütçeye tabidir', () => {
    rejectsWith(
      () => piano({ frequency: 220, duration: 600, sampleRate: 384000, partials: 64 }),
      'memory',
    );
  });

  it('desteklenen en büyük senaryo bütçe içindedir', () => {
    const params: SynthParams = {
      sampleRate: 48000,
      duration: 600,
      wave: 'sawtooth',
      frequency: 110,
      pan: -0.2,
      reverb: { amount: 0.3, decay: 3 },
    };
    expect(() =>
      assertRenderBudget(estimateSynthCost(resolveSynthParams(params)), 'test'),
    ).not.toThrow();
  });

  it('tahmin kaynak eksenleriyle monoton büyür', () => {
    const cost = (p: Partial<SynthParams>) =>
      estimateSynthCost(resolveSynthParams({ wave: 'sine', duration: 10, ...p }));
    const base = cost({});
    expect(cost({ sampleRate: 96000 }).peakBytes).toBeGreaterThan(base.peakBytes * 1.9);
    expect(cost({ duration: 20 }).peakBytes).toBeGreaterThan(base.peakBytes * 1.9);
    expect(cost({ pan: 0 }).peakBytes).toBeGreaterThan(base.peakBytes);
    // Üst üste binen tekrar yalnız iç render işini çoğaltır: iş tekrar
    // sayısında doğrusaldır, tampon uzunluğu (çıkış işi) sabit kalır.
    const perRepeat = cost({ repeat: 2 }).workUnits - base.workUnits;
    expect(perRepeat).toBeGreaterThan(0);
    expect(cost({ repeat: 4 }).workUnits - base.workUnits).toBeCloseTo(3 * perRepeat, 0);
    expect(cost({ detune: 5 }).workUnits).toBeGreaterThan(base.workUnits);
  });
});

describe('repeat — eksik tekrar yok, görünmez iş yok', () => {
  it('her tekrar kendi zamanında duyulur ve tampon toplamı tam kapsar', () => {
    const sr = 44100;
    const result = synthesize({
      wave: 'sine',
      frequency: 440,
      duration: 0.05,
      repeat: 4,
      repeatTime: 0.1,
      sampleRate: sr,
      envelope: { attack: 0.002, hold: 0.04, release: 0.005, sustainLevel: 1 },
    });
    const samples = result.channels[0];
    // Eski 600 sn kelepçesi yok: süre tam `duration + (repeat − 1) · repeatTime`.
    expect(samples.length).toBe(Math.floor(sr * (0.05 + 3 * 0.1)));
    const energy = (from: number, to: number) => {
      let sum = 0;
      for (let i = Math.floor(from * sr); i < Math.floor(to * sr); i++) sum += samples[i] ** 2;
      return sum;
    };
    for (let r = 0; r < 4; r++) {
      const on = energy(r * 0.1 + 0.005, r * 0.1 + 0.04);
      expect(on, `tekrar ${r}`).toBeGreaterThan(0);
      if (r < 3) {
        // Tekrarlar arası sessizlik: tekrar kaymadıysa boşluk boştur.
        expect(energy(r * 0.1 + 0.06, r * 0.1 + 0.095)).toBeLessThan(on * 1e-3);
      }
    }
  });

  it('iş tahmini yalnız tampona düşen tekrarları sayar', () => {
    const single = estimateSynthCost(resolveSynthParams({ duration: 1, repeatTime: 2 }));
    const three = estimateSynthCost(resolveSynthParams({ duration: 1, repeatTime: 2, repeat: 3 }));
    // Üç tekrar üç kat iş, beş saniyelik tampon: tekrar başına ek görünmez iş yok.
    expect(three.workUnits).toBeLessThan(single.workUnits * 5);
    expect(three.workUnits).toBeGreaterThan(single.workUnits * 2.9);
  });
});

describe('downsample2x — halfband FIR decimator', () => {
  const internal = 88200;
  const out = 44100;

  function toneThrough(frequency: number): Float32Array {
    const input = Float32Array.from(
      { length: internal },
      (_, i) => Math.sin((2 * Math.PI * frequency * i) / internal) * 0.5,
    );
    return downsample2x(input, internal, out);
  }

  function rmsDb(y: Float32Array): number {
    let sum = 0;
    for (let i = 1000; i < y.length - 1000; i++) sum += y[i] * y[i];
    return 20 * Math.log10(Math.sqrt(sum / (y.length - 2000)) / (0.5 / Math.SQRT2));
  }

  it.each([1000, 10000, 19900])('%s Hz geçiş bandında düzdür (±0.01 dB)', (frequency) => {
    // Eski 4. derece Butterworth 19.9 kHz'te −3 dB'ydi.
    expect(Math.abs(rmsDb(toneThrough(frequency)))).toBeLessThan(0.01);
  });

  it.each([24500, 30000, 40000])(
    '%s Hz (işitilir banda katlanan) −90 dB altına iner',
    (frequency) => {
      // Eski Butterworth 30 kHz'i yalnız ~−14.5 dB söndürüyordu → 14.1 kHz'e katlanırdı.
      expect(rmsDb(toneThrough(frequency))).toBeLessThan(-90);
    },
  );

  it('sıfır fazlıdır: darbe aynı zamanda, simetrik çıkar', () => {
    const input = new Float32Array(4000);
    input[2000] = 1;
    const y = downsample2x(input, internal, out);
    let peakAt = 0;
    for (let i = 0; i < y.length; i++) if (Math.abs(y[i]) > Math.abs(y[peakAt])) peakAt = i;
    expect(peakAt).toBe(1000);
    for (let k = 1; k < 40; k++) expect(y[1000 + k]).toBeCloseTo(y[1000 - k], 12);
  });

  it('yalnız çıkış tamponu ayrılır: uzunluk girişin yarısıdır', () => {
    expect(downsample2x(new Float32Array(8193), internal, out).length).toBe(4096);
  });
});
