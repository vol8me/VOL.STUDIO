import { describe, expect, it } from 'vitest';
import { deriveSeed, substream } from '../../src/program/random';
import type { NodeContext, ModulatorEntry } from '../../src/program/registry';
import { renderProgram, renderProgramLayers } from '../../src/program/render';
import { RenderBudgetError } from '../../src/guard/budget';
import {
  DRIFT,
  JITTER,
  SAMPLE_GLIDE,
  SHIMMER,
  WALK,
} from '../../src/program/primitives/modulators';
import type { ResolvedParams } from '../../src/program/params';

const RATE = 8000;

function run(entry: ModulatorEntry, params: ResolvedParams, seed: number, seconds: number) {
  const frames = Math.round(seconds * RATE);
  const out = new Float32Array(frames);
  const ctx: NodeContext = {
    sampleRate: RATE,
    frames,
    random: (label) => substream(seed, `modulator:m/${label}`),
    seed: (label) => deriveSeed(seed, `modulator:m/${label}`),
  };
  entry.render(out, params, ctx);
  return out;
}

const mean = (x: Float32Array) => x.reduce((s, v) => s + v, 0) / x.length;
const std = (x: Float32Array) => {
  const m = mean(x);
  return Math.sqrt(x.reduce((s, v) => s + (v - m) * (v - m), 0) / x.length);
};
const correlation = (a: Float32Array, b: Float32Array) => {
  const ma = mean(a);
  const mb = mean(b);
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    ab += (a[i] - ma) * (b[i] - mb);
    aa += (a[i] - ma) ** 2;
    bb += (b[i] - mb) ** 2;
  }
  return ab / Math.sqrt(aa * bb);
};
const SEEDS = Array.from({ length: 32 }, (_, i) => 1000 + i * 7919);

describe('adla türeyen alt akışlar', () => {
  it('etiket kimliktir: aynı etiket aynı dizi, farklı etiket ilintisiz dizi', () => {
    const a = substream(42, 'layer:voice/source/noise');
    const b = substream(42, 'layer:voice/source/noise');
    expect(Array.from({ length: 8 }, () => a.next())).toEqual(
      Array.from({ length: 8 }, () => b.next()),
    );
    const pitch = substream(42, 'modulator:pitch/knots');
    const bubbles = substream(42, 'modulator:bubbles/knots');
    const p = Float32Array.from({ length: 20000 }, () => pitch.bipolar());
    const q = Float32Array.from({ length: 20000 }, () => bubbles.bipolar());
    expect(Math.abs(correlation(p, q))).toBeLessThan(0.03);
    expect(deriveSeed(1, 'a')).not.toBe(deriveSeed(2, 'a'));
    expect(deriveSeed(1, 'a')).not.toBe(deriveSeed(1, 'b'));
  });

  it('bubble akışı eklemek perde akışının örneklerini BİREBİR korur', () => {
    const voice = {
      name: 'voice',
      source: {
        primitive: 'source.oscillator',
        version: 1,
        params: { frequency: { value: 220, modulate: [{ by: 'pitchDrift', depth: 0.03 }] } },
      },
    };
    const base = {
      schema: 'AcousticProgramV1',
      sampleRate: 16000,
      channels: 1,
      durationSeconds: 1,
      seed: 9,
      modulators: { pitchDrift: { modulator: 'modulator.drift', version: 1, params: { rate: 3 } } },
      layers: [voice],
    };
    const withBubbles = {
      ...base,
      modulators: {
        ...base.modulators,
        aBubbles: { modulator: 'modulator.sample-glide', version: 1, params: { rate: 40 } },
      },
      layers: [
        {
          name: 'bubbles',
          source: {
            primitive: 'exciter.turbulence',
            version: 1,
            params: { pressure: { value: 0.5, modulate: [{ by: 'aBubbles', depth: 0.8 }] } },
          },
        },
        voice,
      ],
    };
    const a = renderProgramLayers(base).get('voice') as Float32Array;
    const b = renderProgramLayers(withBubbles).get('voice') as Float32Array;
    expect(a.length).toBe(b.length);
    expect(a.every((v, i) => v === b[i])).toBe(true);
  });
});

