import { describe, expect, it } from 'vitest';
import { barsToFrames } from '@volstudio/core/audio/music';
import {
  checkStemSync,
  crossCorrelationLag,
  MAX_SYNC_LAG,
  SYNC_METHOD,
} from '../../src/analysis/sync';
import { AudioParamError } from '../../src/guard/errors';
import {
  buildMusicAssetSpec,
  planAdaptive,
  planSingle,
  qaIntensities,
  renderAndPlan,
  specFrames,
  stemParityResidual,
  STEM_PARITY_FLOOR_DBFS,
} from '../../src/music/bundle';
import {
  applyMastering,
  cyclicLoudness,
  DEFAULT_MUSIC_LUFS,
  masteringPathOf,
  measureMix,
  planMastering,
  validateMasteringPlan,
} from '../../src/music/mastering';
import { validateMusicProgram } from '../../src/music/program';
import { estimateScoreCost, loopFrames, renderScoreRaw } from '../../src/music/render';
import { expandProgram } from '../../src/music/score';
import { renderMusicStem, REFERENCE_MIX_ID, validateMusicStemProgram } from '../../src/music/stem';
import { hashPcm } from '../../src/protocol/canonical';
import { Timeline } from '../../src/arrange';
import { getPreset } from '../../src/presets';
import { unitAdaptiveProgram, unitProgram } from './fixtures';

/*
 * Müzik testleri GERÇEK ses render eder; kapsam ölçümü (v8 + AST yeniden
 * eşleme) sentezi birkaç kat yavaşlatır ve 5 saniyelik varsayılan süre
 * dolar. Süre sınırı bu yüzden blok başına açıkça verilir — ölçülen bir
 * kısıt, keyfi bir sayı değil.
 */
const HEAVY = { timeout: 120_000 };

const program = () => validateMusicProgram(unitProgram());
const adaptive = () => validateMusicProgram(unitAdaptiveProgram());

describe('score render', HEAVY, () => {
  it('loop uzunluğu ölçüden TEK dönüşümle gelir', () => {
    const score = expandProgram(program());
    const rendered = renderScoreRaw(score, { playback: 'loop' });
    expect(rendered.frames).toBe(loopFrames(score));
    expect(rendered.frames).toBe(
      barsToFrames(score.bars, score.bpm, score.beatsPerBar, score.sampleRate),
    );
    expect(rendered.channels).toHaveLength(2);
  });

  it('aynı score aynı örnekleri verir', () => {
    const score = expandProgram(program());
    const a = renderScoreRaw(score, { playback: 'loop' });
    const b = renderScoreRaw(score, { playback: 'loop' });
    expect(hashPcm(a.channels, a.sampleRate)).toBe(hashPcm(b.channels, b.sampleRate));
  });

  it('tek seferlik cue kuyruk alır ve sondaki sessizliği kırpılır', () => {
    const cue = validateMusicProgram(unitProgram({ playback: 'playlistOneShot' }));
    const score = expandProgram(cue);
    const rendered = renderScoreRaw(score, { playback: 'playlistOneShot' });
    const lastEventEnd = Math.max(...score.events.map((e) => e.beat + e.beats)) * (60 / score.bpm);
    const untrimmed = Math.ceil((lastEventEnd + 3) * score.sampleRate);
    // Kırpma NOTANIN nominal sonuna değil, DUYULUR içeriğin sonuna bakar:
    // sönümlenen bir akor yazılı süresinden önce zeminin altına iner.
    expect(rendered.frames).toBeLessThan(untrimmed);
    expect(rendered.frames).not.toBe(loopFrames(score));
    expect(rendered.frames).toBeGreaterThan(score.sampleRate);
  });

  it('stem süzgeci ham mix’i böler ve toplamları mix’e eşittir', () => {
    const score = expandProgram(adaptive());
    const reference = renderScoreRaw(score, { playback: 'adaptiveLoop' });
    const stems = ['bed', 'pulse', 'lead'].map((stem) => ({
      id: stem,
      channels: renderScoreRaw(score, { playback: 'adaptiveLoop', stem }).channels,
    }));
    expect(stemParityResidual(stems, reference.channels)).toBeLessThanOrEqual(
      STEM_PARITY_FLOOR_DBFS,
    );
  });

  it('maliyet tahmini render’dan önce ölçülür', () => {
    const score = expandProgram(program());
    const cost = estimateScoreCost(score, { playback: 'loop' });
    expect(cost.peakBytes).toBeGreaterThan(0);
    expect(cost.workUnits).toBeGreaterThan(0);
  });

  it('Timeline aynı ham yolu kullanır ve çıktısı değişmez', () => {
    const timeline = new Timeline({ bpm: 120, beatsPerBar: 4, timingJitter: 0, velocityJitter: 0 });
    timeline.note({
      instrument: (frequency?: number, duration?: number) =>
        getPreset('warmKeys', frequency, duration),
      note: 'A3',
      bar: 0,
      beats: 1,
    });
    const first = timeline.render({ tailSeconds: 0.5 });
    const second = timeline.render({ tailSeconds: 0.5 });
    expect(hashPcm(first.channels, first.sampleRate)).toBe(
      hashPcm(second.channels, second.sampleRate),
    );
  });
});

