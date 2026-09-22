import { describe, expect, it } from 'vitest';
import { countClicks } from '../../src/analysis/report';
import { AudioParamError } from '../../src/guard/errors';
import {
  COSINE_CURVE,
  EXPONENTIAL_CURVE,
  LINEAR_CURVE,
  renderGesture,
  SPLINE_CURVE,
  type GesturePoint,
} from '../../src/program/curves';
import { renderProgram, renderProgramLayers } from '../../src/program/render';
import { resolveProgram } from '../../src/program/schema';
import type { CurveEntry } from '../../src/program/registry';
import { createRandom } from '@volstudio/core/random';
import { autocorrelationPitch, centroid, isStrictlyMonotone, rms } from '../support/measure';

const render = (points: GesturePoint[], curve: CurveEntry, frames: number, rate: number) => {
  const out = new Float32Array(frames);
  renderGesture(points, curve, out, rate);
  return out;
};

describe('gesture eğrileri', () => {
  it('her eğri noktalardan TAM geçer', () => {
    const points: GesturePoint[] = [
      [0, 100],
      [0.5, 400],
      [1, 200],
    ];
    for (const curve of [LINEAR_CURVE, COSINE_CURVE, EXPONENTIAL_CURVE, SPLINE_CURVE]) {
      const out = render(points, curve, 11, 10);
      expect([out[0], out[5], out[10]], curve.id).toEqual([100, 400, 200]);
    }
  });

  it('cosine noktalarda eğimsizdir (C1), linear değildir', () => {
    const points: GesturePoint[] = [
      [0, 0],
      [1, 1],
      [2, 0],
    ];
    const slope = (curve: CurveEntry) => {
      const out = render(points, curve, 2001, 1000);
      return Math.abs(out[1001] - out[1000]) * 1000;
    };
    expect(slope(COSINE_CURVE)).toBeLessThan(0.01);
    expect(slope(LINEAR_CURVE)).toBeCloseTo(1, 2);
  });

  it('exponential geometrik orta noktadan geçer; işaret değişimini reddeder', () => {
    const out = render(
      [
        [0, 100],
        [1, 400],
      ],
      EXPONENTIAL_CURVE,
      3,
      2,
    );
    expect(out[1]).toBeCloseTo(200, 3);
    expect(EXPONENTIAL_CURVE.segmentIssue(1, -1)).not.toBeNull();
    expect(EXPONENTIAL_CURVE.segmentIssue(0, 1)).not.toBeNull();
    expect(EXPONENTIAL_CURVE.segmentIssue(-2, -1)).toBeNull();
  });

  it('spline (PCHIP) monoton veride monoton, hiçbir veride aşım yapmaz — 64 rastgele küme', () => {
    for (let seed = 0; seed < 64; seed++) {
      const random = createRandom(seed);
      let t = 0;
      const points: GesturePoint[] = Array.from({ length: 6 }, () => {
        t += 0.05 + random.next() * 0.3;
        return [t, random.bipolar() * 100];
      });
      const out = render(points, SPLINE_CURVE, 4000, 2000);
      for (let k = 0; k + 1 < points.length; k++) {
        const lo = Math.min(points[k][1], points[k + 1][1]) - 1e-3;
        const hi = Math.max(points[k][1], points[k + 1][1]) + 1e-3;
        const from = Math.ceil(points[k][0] * 2000);
        const to = Math.min(out.length, Math.floor(points[k + 1][0] * 2000));
        for (let i = from; i < to; i++)
          expect(out[i] >= lo && out[i] <= hi, `seed ${seed}`).toBe(true);
      }
    }
    const rising = render(
      [
        [0, 0],
        [0.1, 1],
        [0.2, 5],
        [0.3, 5.5],
        [0.4, 10],
      ],
      SPLINE_CURVE,
      1000,
      2000,
    );
    expect(rising.every((v, i) => i === 0 || v >= rising[i - 1] - 1e-5)).toBe(true);
  });

  it('spline iki noktada doğrusal, tek noktada sabit; basamak semantiği korunur', () => {
    const two = render(
      [
        [0, 0],
        [1, 10],
      ],
      SPLINE_CURVE,
      11,
      10,
    );
    expect(two[5]).toBeCloseTo(5, 5);
    const step = render(
      [
        [0, 0],
        [0.5, 0],
        [0.5, 10],
        [1, 20],
      ],
      SPLINE_CURVE,
      11,
      10,
    );
    expect([step[4], step[5]]).toEqual([0, 10]);
  });

  it('örnek-doğru: 0.5 sn’deki basamak 48 kHz’te tam 24000. örnekte', () => {
    const out = render(
      [
        [0, 0],
        [0.5, 0],
        [0.5, 1],
      ],
      LINEAR_CURVE,
      48000,
      48000,
    );
    expect([out[23999], out[24000]]).toEqual([0, 1]);
  });
});