describe('modülatör istatistikleri (32 tohumluk korpus)', () => {
  it.each([DRIFT, WALK, SAMPLE_GLIDE, JITTER, SHIMMER].map((e) => [e.id, e] as const))(
    '%s: sınırlı, deterministik, korpus ortalaması ~0',
    (_id, entry) => {
      const defaults = Object.fromEntries(
        Object.entries(entry.params).map(([k, s]) => [k, s.default]),
      ) as ResolvedParams;
      const means: number[] = [];
      for (const seed of SEEDS) {
        const x = run(entry, defaults, seed, 4);
        expect(x.every((v) => v >= -1 && v <= 1 && Number.isFinite(v))).toBe(true);
        means.push(mean(x));
      }
      expect(Math.abs(means.reduce((s, v) => s + v, 0) / means.length)).toBeLessThan(0.12);
      const a = run(entry, defaults, 5, 1);
      const b = run(entry, defaults, 5, 1);
      expect(a.every((v, i) => v === b[i])).toBe(true);
      expect(run(entry, defaults, 6, 1).some((v, i) => v !== a[i])).toBe(true);
    },
  );

  it('drift yumuşaktır: örnek başı en büyük değişim ~rate ile sınırlı (C1 smoothstep)', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const x = run(DRIFT, { rate: 2 }, seed, 5);
      let maxStep = 0;
      for (let i = 1; i < x.length; i++) maxStep = Math.max(maxStep, Math.abs(x[i] - x[i - 1]));
      // smoothstep eğimi en çok 1.5·Δ/adım; Δ ≤ 2, adım = RATE/rate örnek.
      expect(maxStep).toBeLessThanOrEqual((1.5 * 2 * 2) / RATE + 1e-6);
    }
  });

  it('walk: durağan sapma volatiliteyle büyür, korelasyon süresi reversion ile kısalır', () => {
    const spread = (volatility: number) =>
      SEEDS.map((s) => std(run(WALK, { reversion: 4, volatility }, s, 6))).reduce((a, b) => a + b) /
      SEEDS.length;
    const low = spread(0.2);
    const high = spread(0.8);
    expect(low).toBeGreaterThan(0.05);
    expect(low).toBeLessThan(0.15);
    expect(high).toBeGreaterThan(2.5 * low);
    const lagCorrelation = (reversion: number) => {
      const lag = RATE / 4;
      const values = SEEDS.slice(0, 16).map((s) => {
        const x = run(WALK, { reversion, volatility: 0.5 }, s, 8);
        return correlation(x.subarray(0, x.length - lag), x.subarray(lag));
      });
      return values.reduce((a, b) => a + b) / values.length;
    };
    // OU özilintisi e^(−θ·τ): τ = 0.25 sn'de θ=1 → 0.78, θ=8 → 0.14.
    expect(lagCorrelation(1)).toBeGreaterThan(0.55);
    expect(lagCorrelation(8)).toBeLessThan(0.35);
  });

  it('sample-glide: hedef sıklığı rate kadar; glide büyüdükçe örnek başı sıçrama küçülür', () => {
    const jumps = (glide: number) => {
      const x = run(SAMPLE_GLIDE, { rate: 10, glide }, 11, 3);
      let max = 0;
      for (let i = 1; i < x.length; i++) max = Math.max(max, Math.abs(x[i] - x[i - 1]));
      return max;
    };
    expect(jumps(0.2)).toBeLessThan(jumps(0.002));
  });

  it('jitter: döngü başına bir yeni değer (smoothing 0) — sayım cycleRate·süre', () => {
    const x = run(JITTER, { cycleRate: 50, smoothing: 0 }, 3, 2);
    let changes = 0;
    for (let i = 1; i < x.length; i++) if (x[i] !== x[i - 1]) changes++;
    expect(changes).toBeGreaterThanOrEqual(95);
    expect(changes).toBeLessThanOrEqual(100);
    const tracking = new Float32Array(2 * RATE).fill(0).map((_, i) => 20 + (i / RATE) * 80);
    const followed = run(JITTER, { cycleRate: tracking, smoothing: 0 }, 3, 2);
    let tracked = 0;
    for (let i = 1; i < followed.length; i++) if (followed[i] !== followed[i - 1]) tracked++;
    expect(tracked).toBeGreaterThan(100);
  });
});

describe('stokastik yük bütçesi', () => {
  it('16 modülatör × 600 sn × 192 kHz ayırmadan reddedilir', () => {
    const modulators = Object.fromEntries(
      Array.from({ length: 16 }, (_, i) => [`m${i}`, { modulator: 'modulator.walk', version: 1 }]),
    );
    const program = {
      schema: 'AcousticProgramV1',
      sampleRate: 192000,
      channels: 1,
      durationSeconds: 600,
      seed: 1,
      modulators,
      layers: [
        {
          name: 'tone',
          source: {
            primitive: 'source.oscillator',
            version: 1,
            params: {
              frequency: {
                value: 440,
                modulate: [0, 1, 2, 3].map((k) => ({ by: `m${k}`, depth: 0.01 })),
              },
            },
          },
        },
        ...Array.from({ length: 3 }, (_, j) => ({
          name: `t${j}`,
          source: {
            primitive: 'source.oscillator',
            version: 1,
            params: {
              frequency: {
                value: 440,
                modulate: [4, 5, 6, 7].map((k) => ({ by: `m${k + 4 * j}`, depth: 0.01 })),
              },
            },
          },
        })),
      ],
    };
    expect(() => renderProgram(program)).toThrow(RenderBudgetError);
  });
});