describe('mastering yolları', HEAVY, () => {
  it('çalma modeli yolu belirler', () => {
    expect(masteringPathOf('loop')).toBe('loop-cyclic');
    expect(masteringPathOf('playlistOneShot')).toBe('one-shot-limited');
    expect(masteringPathOf('adaptiveLoop')).toBe('stem-linear');
  });

  it('loop yüksekliği döngüsel ölçülür', () => {
    const score = expandProgram(program());
    const rendered = renderScoreRaw(score, { playback: 'loop' });
    const cyclic = cyclicLoudness(rendered.channels, rendered.sampleRate);
    expect(Number.isFinite(cyclic)).toBe(true);
    expect(
      measureMix(rendered.channels, rendered.sampleRate, 'loop-cyclic').integratedLufs,
    ).toBeCloseTo(Number(cyclic.toFixed(3)), 3);
  });

  it('stem yolunda sınırlayıcı ve tavan YOKTUR', () => {
    const plan = planMastering({
      playback: 'adaptiveLoop',
      targetLufs: -16,
      measuredLufs: -20,
      maxCombinationPeak: 0.5,
      maxCombinationTruePeakDb: -6,
    });
    expect(plan.limiter).toBeNull();
    expect(plan.ceiling).toBeNull();
    expect(plan.trimSilence).toBe(false);
  });

  it('tepe payı kazancı düşürür, sinyali ezmez', () => {
    const loud = planMastering({
      playback: 'adaptiveLoop',
      targetLufs: -10,
      measuredLufs: -30,
      maxCombinationPeak: 0.95,
      maxCombinationTruePeakDb: -0.5,
    });
    expect(loud.gainDb).toBeLessThanOrEqual(0);
  });

  it('ölçüm yoksa kazanç uygulanmaz', () => {
    const silent = planMastering({
      playback: 'loop',
      targetLufs: -16,
      measuredLufs: Number.NEGATIVE_INFINITY,
    });
    expect(silent.gainDb).toBe(0);
  });

  it('plan belgesi doğrulanır', () => {
    const plan = planMastering({ playback: 'loop', targetLufs: -16, measuredLufs: -20 });
    expect(validateMasteringPlan(plan, 'm')).toEqual(plan);
    expect(() => validateMasteringPlan({ ...plan, path: 'stem-linear' }, 'm')).not.toThrow();
    expect(() => validateMasteringPlan({ ...plan, schema: 'X' }, 'm')).toThrow(AudioParamError);
    expect(() => validateMasteringPlan({ ...plan, trimSilence: 'evet' }, 'm')).toThrow(
      AudioParamError,
    );
  });

  it('uygulanan plan kanalları YERİNDE değiştirir', () => {
    const score = expandProgram(program());
    const rendered = renderScoreRaw(score, { playback: 'loop' });
    const before = measureMix(rendered.channels, rendered.sampleRate, 'loop-cyclic');
    applyMastering(rendered.channels, rendered.sampleRate, {
      schema: 'MusicMasteringPlanV1',
      path: 'loop-cyclic',
      targetLufs: -16,
      gainDb: -6,
      limiter: null,
      ceiling: null,
      trimSilence: false,
      fadeOutSeconds: 0,
    });
    const after = measureMix(rendered.channels, rendered.sampleRate, 'loop-cyclic');
    expect(after.integratedLufs).toBeLessThan(before.integratedLufs);
  });
});

