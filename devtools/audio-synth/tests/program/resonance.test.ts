import { describe, expect, it } from 'vitest';
import { countClicks } from '../../src/analysis/report';
import { RenderBudgetError } from '../../src/guard/budget';
import { helmholtzFrequency, layoutRatio } from '../../src/program/primitives/resonance';
import { renderProgram, renderProgramLayers } from '../../src/program/render';
import { isNonDecreasing, peakFrequency, peakTrack } from '../support/measure';

const RATE = 48000;
const base = {
  schema: 'AcousticProgramV1',
  sampleRate: RATE,
  channels: 1,
  seed: 4,
  master: { normalize: 'none', fadeOutSeconds: 0 },
};

function layer(name: string, source: unknown, resonators: unknown[] = []) {
  return { name, source, resonators };
}

const EXCITERS = {
  impact: { primitive: 'exciter.impact', version: 1, params: { contactTime: 0.0005 } },
  membrane: { primitive: 'exciter.membrane', version: 1, params: { rate: 12 } },
  turbulence: { primitive: 'exciter.turbulence', version: 1, params: { brightness: 0.8 } },
};
const CLICKS = {
  primitive: 'exciter.membrane',
  version: 1,
  params: { rate: 25, tension: 0.9, buckleDecay: 0.0005 },
};
const CAVITY_HZ = helmholtzFrequency(0.5, 3, 2);
const RESONATORS: Record<string, { node: unknown; expected: number }> = {
  modal: {
    node: {
      primitive: 'resonator.modal',
      version: 1,
      params: { frequency: 330, brightness: 0, modes: 6, decay: 1.2 },
    },
    expected: 330,
  },
  cavity: {
    node: { primitive: 'resonator.cavity', version: 1, params: { q: 30 } },
    expected: CAVITY_HZ,
  },
  formant: {
    node: {
      primitive: 'resonator.formant',
      version: 1,
      params: { f1: 600, f2: 1700, f3: 2600, f4: 3500 },
    },
    expected: 600,
  },
};

describe('Exciter → Rezonatör → Artikülatör: aynı program yüzeyinde yeniden birleşim', () => {
  for (const [exciterName, exciter] of Object.entries(EXCITERS)) {
    for (const [resonatorName, resonator] of Object.entries(RESONATORS)) {
      it(`${exciterName} × ${resonatorName}: rezonans tepesi beklenen frekansta`, () => {
        const program = {
          ...base,
          durationSeconds: 1,
          layers: [layer('probe', exciter, [resonator.node])],
        };
        const out = renderProgramLayers(program).get('probe') as Float32Array;
        expect(out.every(Number.isFinite)).toBe(true);
        expect(Math.max(...out.map(Math.abs))).toBeGreaterThan(1e-4);
        const peak = peakFrequency(out, RATE, 0, 32768, [60, 4000]);
        expect(Math.abs(peak - resonator.expected) / resonator.expected).toBeLessThan(0.08);
      });
    }
  }

  it('artikülasyon katmanın sonunda: zarf ve genlik aynı kaynağa takılır', () => {
    const shaped = renderProgramLayers({
      ...base,
      durationSeconds: 0.5,
      layers: [
        {
          ...layer('probe', EXCITERS.turbulence, [RESONATORS.formant.node]),
          articulation: { primitive: 'articulation.amplitude', version: 1, params: { level: -20 } },
        },
      ],
    }).get('probe') as Float32Array;
    const raw = renderProgramLayers({
      ...base,
      durationSeconds: 0.5,
      layers: [layer('probe', EXCITERS.turbulence, [RESONATORS.formant.node])],
    }).get('probe') as Float32Array;
    expect(shaped[1000] / raw[1000]).toBeCloseTo(0.1, 5);
  });
});