describe('aynı kaynak üzerinde üç bağımsız gesture', () => {
  const program = {
    schema: 'AcousticProgramV1',
    sampleRate: 48000,
    channels: 1,
    durationSeconds: 2,
    seed: 1,
    gestures: {
      pitch: {
        curve: 'curve.exponential',
        version: 1,
        points: [
          [0, 110],
          [2, 220],
        ],
      },
      pressure: {
        curve: 'curve.cosine',
        version: 1,
        points: [
          [0, -30],
          [2, 0],
        ],
      },
      resonance: {
        curve: 'curve.spline',
        version: 1,
        points: [
          [0, 400],
          [1, 1500],
          [2, 3500],
        ],
      },
    },
    layers: [
      {
        name: 'voice',
        source: {
          primitive: 'source.oscillator',
          version: 1,
          params: { waveform: 'sawtooth', frequency: { gesture: 'pitch' } },
        },
        resonators: [
          {
            primitive: 'resonator.biquad',
            version: 1,
            params: { mode: 'bandpass', frequency: { gesture: 'resonance' }, q: 2 },
          },
        ],
        articulation: {
          primitive: 'articulation.amplitude',
          version: 1,
          params: { level: { gesture: 'pressure' } },
        },
      },
    ],
    master: { normalize: 'none' },
  };

  it('perde, basınç ve rezonans eğrileri ölçülen yönde ilerler; render deterministik', () => {
    const voice = renderProgramLayers(program).get('voice') as Float32Array;
    const again = renderProgramLayers(program).get('voice') as Float32Array;
    expect(voice.every((v, i) => v === again[i])).toBe(true);
    const windows = [0.25, 0.75, 1.25, 1.75].map((s) => Math.round(s * 48000));
    const pitch = windows.map((w) => autocorrelationPitch(voice, 48000, w, 4096, 80, 300));
    const level = windows.map((w) => rms(voice, w, w + 4096));
    const color = windows.map((w) => centroid(voice, 48000, w, 4096));
    expect(isStrictlyMonotone(pitch, 1)).toBe(true);
    expect(pitch[0]).toBeGreaterThan(110 * 0.95);
    expect(pitch[3]).toBeLessThan(220 * 1.05);
    expect(isStrictlyMonotone(level, 1)).toBe(true);
    expect(isStrictlyMonotone(color, 1)).toBe(true);
    expect(countClicks([voice], 48000).count).toBe(0);
  });

  it('geçersiz bağlar render’dan önce reddedilir', () => {
    const bad = (params: Record<string, unknown>) => () =>
      resolveProgram({
        ...program,
        layers: [
          {
            ...program.layers[0],
            articulation: { primitive: 'articulation.amplitude', version: 1, params },
          },
        ],
      });
    expect(bad({ level: { gesture: 'pressure', value: -3 } })).toThrow(AudioParamError);
    expect(bad({ level: {} })).toThrow(/biri ya da `modulate` gerekir/);
    expect(bad({ level: { gesture: 'pressure', modulate: [{ by: 'none', depth: 1 }] } })).toThrow(
      /tanımsız modülatör/,
    );
    expect(() =>
      renderProgram({
        ...program,
        gestures: {
          ...program.gestures,
          pitch: {
            curve: 'curve.exponential',
            version: 1,
            points: [
              [0, 110],
              [2, -1],
            ],
          },
        },
      }),
    ).toThrow(AudioParamError);
  });
});
