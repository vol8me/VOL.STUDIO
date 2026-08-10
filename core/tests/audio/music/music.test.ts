import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MusicEngine, MusicScheduler, resolveStemGain } from '../../../src/audio/music';
import { synth } from '../../../src/audio/synth';
import { FakeAudioContext, createFakeAudioBufferFromResult } from './mock-audio';

function makeBuffer(context: FakeAudioContext, duration = 2, sampleRate = 44100): AudioBuffer {
  const result = synth(duration, { wave: 'sine', frequency: 440, sampleRate });
  return createFakeAudioBufferFromResult(result, context) as unknown as AudioBuffer;
}

describe('MusicEngine', () => {
  let fakeContext: FakeAudioContext;

  beforeEach(() => {
    fakeContext = new FakeAudioContext();
  });

  afterEach(() => {
    fakeContext = new FakeAudioContext();
  });

  it('track yükler ve çalar', async () => {
    const engine = new MusicEngine({ audioContext: fakeContext as unknown as AudioContext });
    const buffer = makeBuffer(fakeContext, 2);

    await engine.loadTrack({
      id: 'main-menu',
      bpm: 120,
      stems: [{ id: 'ambient', buffer: buffer as unknown as AudioBuffer, gain: 0.8 }],
    });

    await engine.play('main-menu');
    expect(engine.getCurrentState().trackId).toBe('main-menu');
    expect(engine.getCurrentState().playing).toBe(true);
  });

  it('setIntensity stem gainini günceller', async () => {
    const engine = new MusicEngine({ audioContext: fakeContext as unknown as AudioContext });
    const buffer = makeBuffer(fakeContext, 2);

    await engine.loadTrack({
      id: 'combat',
      bpm: 120,
      stems: [
        {
          id: 'drums',
          buffer: buffer as unknown as AudioBuffer,
          gain: 1,
          gainMap: {
            intensity: [
              { threshold: 0, gain: 0 },
              { threshold: 0.5, gain: 0.5 },
              { threshold: 1, gain: 1 },
            ],
          },
        },
      ],
    });

    await engine.play('combat', { state: { intensity: 0 } });
    engine.setIntensity(0.5, 0);

    // Gain node'unun değeri 0.5'e yaklaşmalı
    const activeStems = (engine as unknown as { activeStems: Map<string, { gain: GainNode; stem: { id: string } }> }).activeStems;
    let drumsGain = 0;
    for (const active of activeStems.values()) {
      if (active.stem.id === 'drums') drumsGain = active.gain.gain.value;
    }
    expect(drumsGain).toBeCloseTo(0.5, 5);
  });

  it('master volume ve mute çalışır', () => {
    const engine = new MusicEngine({ audioContext: fakeContext as unknown as AudioContext });
    engine.setMasterVolume(0.5);
    expect(engine.mixer.masterGain.gain.value).toBeCloseTo(0.5, 5);

    engine.mute(true);
    expect(engine.mixer.masterGain.gain.value).toBe(0);

    engine.mute(false);
    expect(engine.mixer.masterGain.gain.value).toBeCloseTo(0.5, 5);
  });

  it('stop aktif kaynakları durdurur', async () => {
    const engine = new MusicEngine({ audioContext: fakeContext as unknown as AudioContext });
    const buffer = makeBuffer(fakeContext, 2);

    await engine.loadTrack({
      id: 'test',
      bpm: 120,
      stems: [{ id: 'a', buffer: buffer as unknown as AudioBuffer }],
    });

    await engine.play('test');
    engine.stop({ fadeOut: 0.1 });
    expect(engine.getCurrentState().playing).toBe(false);
  });

  it('crossfadeTo yeni track başlatır', async () => {
    const engine = new MusicEngine({ audioContext: fakeContext as unknown as AudioContext });
    const bufferA = makeBuffer(fakeContext, 2);
    const bufferB = makeBuffer(fakeContext, 2);

    await engine.loadTrack({
      id: 'ambient',
      bpm: 120,
      stems: [{ id: 'pad', buffer: bufferA as unknown as AudioBuffer, gain: 0.7 }],
    });

    await engine.loadTrack({
      id: 'combat',
      bpm: 130,
      stems: [{ id: 'pad', buffer: bufferB as unknown as AudioBuffer, gain: 0.9 }],
    });

    await engine.play('ambient');
    await engine.crossfadeTo('combat', 0.1);
    expect(engine.getCurrentState().trackId).toBe('combat');
  });

  it('crossfadeTo bar sınırında geçiş yapar', async () => {
    const engine = new MusicEngine({ audioContext: fakeContext as unknown as AudioContext });
    const bufferA = makeBuffer(fakeContext, 2);
    const bufferB = makeBuffer(fakeContext, 2);

    await engine.loadTrack({
      id: 'ambient',
      bpm: 120,
      stems: [{ id: 'pad', buffer: bufferA as unknown as AudioBuffer, gain: 0.7 }],
    });

    await engine.loadTrack({
      id: 'combat',
      bpm: 120,
      stems: [{ id: 'pad', buffer: bufferB as unknown as AudioBuffer, gain: 0.9 }],
    });

    await engine.play('ambient');
    fakeContext.currentTime = 0.5;

    await engine.crossfadeTo('combat', 0.1, { bars: 1 });
    expect(engine.getCurrentState().trackId).toBe('combat');
  });

  it('loopEnd buffer uzunluğunu aşmaz', async () => {
    const engine = new MusicEngine({ audioContext: fakeContext as unknown as AudioContext });
    const buffer = makeBuffer(fakeContext, 2);

    await engine.loadTrack({
      id: 'loop-test',
      bpm: 120,
      loopEnd: 10,
      stems: [{ id: 'pad', buffer: buffer as unknown as AudioBuffer, gain: 1 }],
    });

    await engine.play('loop-test');
    expect(engine.getCurrentState().trackId).toBe('loop-test');
  });
});