describe('stem paketi ve QA', HEAVY, () => {
  it('tek asset yolunda kazanç politika aralığına çeker', () => {
    const music = program();
    const { plan } = renderAndPlan(music, expandProgram(music), DEFAULT_MUSIC_LUFS);
    expect(plan.mastering.path).toBe('loop-cyclic');
    expect(plan.qa.states).toHaveLength(1);
    expect(plan.qa.states[0].integratedLufs).toBeGreaterThan(-20);
    expect(plan.qa.states[0].integratedLufs).toBeLessThan(-12);
    expect(plan.qa.verdict.pass).toBe(true);
  });

  it('adaptive QA beyan edilen state ve eşik köşelerini ölçer', () => {
    const music = adaptive();
    const points = qaIntensities(music);
    expect(points.map((p) => p.intensity)).toEqual([0, 0.6, 0.8, 1]);
    const { plan } = renderAndPlan(music, expandProgram(music), DEFAULT_MUSIC_LUFS);
    expect(plan.mastering.path).toBe('stem-linear');
    expect(plan.qa.states).toHaveLength(points.length);
    expect(plan.qa.parity.ok).toBe(true);
    expect(plan.qa.states.every((state) => state.samplePeak <= 0.999)).toBe(true);
    expect(plan.qa.states[0].gains.pulse).toBe(0);
    expect(plan.qa.states[plan.qa.states.length - 1].gains.pulse).toBe(1);
  });

  it('adaptive olmayan programda tek "fixed" durum ölçülür', () => {
    expect(qaIntensities(program())).toEqual([{ id: 'fixed', intensity: 1 }]);
  });

  it('en kısık state duyulur kalmalı', () => {
    const music = adaptive();
    const { plan } = renderAndPlan(music, expandProgram(music), DEFAULT_MUSIC_LUFS);
    expect(plan.qa.states[0].integratedLufs).toBeGreaterThan(-60);
  });

  it('parite ölçüsü bozuk toplamı yakalar', () => {
    const channels = [new Float32Array([0.1, 0.2, 0.3]), new Float32Array([0.1, 0.2, 0.3])];
    const stems = [
      {
        id: 'a',
        channels: [new Float32Array([0.05, 0.1, 0.15]), new Float32Array([0.05, 0.1, 0.15])],
      },
      {
        id: 'b',
        channels: [new Float32Array([0.05, 0.1, 0.15]), new Float32Array([0.05, 0.1, 0.15])],
      },
    ];
    expect(stemParityResidual(stems, channels)).toBeLessThanOrEqual(STEM_PARITY_FLOOR_DBFS);
    const drifted = [
      stems[0],
      { id: 'b', channels: stems[1].channels.map((c) => c.map((v) => v * 1.5)) },
    ];
    expect(stemParityResidual(drifted, channels)).toBeGreaterThan(STEM_PARITY_FLOOR_DBFS);
  });

  it('spec ölçü→kare sözleşmesini taşır', () => {
    const music = adaptive();
    const score = expandProgram(music);
    const { reference, plan } = renderAndPlan(music, score, DEFAULT_MUSIC_LUFS);
    const frames = specFrames(music, reference.frames);
    const spec = buildMusicAssetSpec({
      program: music,
      score,
      mastering: plan.mastering,
      measured: { integratedLufs: -16, truePeakDbtp: -3 },
      frames,
      files: Object.fromEntries(
        music.stems.map((stem) => [stem.id, `assets/music/x/${stem.id}.ogg`]),
      ),
      stemFrames: Object.fromEntries(music.stems.map((stem) => [stem.id, frames])),
      referenceMix: { file: 'assets/music/x/mix.ogg', frames },
    });
    expect(spec.frames).toBe(
      barsToFrames(music.bars, music.tempo.bpm, music.meter[0], music.sampleRate),
    );
    expect(spec.loop).toEqual({ startBar: 0, endBar: music.bars });
    expect(spec.stems.map((s) => s.id)).toEqual(['bed', 'pulse', 'lead']);
    expect(spec.stems[0].gainMap?.intensity).toHaveLength(2);
    expect(spec.engine.compressor).toBe(false);
    expect(spec.states).toHaveLength(2);
  });

  it('tek seferlik cue spec’i loop taşımaz', () => {
    const cue = validateMusicProgram(unitProgram({ playback: 'playlistOneShot' }));
    const score = expandProgram(cue);
    const spec = buildMusicAssetSpec({
      program: cue,
      score,
      mastering: planMastering({ playback: 'playlistOneShot', targetLufs: -15, measuredLufs: -18 }),
      measured: { integratedLufs: -15, truePeakDbtp: -2 },
      frames: 123456,
      files: { main: 'assets/music/x/mix.ogg' },
      stemFrames: { main: 123456 },
    });
    expect(spec.loop).toBeUndefined();
    expect(specFrames(cue, 123456)).toBe(123456);
  });

  it('planSingle ve planAdaptive aynı arayüzü döner', () => {
    const music = program();
    const score = expandProgram(music);
    const rendered = renderScoreRaw(score, { playback: 'loop' });
    const single = planSingle({
      program: music,
      reference: rendered.channels,
      sampleRate: rendered.sampleRate,
      targetLufs: DEFAULT_MUSIC_LUFS,
    });
    expect(single.qa.states[0].state).toBe('fixed');
    const adaptiveMusic = adaptive();
    const adaptiveScore = expandProgram(adaptiveMusic);
    const adaptiveRender = renderScoreRaw(adaptiveScore, { playback: 'adaptiveLoop' });
    const stems = adaptiveMusic.stems.map((stem) => ({
      id: stem.id,
      channels: renderScoreRaw(adaptiveScore, { playback: 'adaptiveLoop', stem: stem.id }).channels,
    }));
    const plan = planAdaptive({
      program: adaptiveMusic,
      stems,
      reference: adaptiveRender.channels,
      sampleRate: adaptiveRender.sampleRate,
      targetLufs: DEFAULT_MUSIC_LUFS,
    });
    expect(plan.qa.states.length).toBeGreaterThan(1);
  });
});

