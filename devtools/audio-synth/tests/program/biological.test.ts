import { describe, expect, it } from 'vitest';
import { analyzeAudio, countClicks } from '../../src/analysis/report';
import { blackmanHarris, powerSpectrum } from '../../src/analysis/spectrum';
import { RenderBudgetError } from '../../src/guard/budget';
import {
  bubbleDamping,
  bubbleSeconds,
  minnaertFrequency,
} from '../../src/program/primitives/fluid';
import { tubeResonance } from '../../src/program/primitives/waveguide';
import { renderProgram, renderProgramLayers } from '../../src/program/render';
import {
  autocorrelationPitch,
  isStrictlyMonotone,
  peakFrequency,
  peakTrack,
} from '../support/measure';

const RATE = 48000;

function layerOf(source: unknown, resonators: unknown[] = [], seconds = 1, extra: object = {}) {
  const program = {
    schema: 'AcousticProgramV1',
    sampleRate: RATE,
    channels: 1,
    durationSeconds: seconds,
    seed: 21,
    layers: [{ name: 'probe', source, resonators }],
    master: { normalize: 'none', fadeOutSeconds: 0 },
    ...extra,
  };
  return renderProgramLayers(program).get('probe') as Float32Array;
}

const node = (primitive: string, params: Record<string, unknown> = {}) => ({
  primitive,
  version: 1,
  params,
});

describe('akışkan/kabarcık ailesi', () => {
  it('Minnaert: f₀·R ≈ 3.29 m/sn (R = 1 mm → ~3.3 kHz)', () => {
    expect(minnaertFrequency(1)).toBeCloseTo(3286, -1);
    expect(minnaertFrequency(2) / minnaertFrequency(1)).toBeCloseTo(0.5, 10);
    expect(bubbleDamping(1000, 2)).toBeCloseTo(2 * (130 + 0.0072 * 1000 ** 1.5), 6);
    expect(bubbleSeconds(20, 0.25)).toBeLessThanOrEqual(2);
  });

  it('kabarcık büyüdükçe ölçülen temel rezonans düşer (spektral test, Minnaert ±%5)', () => {
    const radii = [1, 2, 4, 8];
    const peaks = radii.map((radius) =>
      peakFrequency(
        layerOf(node('source.bubble', { radius, rise: 0 })),
        RATE,
        0,
        16384,
        [100, 8000],
      ),
    );
    expect(isStrictlyMonotone(peaks, -1)).toBe(true);
    radii.forEach((radius, i) => {
      expect(
        Math.abs(peaks[i] - minnaertFrequency(radius)) / minnaertFrequency(radius),
      ).toBeLessThan(0.05);
    });
  });

  it('viskozite/sönüm arttıkça kuyruk kısalır (darbe testi, −40 dB süresi)', () => {
    const tails = [0.5, 1, 2, 4].map(
      (damping) =>
        analyzeAudio(
          [layerOf(node('source.bubble', { radius: 6, damping, rise: 0 }))],
          RATE,
          'source-pcm',
        ).temporal.decay40Seconds ?? Infinity,
    );
    expect(isStrictlyMonotone(tails, -1)).toBe(true);
  });

  it('yükselme katsayısı perdeyi yukarı kaydırır (sönüm boyunca)', () => {
    const track = peakTrack(
      layerOf(node('source.bubble', { radius: 10, rise: 0.5, damping: 0.3 })),
      RATE,
      4096,
      2048,
      [150, 2000],
    );
    expect(track[3]).toBeGreaterThan(track[0] * 1.2);
  });

  it('nüfus ve fokurtu: deterministik, sonlu, tık adayı sınırlı; boyut medyanı perdeyi taşır', () => {
    const small = layerOf(node('source.bubbles', { rate: 60, radius: 1 }), [], 2);
    const large = layerOf(node('source.bubbles', { rate: 60, radius: 6 }), [], 2);
    const again = layerOf(node('source.bubbles', { rate: 60, radius: 1 }), [], 2);
    expect(small.every((v, i) => v === again[i])).toBe(true);
    const centroid = (x: Float32Array) =>
      analyzeAudio([x], RATE, 'source-pcm').spectral.centroidHz ?? 0;
    expect(centroid(small)).toBeGreaterThan(centroid(large));
    const gurgle = layerOf(node('source.gurgle', { pulseRate: 4 }), [], 2);
    expect(gurgle.every(Number.isFinite)).toBe(true);
    expect(Math.max(...gurgle.map(Math.abs))).toBeGreaterThan(0.01);
  });

  it('gerçek kabarcık akışı eklemek glottal perde katmanını BİREBİR korur', () => {
    const voice = {
      name: 'voice',
      source: node('source.glottal', {
        frequency: { value: 180, modulate: [{ by: 'pitchDrift', depth: 0.02 }] },
      }),
    };
    const base = {
      schema: 'AcousticProgramV1',
      sampleRate: RATE,
      channels: 1,
      durationSeconds: 1,
      seed: 5,
      modulators: { pitchDrift: { modulator: 'modulator.drift', version: 1, params: { rate: 2 } } },
      layers: [voice],
    };
    const withBubbles = {
      ...base,
      layers: [{ name: 'aBubbles', source: node('source.bubbles', { rate: 80 }) }, voice],
    };
    const a = renderProgramLayers(base).get('voice') as Float32Array;
    const b = renderProgramLayers(withBubbles).get('voice') as Float32Array;
    expect(a.every((v, i) => v === b[i])).toBe(true);
  });

  it('bütçe: 2000/sn büyük kabarcık nüfusu × 600 sn reddedilir', () => {
    const heavy = {
      schema: 'AcousticProgramV1',
      sampleRate: RATE,
      channels: 1,
      durationSeconds: 600,
      seed: 1,
      layers: [
        { name: 'b', source: node('source.bubbles', { rate: 2000, radius: 20, damping: 0.25 }) },
      ],
    };
    expect(() => renderProgram(heavy)).toThrow(RenderBudgetError);
  });
});

