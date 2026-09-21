import { describe, expect, it } from 'vitest';

import { RenderBudgetError, piano, synthesize } from '../src/index';
import { downsample2x } from '../src/engine/render';
import { BiquadFilter } from '../src/synthesis/filter';
import { BUTTERWORTH_Q4 } from '../src/synthesis/filter';
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
    expect(cost({ repeat: 4 }).workUnits).toBeGreaterThan(base.workUnits * 3.5);
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

describe('downsample2x — ara tampon olmadan aynı çıktı', () => {
  it('tek geçiş, iki geçişli tanımla (filtrele → seç) bit düzeyinde aynı', () => {
    const internal = 88200;
    const input = Float32Array.from(
      { length: 8193 },
      (_, i) => Math.sin(i * 0.37) * 0.6 + Math.sin(i * 1.9) * 0.3,
    );
    const f1 = new BiquadFilter(internal, 'lowpass', BUTTERWORTH_Q4[0]);
    const f2 = new BiquadFilter(internal, 'lowpass', BUTTERWORTH_Q4[1]);
    const filtered = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) {
      filtered[i] = f2.process(f1.process(input[i], 44100 * 0.45), 44100 * 0.45);
    }
    const expected = Float32Array.from(
      { length: Math.floor(input.length / 2) },
      (_, i) => filtered[i * 2],
    );

    const actual = downsample2x(input, internal, 44100);
    expect(actual.length).toBe(expected.length);
    expect(Array.from(actual)).toEqual(Array.from(expected));
  });
});