describe('stem programı', HEAVY, () => {
  const plan = planMastering({ playback: 'loop', targetLufs: -16, measuredLufs: -20 });

  it('belge doğrulanır ve deterministik render eder', () => {
    const document = {
      schema: 'MusicStemProgramV1',
      stem: REFERENCE_MIX_ID,
      mastering: plan,
      music: unitProgram(),
    };
    expect(validateMusicStemProgram(document).stem).toBe(REFERENCE_MIX_ID);
    const first = renderMusicStem(document);
    const second = renderMusicStem(document);
    expect(hashPcm(first.channels, first.sampleRate)).toBe(
      hashPcm(second.channels, second.sampleRate),
    );
    expect(first.seed).toBe(7);
    expect(first.cost.workUnits).toBeGreaterThan(0);
  });

  it('yanlış mastering yolu belgede reddedilir', () => {
    const document = {
      schema: 'MusicStemProgramV1',
      stem: REFERENCE_MIX_ID,
      mastering: { ...plan, path: 'stem-linear' },
      music: unitProgram(),
    };
    expect(() => validateMusicStemProgram(document)).toThrow(/loop-cyclic olmalı/);
  });

  it('tanımsız stem reddedilir', () => {
    expect(() =>
      validateMusicStemProgram({
        schema: 'MusicStemProgramV1',
        stem: 'yok',
        mastering: plan,
        music: unitProgram(),
      }),
    ).toThrow(/tanımlı stem/);
  });

  it('stem seçimi yalnız o şeritleri render eder', () => {
    const adaptivePlan = planMastering({
      playback: 'adaptiveLoop',
      targetLufs: -16,
      measuredLufs: -20,
    });
    const base = {
      schema: 'MusicStemProgramV1',
      mastering: adaptivePlan,
      music: unitAdaptiveProgram(),
    };
    const bed = renderMusicStem({ ...base, stem: 'bed' });
    const mix = renderMusicStem({ ...base, stem: REFERENCE_MIX_ID });
    expect(hashPcm(bed.channels, bed.sampleRate)).not.toBe(hashPcm(mix.channels, mix.sampleRate));
    expect(bed.channels[0].length).toBe(mix.channels[0].length);
  });
});

describe('kodlanmış hiza', HEAVY, () => {
  const reference = Float32Array.from({ length: 2000 }, (_, i) =>
    Math.sin((2 * Math.PI * 5 * i) / 2000),
  );

  it('yöntem adıyla beyan edilir', () => {
    expect(SYNC_METHOD).toBe('cross-correlation-v1');
    expect(MAX_SYNC_LAG).toBeGreaterThan(0);
  });

  it('hizalı sinyalde gecikme sıfırdır', () => {
    expect(crossCorrelationLag(reference, reference)).toBe(0);
    expect(checkStemSync('a', reference, reference, reference.length).ok).toBe(true);
  });

  it('bir örneklik kayma yakalanır', () => {
    const shifted = new Float32Array(reference.length);
    shifted.set(reference.subarray(0, reference.length - 1), 1);
    const check = checkStemSync('a', reference, shifted, reference.length);
    expect(check.lagSamples).toBe(1);
    expect(check.ok).toBe(false);
    expect(check.detail).toContain('gecikme 1');
  });

  it('kare sayısı farkı da hizasızlıktır', () => {
    const longer = new Float32Array(reference.length + 5);
    longer.set(reference, 0);
    const check = checkStemSync('a', reference, longer, reference.length);
    expect(check.frameDelta).toBe(5);
    expect(check.ok).toBe(false);
  });

  it('sessiz sinyalin hizası yoktur', () => {
    const silence = new Float32Array(100);
    expect(crossCorrelationLag(silence, silence)).toBe(0);
  });
});