describe('glottal kaynak', () => {
  const voice = (params: Record<string, unknown>, seconds = 1) =>
    layerOf(node('source.glottal', { jitter: 0, shimmer: 0, breath: 0, ...params }), [], seconds);

  it('BLIT alias üretmez: 1234.5 Hz’te harmonik dışı enerji tabanı −60 dB altında', () => {
    const x = voice({ frequency: 1234.5, tension: 1 });
    const size = 32768;
    const power = powerSpectrum(x, 8000, size, blackmanHarris(size));
    const binHz = RATE / size;
    let harmonic = 0;
    let other = 0;
    for (let k = 1; k < power.length; k++) {
      const f = k * binHz;
      const nearest = Math.round(f / 1234.5) * 1234.5;
      if (Math.abs(f - nearest) < 6 * binHz) harmonic = Math.max(harmonic, power[k]);
      else other = Math.max(other, power[k]);
    }
    expect(10 * Math.log10(other / harmonic)).toBeLessThan(-60);
  });

  it('perde gesture’ı izlenir; tick yok; formant ayrı düğümdür', () => {
    const x = layerOf(
      node('source.glottal', { frequency: { gesture: 'pitch' }, jitter: 0, shimmer: 0 }),
      [node('resonator.formant')],
      1,
      {
        gestures: {
          pitch: {
            curve: 'curve.exponential',
            version: 1,
            points: [
              [0, 150],
              [1, 300],
            ],
          },
        },
      },
    );
    const early = autocorrelationPitch(x, RATE, 4800, 4096, 100, 400);
    const late = autocorrelationPitch(x, RATE, 38000, 4096, 100, 400);
    expect(early).toBeGreaterThan(150);
    expect(early).toBeLessThan(175);
    expect(late).toBeGreaterThan(260);
    expect(countClicks([x], RATE).count).toBe(0);
  });

  it('alt-harmonik f₀/2 enerjisini, nefes spektral düzlüğü, jitter perde sapmasını artırır', () => {
    const half = (x: Float32Array) => {
      const power = powerSpectrum(x, 4800, 16384, blackmanHarris(16384));
      const bin = Math.round((100 * 16384) / RATE);
      return power[bin];
    };
    expect(half(voice({ frequency: 200, subharmonic: 0.6 }))).toBeGreaterThan(
      100 * half(voice({ frequency: 200 })),
    );
    const flatness = (breath: number) =>
      analyzeAudio([voice({ frequency: 200, breath })], RATE, 'source-pcm').spectral.flatness ?? 0;
    expect(flatness(0.8)).toBeGreaterThan(2 * flatness(0));
    const spread = (jitter: number) => {
      const x = voice({ frequency: 200, jitter }, 2);
      const f = Array.from({ length: 30 }, (_, k) =>
        autocorrelationPitch(x, RATE, 2000 + k * 3000, 960, 150, 260),
      );
      const mean = f.reduce((a, b) => a + b) / f.length;
      return Math.sqrt(f.reduce((a, v) => a + (v - mean) ** 2, 0) / f.length);
    };
    expect(spread(0.03)).toBeGreaterThan(spread(0) + 1);
  });
});

