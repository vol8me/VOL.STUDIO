import { describe, expect, it } from 'vitest';
import {
  barDurationSeconds,
  barsToFrames,
  MusicEngine,
  MusicScheduler,
  toMusicTrack,
  validateMusicAssetSpec,
  type MusicAssetSpecV1,
  type MusicCue,
  type MusicTrack,
} from '../../../src/audio/music';
import { FakeAudioContext, type FakeAudioBufferSourceNode } from './mock-audio';

/**
 * Cue'lar (giriş, bitiş, stinger, geçiş) ölçü ızgarasına örnek-doğru
 * zamanlanır. 120 bpm 4/4: bir ölçü 2 sn. Motorun bakış payı 0.1 sn.
 */
const RATE = 44100;
const BAR = 2;

function buffer(context: FakeAudioContext, seconds: number): AudioBuffer {
  return context.createBuffer(1, Math.round(seconds * RATE), RATE);
}

function setup() {
  const context = new FakeAudioContext();
  const engine = new MusicEngine({
    audioContext: context as unknown as AudioContext,
    compressor: false,
  });
  const cue = (id: string, bars: number, seconds: number, extra: Partial<MusicCue> = {}) => ({
    id,
    bars,
    buffer: buffer(context, seconds),
    ...extra,
  });
  const track = (id: string, extra: Partial<MusicTrack> = {}): MusicTrack => ({
    id,
    bpm: 120,
    timeSignature: [4, 4],
    loopStart: 0,
    loopEnd: 4 * BAR,
    stems: [{ id: 'main', buffer: buffer(context, 4 * BAR) }],
    ...extra,
  });
  return { context, engine, cue, track };
}

/** Kaynağın `start(when)` anı (sahte düğüm onu saklar). */
const started = (source: FakeAudioBufferSourceNode) =>
  (source as unknown as { startTime?: number }).startTime;
const stopped = (source: FakeAudioBufferSourceNode) =>
  (source as unknown as { stopTime?: number }).stopTime;

describe('müzik cue’ları', () => {
  it('giriş çalarken loop girişin ölçü sayısı kadar sonra başlar', async () => {
    const { context, engine, cue, track } = setup();
    await engine.loadTrack(track('arcade', { intro: cue('intro', 2, 4.5) }));
    await engine.play('arcade');
    const [intro, loop] = context.createdSources;
    expect(started(intro)).toBeCloseTo(0.1, 9);
    expect(intro.loop).toBe(false);
    expect(started(loop)).toBeCloseTo(0.1 + 2 * BAR, 9);
    expect(loop.loop).toBe(true);
  });

  it('stinger sonraki ölçü ya da vuruş sınırında loop kesilmeden çalar', async () => {
    const { context, engine, cue, track } = setup();
    await engine.loadTrack(
      track('boss', { cues: [cue('hit', 1, 1.5), cue('tick', 1, 0.2, { align: 'beat' })] }),
    );
    await engine.play('boss');
    context.currentTime = 2.7;
    const whenBar = engine.playStinger('hit');
    expect(whenBar).toBeCloseTo(0.1 + 2 * BAR, 9);
    const whenBeat = engine.playStinger('tick');
    expect(whenBeat).toBeCloseTo(0.1 + 6 * 0.5, 9);
    expect(engine.playStinger('hit', { align: 'now' })).toBeCloseTo(2.8, 9);
    const loop = context.createdSources[0];
    expect(stopped(loop)).toBeUndefined();
    expect(() => engine.playStinger('yok')).toThrow(/cue yok/);
  });

  it('bitiş ölçü sınırında loop’un yerini alır; bitiş sönünce parça biter', async () => {
    const { context, engine, cue, track } = setup();
    await engine.loadTrack(track('arcade', { outro: cue('ending', 2, 4) }));
    await engine.play('arcade');
    const ended: string[] = [];
    engine.onTrackEnd((id) => ended.push(id));
    context.currentTime = 1;
    const when = engine.playOutro();
    expect(when).toBeCloseTo(0.1 + BAR, 9);
    const [loop, outro] = context.createdSources;
    expect(stopped(loop)).toBeCloseTo(when + 0.03, 9);
    expect(started(outro)).toBeCloseTo(when, 9);
    loop.simulateEnded();
    expect(ended).toEqual([]);
    outro.simulateEnded();
    expect(ended).toEqual(['arcade']);
    expect(engine.getCurrentState().playing).toBe(false);
  });

  it('bitiş sırasında stop gelirse bitiş bildirimi yapılmaz', async () => {
    const { context, engine, cue, track } = setup();
    await engine.loadTrack(track('arcade', { outro: cue('ending', 2, 4) }));
    await engine.play('arcade');
    const ended: string[] = [];
    engine.onTrackEnd((id) => ended.push(id));
    engine.playOutro();
    engine.stop({ fadeOut: 0 });
    context.createdSources[1].simulateEnded();
    expect(ended).toEqual([]);
  });

  it('geçiş cue’su ölçü sınırında başlar; hedef cue’nun ölçüsü kadar sonra girer', async () => {
    const { context, engine, cue, track } = setup();
    await engine.loadTrack(track('field', { cues: [cue('to-boss', 1, 2.5)] }));
    await engine.loadTrack(track('boss'));
    await engine.play('field');
    context.currentTime = 3;
    const start = await engine.transitionTo('boss', { cue: 'to-boss', state: { intensity: 1 } });
    const when = 0.1 + 2 * BAR;
    expect(start).toBeCloseTo(when + BAR, 9);
    const [field, transition, boss] = context.createdSources;
    expect(stopped(field)).toBeCloseTo(when + 0.03, 9);
    expect(started(transition)).toBeCloseTo(when, 9);
    expect(started(boss)).toBeCloseTo(start, 9);
    expect(engine.getCurrentState()).toMatchObject({ trackId: 'boss', playing: true });
    await expect(engine.transitionTo('field', { cue: 'yok' })).rejects.toThrow(/cue yok/);
  });

  it('çalan parça yokken cue çağrısı adıyla reddedilir', async () => {
    const { engine, cue, track } = setup();
    await engine.loadTrack(track('arcade', { outro: cue('ending', 2, 4) }));
    expect(() => engine.playOutro()).toThrow(/çalan parça yok/);
  });
});

