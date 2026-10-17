import { describe, expect, it } from 'vitest';
import { analyzeAudio } from '../../src/analysis/report';
import { renderProgram, renderProgramLayers } from '../../src/program/render';
import type { AcousticProgramV1 } from '../../src/program/schema';
import { VOCAL_FAMILIES } from '../fixtures/vocalFamilies';
import { harmonicPitch, interharmonicRatio, peakFrequency } from '../support/measure';

/**
 * Aynı kaynak (`source.glottal`) ve aynı ayrı formant rezonatörü; yalnız
 * PROGRAM değişir. Testler fiziksel/spektral özellikleri ölçer — "gerçek bir
 * kedi/köpek gibi" iddiası dinleme olmadan yapılmaz ve burada yoktur.
 */
const RATE = 48000;
const voice = (program: AcousticProgramV1) =>
  renderProgramLayers(program).get('voice') as Float32Array;
const window = (x: Float32Array, seconds: number, size = 4096) => {
  const from = Math.max(0, Math.round(seconds * RATE) - size / 2);
  return x.subarray(from, from + size);
};
const report = (x: Float32Array) => analyzeAudio([x], RATE, 'source-pcm');
const { cat, bark, alien } = VOCAL_FAMILIES;

describe('organik vokal kaynağı: üç program ailesi', () => {
  it('üç aile de AYNI kaynak ilkeli ve ayrı formant düğümüyle kurulur', () => {
    for (const program of [cat, bark, alien]) {
      const layer = program.layers.find((l) => l.name === 'voice');
      expect(layer?.source.primitive).toBe('source.glottal');
      expect(layer?.resonators?.some((r) => r.primitive === 'resonator.formant')).toBe(true);
      const again = voice(program);
      expect(voice(program).every((v, i) => v === again[i])).toBe(true);
    }
  });

  it('cat-like: perde yükselip iner (orta > uçlar), formant bölgesi zamanla düşer', () => {
    const x = voice(cat);
    const [start, middle, end] = [0.08, 0.35, 0.8].map((s) =>
      harmonicPitch(window(x, s, 8192), RATE, 250, 900),
    );
    expect(middle).toBeGreaterThan(start * 1.25);
    expect(middle).toBeGreaterThan(end * 1.25);
    const early = report(window(x, 0.2, 8192)).spectral.centroidHz ?? 0;
    const late = report(window(x, 0.8, 8192)).spectral.centroidHz ?? 0;
    expect(late).toBeLessThan(early);
  });

  it('bark-like: kısa ve ani başlangıçlı, cat-like’tan pürüzlü ve gürültülü', () => {
    const x = renderProgram(bark).channels[0];
    const measured = report(x);
    expect(bark.durationSeconds).toBeLessThan(0.5);
    expect(measured.temporal.attackSeconds ?? 1).toBeLessThanOrEqual(0.03);
    expect(measured.spectral.flatness ?? 0).toBeGreaterThan(
      report(renderProgram(cat).channels[0]).spectral.flatness ?? 0,
    );
    const steady = (program: AcousticProgramV1, f0: number) => {
      const clone = JSON.parse(JSON.stringify(program)) as AcousticProgramV1 & {
        gestures: Record<string, { points: [number, number][] }>;
      };
      clone.gestures.pitch.points = [[0, f0]];
      return interharmonicRatio(voice(clone), RATE, f0);
    };
    expect(steady(bark, 260)).toBeGreaterThan(5 * steady(cat, 260));
  });

  it('alien air-sac: pes (f₀ < 130 Hz), kese şiştikçe boşluk rezonansı düşer', () => {
    const x = voice(alien);
    expect(harmonicPitch(window(x, 0.6, 16384), RATE, 40, 300)).toBeLessThan(130);
    const sac = renderProgramLayers(alien).get('sac') as Float32Array;
    const early = peakFrequency(window(sac, 0.25, 8192), RATE, 0, 8192, [60, 1200]);
    const late = peakFrequency(window(sac, 1.3, 8192), RATE, 0, 8192, [60, 1200]);
    expect(late).toBeLessThan(early * 0.8);
    const bands = report(renderProgram(alien).channels[0]).spectral.bandsDb;
    expect(Math.max(bands.sub ?? -200, bands.low ?? -200)).toBeGreaterThan(bands.high ?? -200);
  });
});
