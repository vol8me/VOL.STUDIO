import { describe, expect, it } from 'vitest';
import { analyzeAudio } from '../src/analysis/report';
import { withRenderSession } from '../src/engine/session';
import { AudioParamError } from '../src/guard/errors';
import {
  CHOKE_FADE_SECONDS,
  drum,
  drumSeconds,
  resolveDrum,
  type DrumParams,
} from '../src/instruments/percussion/drum';
import { DRUM_MODELS, type DrumModel } from '../src/instruments/percussion/models';
import { hashPcm } from '../src/protocol/canonical';
import { isStrictlyMonotone, peakFrequency, rms } from './support/measure';
import { RENDER_BLOCK } from './support/timeouts';

/**
 * Davul ailesi ölçülerek doğrulanır: her makronun yön iddiası yedi modelde
 * sesin kendisinde aranır. Vuruş sertliği (`attack`) ilk 50 ms'nin tepe/RMS
 * oranıyla ölçülür — tepe değeri normalize edildiği için bütün sesin
 * tepe/RMS oranı gürültülü modellerde çatırtıyı gömer.
 */
const analyze = (params: DrumParams) => {
  const r = drum(params);
  return { r, a: analyzeAudio(r.channels, r.sampleRate, 'source-pcm') };
};

function earlyCrest(params: DrumParams): number {
  const { channels, sampleRate } = drum(params);
  const x = channels[0];
  const n = Math.min(x.length, Math.round(0.05 * sampleRate));
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(x[i]));
  return peak / rms(x, 0, n);
}

const sweep = (
  model: DrumModel,
  key: keyof DrumParams,
  values: number[],
  f: (p: DrumParams) => number,
) => values.map((value) => f({ model, [key]: value }));

describe('davul modelleri: yapı ve sözleşme', RENDER_BLOCK, () => {
  it.each(DRUM_MODELS)('%s: deterministik, tepe 0.9, uzunluk doğal sönüm, sonu sessiz', (model) => {
    const a = drum({ model, seed: 11 });
    const b = drum({ model, seed: 11 });
    expect(hashPcm(a.channels, a.sampleRate)).toBe(hashPcm(b.channels, b.sampleRate));
    const x = a.channels[0];
    const peak = x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(peak).toBeCloseTo(0.9, 6);
    const expected = drumSeconds(resolveDrum({ model }));
    expect(Math.abs(a.duration - expected)).toBeLessThan(2 / a.sampleRate);
    expect(Math.abs(x[x.length - 1])).toBeLessThan(1e-3);
  });

  it('gürültülü modelde tohum vuruşu değiştirir, uzunluğu değiştirmez', () => {
    const a = drum({ model: 'snare', seed: 1 });
    const b = drum({ model: 'snare', seed: 2 });
    expect(hashPcm(a.channels, a.sampleRate)).not.toBe(hashPcm(b.channels, b.sampleRate));
    expect(a.channels[0].length).toBe(b.channels[0].length);
  });

  it('boğma kapısı sesi kapıdan 5 ms sonra keser', () => {
    const gate = 0.05;
    const { channels, sampleRate } = drum({ model: 'hat', open: 1, gateSeconds: gate });
    expect(Math.abs(channels[0].length - (gate + CHOKE_FADE_SECONDS) * sampleRate)).toBeLessThan(1);
    expect(Math.abs(channels[0][channels[0].length - 1])).toBeLessThan(1e-6);
  });

  it('açık hat kapalıdan uzun; tom perdesi tune ile oktav kayar', () => {
    expect(drumSeconds(resolveDrum({ model: 'hat', open: 1 }))).toBeGreaterThan(
      4 * drumSeconds(resolveDrum({ model: 'hat', open: 0 })),
    );
    const low = drum({ model: 'tom', tune: 0 });
    const high = drum({ model: 'tom', tune: 12 });
    const from = Math.round(0.15 * low.sampleRate);
    const f0 = peakFrequency(low.channels[0], low.sampleRate, from, 8192, [50, 400]);
    const f1 = peakFrequency(high.channels[0], high.sampleRate, from, 8192, [50, 400]);
    expect(f1 / f0).toBeGreaterThan(1.9);
    expect(f1 / f0).toBeLessThan(2.1);
  });

  it('kick tabanı 50 Hz civarına iner (perde zarfı söndükten sonra)', () => {
    const { channels, sampleRate } = drum({ model: 'kick' });
    const f = peakFrequency(channels[0], sampleRate, Math.round(0.2 * sampleRate), 8192, [20, 200]);
    expect(f).toBeGreaterThan(45);
    expect(f).toBeLessThan(56);
  });

  it('geçersiz model, aralık dışı makro ve hat dışı açıklık adıyla reddedilir', () => {
    expect(() => resolveDrum({ model: 'gong' })).toThrow(AudioParamError);
    expect(() => resolveDrum({ model: 'kick', decay: 1.5 })).toThrow(/decay/);
    expect(() => resolveDrum({ model: 'kick', open: 0.5 })).toThrow(/yalnız hat/);
    expect(() => resolveDrum({ model: 'kick', extra: 1 })).toThrow(AudioParamError);
  });

  it('taslak kalite iç aşırı örneklemeyi kapatır; uzunluk aynı kalır', () => {
    const final = drum({ model: 'hat' });
    const draft = withRenderSession({ quality: 'draft' }, () => drum({ model: 'hat' }));
    expect(draft.channels[0].length).toBe(final.channels[0].length);
    expect(hashPcm(draft.channels, draft.sampleRate)).not.toBe(
      hashPcm(final.channels, final.sampleRate),
    );
  });
});

describe('davul makroları: yön iddiaları sesin kendisinde ölçülür', RENDER_BLOCK, () => {
  const centroid = (p: DrumParams) => analyze(p).a.spectral.centroidHz ?? 0;
  const decay40 = (p: DrumParams) => analyze(p).a.temporal.decay40Seconds ?? 0;
  const flatness = (p: DrumParams) => analyze(p).a.spectral.flatness ?? 0;
  const crest = (p: DrumParams) => analyze(p).a.level.crestFactorDb ?? 0;

  it.each(DRUM_MODELS)('%s: velocity ve ton parlaklığı, decay sönümü artırır', (model) => {
    expect(isStrictlyMonotone(sweep(model, 'velocity', [0.2, 0.6, 1], centroid), 1)).toBe(true);
    expect(isStrictlyMonotone(sweep(model, 'tone', [0.1, 0.5, 0.9], centroid), 1)).toBe(true);
    expect(isStrictlyMonotone(sweep(model, 'decay', [0.1, 0.5, 0.9], decay40), 1)).toBe(true);
  });

  it.each(DRUM_MODELS)('%s: attack vuruşu sivriltir, drive sıkıştırır', (model) => {
    expect(isStrictlyMonotone(sweep(model, 'attack', [0.1, 0.5, 0.9], earlyCrest), 1)).toBe(true);
    expect(isStrictlyMonotone(sweep(model, 'drive', [0, 0.4, 0.9], crest), -1)).toBe(true);
  });

  it.each(['snare', 'clap', 'hat', 'cymbal', 'perc'] as const)(
    '%s: noise çarpanı spektral düzlüğü artırır',
    (model) => {
      expect(isStrictlyMonotone(sweep(model, 'noise', [0.3, 1, 1.8], flatness), 1)).toBe(true);
    },
  );
});