describe('zamanla değişen modal banka', () => {
  const shrinking = (curve: string, source: unknown) => ({
    ...base,
    durationSeconds: 2,
    gestures: {
      size: {
        curve,
        version: 1,
        points: [
          [0, 0.5],
          [1.8, 0],
        ],
      },
    },
    controls: [{ control: 'control.body-size', version: 1, value: { gesture: 'size' } }],
    // Periyodik geniş bantlı tık dizisiyle uyarılır: gürültü uyarımında dar bantlı modun
    // zarfı Rayleigh sönümlenmesi gösterir ve tepe izi rastgele üst moda atlayabilir.
    layers: [
      layer('body', source, [
        {
          primitive: 'resonator.modal',
          version: 1,
          params: { frequency: 220, modes: 4, decay: 2, brightness: 0 },
        },
      ]),
    ],
  });

  it('"gövde küçülüyor": ölçülen mod frekansı sürekli yükselir, NaN yok', () => {
    const body = renderProgramLayers(shrinking('curve.linear', CLICKS)).get('body') as Float32Array;
    expect(body.every(Number.isFinite)).toBe(true);
    const track = peakTrack(body, RATE, 8192, 4096, [100, 700]);
    expect(isNonDecreasing(track, 2)).toBe(true);
    expect(track[0]).toBeGreaterThan(210);
    expect(track[0]).toBeLessThan(235);
    expect(track[track.length - 1]).toBeGreaterThan(400);
  });

  it('katsayı taraması tık üretmez: sürekli (gürültü) uyarımda süreksizlik adayı yok', () => {
    for (const curve of ['curve.linear', 'curve.cosine', 'curve.spline']) {
      const program = shrinking(curve, EXCITERS.turbulence);
      const body = renderProgramLayers(program).get('body') as Float32Array;
      expect(countClicks([body], RATE).count, curve).toBe(0);
    }
  });

  it('frekans ve T60 aşırı hızlı sürülse de kararlı kalır (sonlu, sınırlı)', () => {
    const out = renderProgram({
      ...base,
      durationSeconds: 1,
      gestures: {
        f: {
          curve: 'curve.linear',
          version: 1,
          points: [
            [0, 20],
            [0.01, 11000],
            [0.02, 20],
            [0.5, 11000],
          ],
        },
        d: {
          curve: 'curve.linear',
          version: 1,
          points: [
            [0, 0.005],
            [0.5, 30],
            [0.51, 0.005],
          ],
        },
      },
      layers: [
        layer('wild', EXCITERS.turbulence, [
          {
            primitive: 'resonator.modal',
            version: 1,
            params: { frequency: { gesture: 'f' }, decay: { gesture: 'd' }, modes: 32 },
          },
        ]),
      ],
    });
    const peak = Math.max(...out.channels[0].map(Math.abs));
    expect(Number.isFinite(peak)).toBe(true);
    expect(peak).toBeLessThan(1e4);
  });

  it('mod yerleşimleri: tel harmonik (B=0), çubuk (β₂/β₁)² ≈ 2.756, zar j₁₁/j₀₁ ≈ 1.594', () => {
    expect(layoutRatio('string', 2, 0)).toBe(3);
    expect(layoutRatio('string', 2, 0.01)).toBeGreaterThan(3);
    expect(layoutRatio('bar', 1, 0)).toBeCloseTo(2.7565, 3);
    expect(layoutRatio('bar', 6, 0)).toBeGreaterThan(layoutRatio('bar', 5, 0));
    expect(layoutRatio('membrane', 1, 0)).toBeCloseTo(1.5933, 3);
    expect(layoutRatio('membrane', 40, 0)).toBe(layoutRatio('membrane', 31, 0));
  });

  it('Helmholtz: hacim ×4 → frekans ½; boyun kesiti büyür → frekans yükselir', () => {
    expect(helmholtzFrequency(2, 3, 2) / helmholtzFrequency(0.5, 3, 2)).toBeCloseTo(0.5, 6);
    expect(helmholtzFrequency(0.5, 6, 2)).toBeGreaterThan(helmholtzFrequency(0.5, 3, 2));
    // 1 L, 5 cm², 5 cm boyunlu şişe: a = √(A/π) = 1.26 cm, L_eff = 5 + 1.7·1.26 = 7.14 cm,
    // f = 343/(2π)·√(5e−4 / (1e−3 · 0.0714)) ≈ 144.4 Hz.
    expect(helmholtzFrequency(1, 5, 5)).toBeCloseTo(144.4, 0);
  });

  it('bütçe: 32 mod × 32 katman × 600 sn otomasyonlu banka render edilmeden reddedilir', () => {
    const heavy = {
      ...base,
      durationSeconds: 600,
      gestures: {
        f: {
          curve: 'curve.linear',
          version: 1,
          points: [
            [0, 100],
            [600, 200],
          ],
        },
      },
      layers: Array.from({ length: 32 }, (_, i) =>
        layer(`l${i}`, EXCITERS.impact, [
          {
            primitive: 'resonator.modal',
            version: 1,
            params: { modes: 32, frequency: { gesture: 'f' } },
          },
        ]),
      ),
    };
    expect(() => renderProgram(heavy)).toThrow(RenderBudgetError);
  });
});