describe('spec cue sözleşmesi', () => {
  const BPM = 120;
  function spec(overrides: Partial<MusicAssetSpecV1> = {}): MusicAssetSpecV1 {
    const frames = barsToFrames(4, BPM, 4, RATE);
    return {
      schema: 'MusicAssetSpecV1',
      musicId: 'arcade',
      bpm: BPM,
      meter: [4, 4],
      bars: 4,
      sampleRate: RATE,
      frames,
      playback: 'loop',
      loop: { startBar: 0, endBar: 4 },
      runtimeGain: 1,
      mastering: { path: 'loop-cyclic', gainDb: 0, integratedLufs: -16, truePeakDbtp: -2 },
      stems: [{ id: 'main', file: 'music/arcade/mix.ogg', frames }],
      transitions: [],
      engine: { compressor: false },
      cues: [
        { id: 'intro', kind: 'intro', file: 'music/arcade/intro.ogg', frames: 200000, bars: 2 },
        { id: 'ending', kind: 'outro', file: 'music/arcade/ending.ogg', frames: 180000, bars: 2 },
        {
          id: 'hit',
          kind: 'stinger',
          file: 'music/arcade/hit.ogg',
          frames: 60000,
          bars: 1,
          align: 'beat',
        },
      ],
      ...overrides,
    };
  }

  it('cue’lar track’e çevrilir; giriş ve bitiş ayrı alanlara gider', () => {
    const track = toMusicTrack(validateMusicAssetSpec(spec()), { resolve: (f) => `/pkg/${f}` });
    expect(track.intro).toEqual({ id: 'intro', src: '/pkg/music/arcade/intro.ogg', bars: 2 });
    expect(track.outro?.id).toBe('ending');
    expect(track.cues).toEqual([
      { id: 'hit', src: '/pkg/music/arcade/hit.ogg', bars: 1, align: 'beat' },
    ]);
  });

  it('6/8’de motorun ölçüsü spec’in ölçüsüyle aynıdır (bpm ölçü birimi başına)', () => {
    const frames = barsToFrames(4, 150, 6, RATE);
    const track = toMusicTrack(
      spec({
        bpm: 150,
        meter: [6, 8],
        frames,
        stems: [{ id: 'main', file: 'm.ogg', frames }],
        cues: [],
      }),
      { resolve: (f) => f },
    );
    const scheduler = new MusicScheduler(track.bpm, track.timeSignature);
    expect(scheduler.barDuration).toBeCloseTo(barDurationSeconds(150, 6), 12);
    expect(track.loopEnd).toBeCloseTo(4 * scheduler.barDuration, 12);
  });

  it('bozuk cue listesi adıyla reddedilir', () => {
    const [intro, ending, hit] = spec().cues ?? [];
    expect(() =>
      validateMusicAssetSpec(spec({ cues: [intro, { ...intro, id: 'intro2' }] })),
    ).toThrow(/en çok bir intro/);
    expect(() => validateMusicAssetSpec(spec({ cues: [hit, hit] }))).toThrow(/tekrar etti/);
    expect(() => validateMusicAssetSpec(spec({ cues: [{ ...ending, bars: 1.5 }] }))).toThrow(
      /tam ölçü/,
    );
    expect(() =>
      validateMusicAssetSpec(spec({ cues: [{ ...hit, kind: 'jump' as 'stinger' }] })),
    ).toThrow(/intro \| outro/);
  });
});
