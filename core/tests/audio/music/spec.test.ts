import { describe, expect, it } from 'vitest';
import {
  assertEngineCompatible,
  barDurationSeconds,
  barsToFrames,
  MASTERING_PATHS,
  MusicEngine,
  MUSIC_RUNTIME_CAPABILITIES,
  toMusicTrack,
  validateMusicAssetSpec,
  type MusicAssetSpecV1,
} from '../../../src/audio/music';
import { FakeAudioContext } from './mock-audio';

const SAMPLE_RATE = 44100;
const BPM = 112;
const BARS = 4;
const FRAMES = barsToFrames(BARS, BPM, 4, SAMPLE_RATE);

function adaptiveSpec(overrides: Partial<MusicAssetSpecV1> = {}): MusicAssetSpecV1 {
  return {
    schema: 'MusicAssetSpecV1',
    musicId: 'demo-adaptive',
    bpm: BPM,
    meter: [4, 4],
    bars: BARS,
    sampleRate: SAMPLE_RATE,
    frames: FRAMES,
    playback: 'adaptiveLoop',
    loop: { startBar: 0, endBar: BARS },
    runtimeGain: 1,
    mastering: { path: 'stem-linear', gainDb: 0.5, integratedLufs: -16, truePeakDbtp: -4 },
    stems: [
      {
        id: 'bed',
        file: 'assets/music/demo/bed.ogg',
        frames: FRAMES,
        gainMap: {
          intensity: [
            { threshold: 0, gain: 0.85 },
            { threshold: 1, gain: 1 },
          ],
        },
      },
      {
        id: 'pulse',
        file: 'assets/music/demo/pulse.ogg',
        frames: FRAMES,
        gainMap: {
          intensity: [
            { threshold: 0, gain: 0 },
            { threshold: 0.6, gain: 0.9 },
            { threshold: 1, gain: 1 },
          ],
        },
      },
      {
        id: 'lead',
        file: 'assets/music/demo/lead.ogg',
        frames: FRAMES,
        gainMap: {
          intensity: [
            { threshold: 0, gain: 0 },
            { threshold: 0.8, gain: 0.8 },
            { threshold: 1, gain: 1 },
          ],
        },
      },
    ],
    transitions: [],
    engine: { compressor: false },
    states: [
      { id: 'calm', intensity: 0 },
      { id: 'peak', intensity: 1 },
    ],
    ...overrides,
  } as MusicAssetSpecV1;
}