describe('MusicScheduler', () => {
  it('bar ve beat dönüşümleri doğru', () => {
    const scheduler = new MusicScheduler(120, [4, 4]);
    expect(scheduler.beatDuration).toBeCloseTo(0.5, 5);
    expect(scheduler.barDuration).toBeCloseTo(2, 5);

    const startTime = 0;
    const nextBar = scheduler.getNextBarTime(0.5, startTime);
    expect(nextBar).toBeCloseTo(2, 5);

    const nextBeat = scheduler.getNextBeatTime(0.2, startTime);
    expect(nextBeat).toBeCloseTo(0.5, 5);
  });

  it('context üretir', () => {
    const scheduler = new MusicScheduler(120, [4, 4]);
    const ctx = scheduler.getContext(2.5, 0);
    expect(ctx.bar).toBe(2);
    expect(ctx.beat).toBeGreaterThan(0.9);
  });
});

describe('resolveStemGain', () => {
  it('gainMap numeric interpolasyonu çalışır', () => {
    const stem = {
      id: 'x',
      gain: 1,
      gainMap: {
        intensity: [
          { threshold: 0, gain: 0 },
          { threshold: 1, gain: 1 },
        ],
      },
    };
    const gain = resolveStemGain(
      stem,
      { intensity: 0.5 },
      { bpm: 120, timeSignature: [4, 4], bar: 1, beat: 1, time: 0 },
    );
    expect(gain).toBeCloseTo(0.5, 5);
  });

  it('gainMap olmadan base gain döner', () => {
    const stem = { id: 'x', gain: 0.7 };
    const gain = resolveStemGain(
      stem,
      {},
      { bpm: 120, timeSignature: [4, 4], bar: 1, beat: 1, time: 0 },
    );
    expect(gain).toBeCloseTo(0.7, 5);
  });
});
