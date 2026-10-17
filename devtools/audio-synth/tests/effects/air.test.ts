import { describe, expect, it } from 'vitest';
import { fft } from '../../src/analysis/spectrum';
import {
  AIR_TAPS,
  airAbsorptionDbPerMeter,
  airAbsorptionFir,
  applyWidth,
} from '../../src/effects/air';

/**
 * Hava soğurması ISO 9613-1 formülüyle hesaplanır; ölçüt ISO 9613-2
 * Tablo 2'nin 20 °C / %70 bağıl nem satırıdır (dB/km, tam bant merkezleri
 * 1000·10^(k/10)). Filtre o eğriyi minimum fazla uygular.
 */
const ISO_9613_2_20C_70RH = [0.1, 0.3, 1.1, 2.8, 5.0, 9.0, 22.9, 76.6];
const MIDBANDS = [-12, -9, -6, -3, 0, 3, 6, 9].map((k) => 1000 * 10 ** (k / 10));

function responseDb(fir: Float32Array, hz: number, sampleRate: number): number {
  const size = 16384;
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  fir.forEach((v, i) => (re[i] = v));
  fft(re, im);
  const k = Math.round((hz * size) / sampleRate);
  return 10 * Math.log10(re[k] ** 2 + im[k] ** 2);
}

describe('atmosferik soğurma', () => {
  it('katsayı ISO 9613-2 Tablo 2 satırını tablonun yuvarlaması içinde verir', () => {
    MIDBANDS.forEach((hz, i) => {
      const perKm = airAbsorptionDbPerMeter(hz, 0.7) * 1000;
      expect(Math.abs(perKm - ISO_9613_2_20C_70RH[i]), `${hz.toFixed(0)} Hz`).toBeLessThan(
        0.05 + 0.005 * ISO_9613_2_20C_70RH[i],
      );
    });
  });

  it('nem arttıkça 20 °C’de tiz soğurması azalır; mesafeyle doğrusal büyür', () => {
    expect(airAbsorptionDbPerMeter(8000, 0.2)).toBeGreaterThan(airAbsorptionDbPerMeter(8000, 0.8));
    expect(airAbsorptionDbPerMeter(125, 0.5)).toBeLessThan(
      airAbsorptionDbPerMeter(8000, 0.5) / 100,
    );
  });

  it('FIR genliği α(f)·mesafe’yi 0.05 dB içinde uygular (120 dB tabana kadar)', () => {
    for (const distance of [25, 100, 400]) {
      const fir = airAbsorptionFir(distance, 0.5, 48000);
      for (const hz of [100, 1000, 4000, 8000, 12000]) {
        const want = Math.max(-120, -airAbsorptionDbPerMeter(hz, 0.5) * distance);
        expect(Math.abs(responseDb(fir, hz, 48000) - want), `${distance} m ${hz} Hz`).toBeLessThan(
          0.05,
        );
      }
    }
  });

  it('minimum faz: enerji başta toplanır, ön-çınlama ve gecikme yok', () => {
    const fir = airAbsorptionFir(400, 0.5, 48000);
    expect(fir.length).toBe(AIR_TAPS);
    let total = 0;
    let head = 0;
    fir.forEach((v, i) => {
      total += v * v;
      if (i < 64) head += v * v;
    });
    expect(head / total).toBeGreaterThan(0.999);
    const peak = fir.reduce((best, v, i) => (Math.abs(v) > Math.abs(fir[best]) ? i : best), 0);
    expect(peak).toBeLessThan(16);
  });
});

describe('orta/yan genişlik', () => {
  it('0 iki kanalı eşitler, 1 dokunmaz, mono tampona etki etmez', () => {
    const pair = () => [Float32Array.from([1, 0.5, -0.2]), Float32Array.from([0, 0.5, 0.4])];
    const narrowed = pair();
    applyWidth(narrowed, 0);
    expect([...narrowed[0]]).toEqual([...narrowed[1]]);
    const kept = pair();
    applyWidth(kept, 1);
    expect(kept).toEqual(pair());
    const mono = [Float32Array.from([1, 2])];
    applyWidth(mono, 0);
    expect([...mono[0]]).toEqual([1, 2]);
  });
});