describe('MusicAssetSpecV1', () => {
  it('ölçüden kareye çevirim tek yerde ve yuvarlamalıdır', () => {
    expect(barsToFrames(4, 96, 4, 44100)).toBe(441000);
    expect(barsToFrames(4, 112, 4, 44100)).toBe(378000);
    // 4 ölçü × 4 vuruş / 112 bpm = 8.571428… sn; yuvarlama tek noktadadır.
    expect(barsToFrames(4, 112, 4, 44100)).toBe(Math.round(barDurationSeconds(112, 4) * 4 * 44100));
  });

  it('geçerli spec kabul edilir', () => {
    const spec = adaptiveSpec();
    expect(validateMusicAssetSpec(spec)).toBe(spec);
  });

  it.each([
    ['şema', { schema: 'MusicAssetSpecV2' }],
    ['çalma modeli', { playback: 'stream' }],
    [
      'mastering yolu',
      { mastering: { path: 'loop-cyclic', gainDb: 0, integratedLufs: -16, truePeakDbtp: -2 } },
    ],
    ['kare sayısı', { frames: FRAMES + 12 }],
    ['stem sayısı', { stems: [] }],
  ])('%s hatalıysa reddedilir', (_label, patch) => {
    expect(() => validateMusicAssetSpec(adaptiveSpec(patch as Partial<MusicAssetSpecV1>))).toThrow(
      TypeError,
    );
  });

  it('adaptiveLoop üç stemden az olamaz', () => {
    const spec = adaptiveSpec();
    const trimmed = { ...spec, stems: spec.stems.slice(0, 2) };
    expect(() => validateMusicAssetSpec(trimmed)).toThrow(/3 stem/);
  });

  it('tek seferlik cue kuyruk taşıyabilir, loop taşıyamaz', () => {
    const oneShot = adaptiveSpec({
      playback: 'playlistOneShot',
      mastering: {
        path: MASTERING_PATHS.playlistOneShot,
        gainDb: 0,
        integratedLufs: -15,
        truePeakDbtp: -2,
      },
      frames: FRAMES + 40000,
      loop: undefined,
      states: undefined,
      stems: [{ id: 'main', file: 'assets/music/demo/mix.ogg', frames: FRAMES + 40000 }],
    });
    expect(validateMusicAssetSpec(oneShot).frames).toBe(FRAMES + 40000);
    const loop = adaptiveSpec({
      playback: 'loop',
      mastering: { path: MASTERING_PATHS.loop, gainDb: 0, integratedLufs: -16, truePeakDbtp: -2 },
      frames: FRAMES + 1,
      stems: [{ id: 'main', file: 'assets/music/demo/mix.ogg', frames: FRAMES }],
    });
    expect(() => validateMusicAssetSpec(loop)).toThrow(/örnek eder/);
  });

  it('track ölçüden türetilmiş loop saniyelerini taşır', () => {
    const track = toMusicTrack(adaptiveSpec(), { resolve: (file) => `/pkg/${file}` });
    expect(track.id).toBe('demo-adaptive');
    expect(track.bpm).toBe(BPM);
    expect(track.loopStart).toBe(0);
    expect(track.loopEnd).toBeCloseTo(barDurationSeconds(BPM, 4) * BARS, 9);
    expect(track.stems.map((s) => s.src)).toEqual([
      '/pkg/assets/music/demo/bed.ogg',
      '/pkg/assets/music/demo/pulse.ogg',
      '/pkg/assets/music/demo/lead.ogg',
    ]);
    expect(track.stems.every((s) => s.loop === true)).toBe(true);
    expect(track.defaultState).toEqual({ intensity: 0 });
  });

  it('tek seferlik cue loop etmez', () => {
    const track = toMusicTrack(
      adaptiveSpec({
        playback: 'playlistOneShot',
        mastering: {
          path: MASTERING_PATHS.playlistOneShot,
          gainDb: 0,
          integratedLufs: -15,
          truePeakDbtp: -2,
        },
        loop: undefined,
        stems: [{ id: 'main', file: 'm.ogg', frames: FRAMES }],
        states: undefined,
      }),
      { resolve: (file) => file },
    );
    expect(track.stems[0].loop).toBe(false);
    expect(track.loopStart).toBeUndefined();
  });

  it('kompresör beyanı motorla uyuşmazsa hata verir', () => {
    const spec = adaptiveSpec();
    expect(() => assertEngineCompatible(spec, { compressor: false })).not.toThrow();
    expect(() => assertEngineCompatible(spec, {})).toThrow(/kompresör/);
    expect(() => assertEngineCompatible(spec, { compressor: true })).toThrow(/kompresör/);
  });

  it('çalışma zamanı kabiliyetleri tek yerde beyan edilir', () => {
    expect(MUSIC_RUNTIME_CAPABILITIES.transitions).toEqual([
      'crossfade',
      'fade-stop',
      'playlist-gap',
    ]);
    expect(MUSIC_RUNTIME_CAPABILITIES.stingers).toBe(false);
    expect(MUSIC_RUNTIME_CAPABILITIES.sectionJump).toBe(false);
  });
});

describe('spec → motor', () => {
  function buffers(context: FakeAudioContext, frames: number): AudioBuffer {
    const buffer = context.createBuffer(2, frames, SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) channel[i] = Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE);
    return buffer as unknown as AudioBuffer;
  }

  it('yoğunluk değişimi stemleri YENİDEN BAŞLATMADAN seviyelendirir', async () => {
    const context = new FakeAudioContext();
    const spec = adaptiveSpec();
    const track = toMusicTrack(spec, { resolve: (file) => file });
    const buffer = buffers(context, 4410);
    const engine = new MusicEngine({
      audioContext: context as unknown as AudioContext,
      compressor: spec.engine.compressor,
    });
    assertEngineCompatible(spec, { compressor: spec.engine.compressor });
    await engine.loadTrack({
      ...track,
      stems: track.stems.map((stem) => ({ ...stem, src: undefined, buffer })),
    });
    await engine.play(spec.musicId, { state: { intensity: 0 } });

    const active = (
      engine as unknown as {
        activeStems: Map<
          string,
          {
            stem: { id: string };
            source?: object;
            startTime: number;
            gain: { gain: { value: number } };
          }
        >;
      }
    ).activeStems;
    const sources = [...active.values()].map((entry) => entry.source);
    const startTimes = [...active.values()].map((entry) => entry.startTime);
    expect(sources).toHaveLength(3);
    expect(new Set(startTimes).size).toBe(1);

    engine.setIntensity(1, 0);
    const after = [...active.values()];
    expect(after.map((entry) => entry.source)).toEqual(sources);
    expect(after.map((entry) => entry.startTime)).toEqual(startTimes);
    const gains = Object.fromEntries(after.map((entry) => [entry.stem.id, entry.gain.gain.value]));
    expect(gains.bed).toBeCloseTo(1, 5);
    expect(gains.pulse).toBeCloseTo(1, 5);
    expect(gains.lead).toBeCloseTo(1, 5);

    engine.setIntensity(0, 0);
    const quiet = Object.fromEntries(
      [...active.values()].map((entry) => [entry.stem.id, entry.gain.gain.value]),
    );
    expect(quiet.bed).toBeCloseTo(0.85, 5);
    expect(quiet.pulse).toBeCloseTo(0, 5);
    expect(quiet.lead).toBeCloseTo(0, 5);
  });
});
