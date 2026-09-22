import { describe, expect, it } from 'vitest';
import { evaluateCheck, validateCheck, type MechanicalCheckV1 } from '../../src/analysis/checks';
import { analyzeAudio } from '../../src/analysis/report';
import { AudioParamError } from '../../src/guard/errors';
import { renderProgram } from '../../src/program/render';

function audio(layers: unknown[], durationSeconds = 0.6, gestures?: unknown) {
  const r = renderProgram({
    schema: 'AcousticProgramV1',
    sampleRate: 48000,
    channels: 1,
    durationSeconds,
    seed: 2,
    ...(gestures ? { gestures } : {}),
    layers,
    master: { normalize: 'peak', peakDbfs: -3 },
  });
  return { audio: r, report: analyzeAudio(r.channels, r.sampleRate, 'source-pcm') };
}

const node = (primitive: string, params: Record<string, unknown> = {}) => ({
  primitive,
  version: 1,
  params,
});
const sweep = (points: [number, number][]) => ({
  f: { curve: 'curve.linear', version: 1, points },
});
const voice = (gesture: boolean) =>
  audio(
    [
      {
        name: 'v',
        source: node('source.glottal', {
          frequency: gesture ? { gesture: 'f' } : 300,
          jitter: 0,
          breath: 0,
        }),
      },
    ],
    0.6,
    gesture
      ? sweep([
          [0, 250],
          [0.3, 500],
          [0.6, 250],
        ])
      : undefined,
  );

function run(check: unknown, subject = voice(false)) {
  return evaluateCheck(validateCheck(check, 'c'), subject.audio, subject.report);
}

describe('mekanik denetim sözlüğü (MechanicalCheckV1)', () => {
  it.each([
    [{ kind: 'nope' }, 'c.kind'],
    [{ kind: 'descriptor', descriptor: 'loudness', min: 1 }, 'c.descriptor'],
    [{ kind: 'descriptor', descriptor: 'centroidHz' }, 'c'],
    [{ kind: 'descriptor', descriptor: 'centroidHz', min: 5, max: 1 }, 'c.max'],
    [{ kind: 'pitch', min: 100, window: [0.5, 0.2] }, 'c.window[1]'],
    [{ kind: 'band-dominance', dominant: 'mid', over: 'mid' }, 'c.over'],
    [{ kind: 'clipping', extra: 1 }, 'c.extra'],
    [{ kind: 'aperiodic' }, 'c.maxConfidence'],
  ])('%j → adlı hata (%s)', (check, path) => {
    try {
      validateCheck(check, 'c');
      throw new Error('reddedilmedi');
    } catch (error) {
      expect(error).toBeInstanceOf(AudioParamError);
      expect((error as AudioParamError).path).toBe(path);
    }
  });

  it('perde denetimi YIN ile ölçer; gürültüde ölçülemez ve düşer', () => {
    expect(run({ kind: 'pitch', min: 290, max: 310, minConfidence: 0.8 })).toMatchObject({
      pass: true,
    });
    const hiss = audio([{ name: 'n', source: node('source.noise') }]);
    expect(run({ kind: 'pitch', min: 20, max: 20000 }, hiss)).toMatchObject({
      pass: false,
      measured: null,
    });
    expect(run({ kind: 'aperiodic', maxConfidence: 0.3 }, hiss).pass).toBe(true);
    expect(run({ kind: 'aperiodic', maxConfidence: 0.3 }).pass).toBe(false);
  });

  it('perde konturu: yükselip düşen ses rise-fall geçer, sabit ses düşer', () => {
    const check: MechanicalCheckV1 = { kind: 'pitch-contour', shape: 'rise-fall', minRatio: 1.2 };
    expect(run(check, voice(true)).pass).toBe(true);
    expect(run(check, voice(false)).pass).toBe(false);
    expect(run({ kind: 'pitch-contour', shape: 'rising', minRatio: 1.2 }, voice(true)).pass).toBe(
      false,
    );
  });

  it('bant baskınlığı, kırpma, tık ve betimleyici aralığı ölçülen değeri raporlar', () => {
    const low = audio([{ name: 'l', source: node('source.oscillator', { frequency: 120 }) }]);
    expect(run({ kind: 'band-dominance', dominant: 'low', over: 'high' }, low).pass).toBe(true);
    expect(run({ kind: 'band-dominance', dominant: 'high', over: 'low' }, low).pass).toBe(false);
    expect(run({ kind: 'clipping' }, low)).toMatchObject({ pass: true, measured: 0 });
    expect(run({ kind: 'clicks', max: 0 }, low).pass).toBe(true);
    const centroid = run({ kind: 'descriptor', descriptor: 'centroidHz', max: 100 }, low);
    expect(centroid.pass).toBe(false);
    expect(centroid.reason).toMatch(/centroidHz/);
    const policy = run({ kind: 'asset-policy', assetClass: 'sfx' }, low);
    expect(policy.pass).toBe(false);
    expect(policy.reason).toMatch(/maxMomentary/);
  });

  it('darbe ve başlangıç hızı', () => {
    const train = audio(
      [
        {
          name: 'm',
          source: node('exciter.membrane', { rate: 30 }),
          resonators: [
            node('resonator.modal', { layout: 'membrane', frequency: 200, decay: 0.05 }),
          ],
        },
      ],
      1,
    );
    expect(run({ kind: 'pulse-rate', min: 27, max: 33 }, train).pass).toBe(true);
    expect(run({ kind: 'pulse-rate', min: 55, max: 65 }, train).pass).toBe(false);
    expect(run({ kind: 'onset-rate', min: 10 }, train).pass).toBe(true);
  });
});