describe('tüp dalga kılavuzu', () => {
  const impulse = node('exciter.impact', { contactTime: 0.0002, roughness: 0 });
  const tube = (length: number, ends: string) =>
    layerOf(impulse, [node('resonator.tube', { length, ends, loss: 0.02, decay: 2 })], 2);
  const SIZE = 65536;
  const near = (x: Float32Array, f: number) => peakFrequency(x, RATE, 0, SIZE, [0.9 * f, 1.1 * f]);
  const powerAt = (x: Float32Array, f: number) => {
    const power = powerSpectrum(x, 0, SIZE, blackmanHarris(SIZE));
    const k = Math.round((f * SIZE) / RATE);
    return Math.max(power[k - 2], power[k - 1], power[k], power[k + 1], power[k + 2]);
  };

  it('açık/kapalı yalnız TEK harmonikler: (2n−1)·c/4L; çift konumlar boş', () => {
    const x = tube(0.5, 'open-closed');
    for (const n of [1, 2, 3, 4]) {
      const expected = tubeResonance(0.5, 'open-closed', n);
      expect(Math.abs(near(x, expected) - expected) / expected, `mod ${n}`).toBeLessThan(0.02);
    }
    const fundamental = tubeResonance(0.5, 'open-closed', 1);
    expect(powerAt(x, 2 * fundamental)).toBeLessThan(powerAt(x, 3 * fundamental) / 100);
    expect(powerAt(x, 4 * fundamental)).toBeLessThan(powerAt(x, 5 * fundamental) / 100);
  });

  it('açık/açık BÜTÜN harmonikler: n·c/2L', () => {
    const x = tube(0.5, 'open-open');
    for (const n of [1, 2, 3, 4]) {
      const expected = tubeResonance(0.5, 'open-open', n);
      expect(Math.abs(near(x, expected) - expected) / expected, `mod ${n}`).toBeLessThan(0.02);
    }
    const f1 = tubeResonance(0.5, 'open-open', 1);
    expect(powerAt(x, 2 * f1)).toBeGreaterThan(powerAt(x, 1.5 * f1) * 100);
  });

  it('uzunluk arttıkça rezonans düşer; uzunluk taraması kararlı ve tıksız', () => {
    const fundamentals = [0.2, 0.4, 0.8, 1.6].map((length) => {
      const expected = tubeResonance(length, 'open-closed', 1);
      return peakFrequency(tube(length, 'open-closed'), RATE, 0, SIZE, [20, 2 * expected]);
    });
    expect(isStrictlyMonotone(fundamentals, -1)).toBe(true);
    const swept = layerOf(
      node('source.noise'),
      [node('resonator.tube', { length: { gesture: 'len' }, decay: 1 })],
      1,
      {
        gestures: {
          len: {
            curve: 'curve.linear',
            version: 1,
            points: [
              [0, 0.2],
              [1, 1.2],
            ],
          },
        },
      },
    );
    expect(swept.every(Number.isFinite)).toBe(true);
    expect(Math.max(...swept.map(Math.abs))).toBeLessThan(100);
    expect(countClicks([swept], RATE).count).toBe(0);
  });
});
