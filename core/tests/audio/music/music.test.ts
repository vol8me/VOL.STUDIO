import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MusicEngine,
  MusicScheduler,
  resolveStemGain,
  ProceduralStemGenerator,
  droneParams,
  bassParams,
} from '../../../src/audio/music';
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
    expect(engine.getCurrentContext().bpm).toBe(120);
    expect(engine.getCurrentContext().bar).toBe(1);
    expect(engine.getCurrentState().trackId).toBe('main-menu');
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

    expect(engine.getStemGain('drums')).toBeCloseTo(0.5, 5);
    expect(engine.getTargetStemGain('drums')).toBeCloseTo(0.5, 5);
  });

  it('setBossPhase sembolik state değişimini uygular', async () => {
    const engine = new MusicEngine({ audioContext: fakeContext as unknown as AudioContext });
    const buffer = makeBuffer(fakeContext, 2);

    await engine.loadTrack({
      id: 'boss',
      bpm: 100,
      stems: [
        {
          id: 'lead',
          buffer: buffer as unknown as AudioBuffer,
          gain: 1,
          gainMap: {
            bossPhase: { '1': 0, '2': 1 },
          },
        },
      ],
    });

    await engine.play('boss', { state: { bossPhase: '1' } });
    engine.setBossPhase('2', 0);

    expect(engine.getStemGain('lead')).toBeCloseTo(1, 5);
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
    expect(engine.getCurrentContext()).toBeDefined();

    engine.stop({ fadeOut: 0.1 });
    expect(() => engine.getCurrentContext()).toThrow();
    expect(engine.getCurrentState().playing).toBe(false);
  });

  it('stinger çalınamazsa hata atar', async () => {
    const engine = new MusicEngine({ audioContext: fakeContext as unknown as AudioContext });
    await expect(engine.triggerStinger('unknown')).rejects.toThrow();
  });

  it('crossfadeTo yeni track başlatır ve eski stemler ayrı kanaldan fade out olur', async () => {
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
    const firstGain = engine.getStemGain('pad');
    expect(firstGain).toBeCloseTo(0.7, 5);

    await engine.crossfadeTo('combat', 0.1);
    // Yeni track pad'i hemen çalmaya başlamalı
    expect(engine.getCurrentState().trackId).toBe('combat');
    expect(engine.getCurrentContext().bpm).toBe(130);

    // Crossfade sonrası target gain yeni track değeri
    await new Promise((r) => setTimeout(r, 5));
    expect(engine.getTargetStemGain('pad')).toBeCloseTo(0.9, 5);
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
    fakeContext.currentTime = 0.5; // bar 1.25

    await engine.crossfadeTo('combat', 0.1, { bars: 1 });
    // now=0.5, duration=0.1 -> earliest=0.6; bar 1.3 -> floor=1 -> +1=2 -> time=2.0
    expect(engine.getCurrentContext().bpm).toBe(120);
    expect(engine.getCurrentState().trackId).toBe('combat');
  });

  it('procedural stem AudioBuffer üretir', async () => {
    const engine = new MusicEngine({ audioContext: fakeContext as unknown as AudioContext });
    const generator = new ProceduralStemGenerator(fakeContext as unknown as AudioContext);
    const pad = generator.generatePad({ duration: 0.1, frequency: 220 });

    expect(pad.length).toBeGreaterThan(0);
    expect(pad.sampleRate).toBe(44100);

    await engine.loadTrack({
      id: 'procedural',
      bpm: 120,
      stems: [{ id: 'procedural-pad', buffer: pad, gain: 0.5 }],
    });

    await engine.play('procedural');
    expect(engine.getCurrentState().trackId).toBe('procedural');
  });

  it('loopEnd buffer uzunluğunu aşmaz', async () => {
    const engine = new MusicEngine({ audioContext: fakeContext as unknown as AudioContext });
    const buffer = makeBuffer(fakeContext, 2);

    await engine.loadTrack({
      id: 'loop-test',
      bpm: 120,
      loopEnd: 10, // buffer.duration 2
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
  it('gainFn önceliklidir', () => {
    const stem = {
      id: 'x',
      gain: 0.5,
      gainFn: () => 0.8,
      gainMap: { intensity: [{ threshold: 0, gain: 1 }] },
    };
    const gain = resolveStemGain(
      stem,
      { intensity: 0 },
      {
        bpm: 120,
        timeSignature: [4, 4],
        bar: 1,
        beat: 1,
        time: 0,
      },
    );
    expect(gain).toBeCloseTo(0.4, 5); // 0.5 * 0.8
  });

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
      {
        bpm: 120,
        timeSignature: [4, 4],
        bar: 1,
        beat: 1,
        time: 0,
      },
    );
    expect(gain).toBeCloseTo(0.5, 5);
  });

  it('gainMap sembolik exact match çalışır', () => {
    const stem = {
      id: 'x',
      gain: 1,
      gainMap: { bossPhase: { phase1: 0.3, phase2: 0.9 } },
    };
    const gain = resolveStemGain(
      stem,
      { bossPhase: 'phase2' },
      {
        bpm: 120,
        timeSignature: [4, 4],
        bar: 1,
        beat: 1,
        time: 0,
      },
    );
    expect(gain).toBeCloseTo(0.9, 5);
  });
});

describe('Procedural preset loopable envelopes', () => {
  it('loop: true drone sustaini release ioturacak kadar kisaltir', () => {
    const params = droneParams({ duration: 10, frequency: 100, loop: true });
    expect(params.envelope?.attack).toBe(2);
    expect(params.envelope?.release).toBe(3);
    expect(params.envelope?.sustain).toBe(5); // 10 - 2 - 3
  });

  it('loop: true bass sustaini hesaplar', () => {
    const params = bassParams({ duration: 4, frequency: 80, loop: true });
    expect(params.envelope?.attack).toBe(0.05);
    expect(params.envelope?.decay).toBe(0.1);
    expect(params.envelope?.release).toBe(0.3);
    expect(params.envelope?.sustain).toBeCloseTo(3.55, 5); // 4 - 0.05 - 0.1 - 0.3
  });

  it('loop: true buffer sonunda sinyal sifiraya iner', () => {
    const result = synth(4, bassParams({ duration: 4, frequency: 80, wave: 'sine', loop: true }));
    const last = result.channels[0]?.[result.channels[0].length - 1] ?? 1;
    expect(Math.abs(last)).toBeLessThan(0.05);
  });

  it('loop: false drone sustaini oldugu gibi birakir', () => {
    const params = droneParams({ duration: 10, frequency: 100 });
    expect(params.envelope?.sustain).toBe(10);
  });
});
