import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
    // Önceki context'in referansını bırak — yeni context oluşturmak eski
    // context'i dispose etmez; FakeAudioContext state'i testler arası sızıntı yapar.
    fakeContext = undefined as unknown as FakeAudioContext;
    vi.restoreAllMocks();
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
    const activeStems = (
      engine as unknown as { activeStems: Map<string, { gain: GainNode; stem: { id: string } }> }
    ).activeStems;
    let drumsGain = 0;
    for (const active of activeStems.values()) {
      if (active.stem.id === 'drums') drumsGain = active.gain.gain.value;
    }
    expect(drumsGain).toBeCloseTo(0.5, 5);
  });

  it('master volume ve mute çalışır', () => {
    const engine = new MusicEngine({ audioContext: fakeContext as unknown as AudioContext });
    // Gain değişimleri artık lineer rampa ile yapılıyor (hedefe TAM varır);
    // değeri okumadan önce rampanın bitiş anına ilerlemek gerekir.
    const gain = engine.mixer.masterGain.gain as unknown as {
      value: number;
      advanceTo(t: number): void;
    };
    const settle = (): void => {
      fakeContext.currentTime += 1;
      gain.advanceTo(fakeContext.currentTime);
    };

    engine.setMasterVolume(0.5);
    settle();
    expect(gain.value).toBeCloseTo(0.5, 5);

    engine.mute(true);
    settle();
    expect(gain.value).toBe(0);

    engine.mute(false);
    settle();
    expect(gain.value).toBeCloseTo(0.5, 5);
  });

  it('mute sonrası açma AYARLANAN seviyeye döner, 1.0 değil', () => {
    const engine = new MusicEngine({ audioContext: fakeContext as unknown as AudioContext });
    const gain = engine.mixer.masterGain.gain as unknown as {
      value: number;
      advanceTo(t: number): void;
    };
    const settle = (): void => {
      fakeContext.currentTime += 1;
      gain.advanceTo(fakeContext.currentTime);
    };

    // Mixer'ın kendi mute()'u — önceden sabit 1 yazıyordu ve kullanıcının
    // ayarladığı seviyeyi yok sayıp sesi %100'e fırlatıyordu.
    engine.mixer.setMasterGain(0.3, 0);
    engine.mixer.mute(true);
    settle();
    expect(gain.value).toBe(0);

    engine.mixer.mute(false);
    settle();
    expect(gain.value).toBeCloseTo(0.3, 5);
    expect(engine.mixer.getMasterGain()).toBeCloseTo(0.3, 5);
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

  it('NaN/negatif/Infinity loopStart ve loopEnd güvenli aralığa çekilir', async () => {
    const engine = new MusicEngine({ audioContext: fakeContext as unknown as AudioContext });
    const buffer = makeBuffer(fakeContext, 2);

    await engine.loadTrack({
      id: 'loop-edge',
      bpm: 120,
      loopStart: NaN,
      loopEnd: -5,
      stems: [{ id: 'pad', buffer: buffer as unknown as AudioBuffer, gain: 1 }],
    });

    await engine.play('loop-edge');
    const activeStems = (
      engine as unknown as {
        activeStems: Map<string, { source: { loopStart: number; loopEnd: number } }>;
      }
    ).activeStems;
    const stem = activeStems.values().next().value!;
    expect(stem.source.loopStart).toBeGreaterThanOrEqual(0);
    expect(stem.source.loopEnd).toBeGreaterThan(0);
    expect(stem.source.loopEnd).toBeLessThanOrEqual(buffer.duration);
    expect(stem.source.loopStart).toBeLessThan(stem.source.loopEnd);
  });

  it('AudioContext yoksa webkitAudioContext ile oluşur', () => {
    const originalAudioContext = (globalThis as { AudioContext?: typeof AudioContext })
      .AudioContext;
    const originalWebkit = (globalThis as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

    vi.stubGlobal('AudioContext', undefined);

    const FakeWebkitAudioContext = vi.fn(() => fakeContext) as unknown as typeof AudioContext;
    vi.stubGlobal('webkitAudioContext', FakeWebkitAudioContext);

    const engine = new MusicEngine();
    expect(engine).toBeDefined();
    expect(FakeWebkitAudioContext).toHaveBeenCalled();

    vi.stubGlobal('AudioContext', originalAudioContext);
    vi.stubGlobal('webkitAudioContext', originalWebkit);
  });

  it('AudioContext ve webkitAudioContext yoksa hata fırlatır', () => {
    const originalAudioContext = (globalThis as { AudioContext?: typeof AudioContext })
      .AudioContext;
    const originalWebkit = (globalThis as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);

    expect(() => new MusicEngine()).toThrow('AudioContext desteklenmiyor');

    vi.stubGlobal('AudioContext', originalAudioContext);
    vi.stubGlobal('webkitAudioContext', originalWebkit);
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
    const gain = resolveStemGain(stem, { intensity: 0.5 });
    expect(gain).toBeCloseTo(0.5, 5);
  });

  it('gainMap olmadan base gain döner', () => {
    const stem = { id: 'x', gain: 0.7 };
    const gain = resolveStemGain(stem, {});
    expect(gain).toBeCloseTo(0.7, 5);
  });
});

/**
 * Doğal bitiş bildirimi — `MusicPlaylist` ilerlemesi buna dayanır.
 * Motorun kendi durdurduğu stem "parça bitti" saymamalı, yoksa liste
 * her `stop()` çağrısında yanlışlıkla ilerler.
 */
describe('MusicEngine — onTrackEnd', () => {
  let ctx: FakeAudioContext;

  beforeEach(() => {
    ctx = new FakeAudioContext();
  });

  function makeEngineWithTrack(loop: boolean) {
    const engine = new MusicEngine({ audioContext: ctx as unknown as AudioContext });
    const buffer = makeBuffer(ctx, 2);
    const track = {
      id: 'menu',
      bpm: 100,
      stems: [{ id: 'menu-stem', buffer, loop }],
    };
    return { engine, track };
  }

  it('parça kendiliğinden bitince dinleyiciyi çağırır', async () => {
    const { engine, track } = makeEngineWithTrack(false);
    const ended: string[] = [];
    engine.onTrackEnd((id) => ended.push(id));

    await engine.loadTrack(track);
    await engine.play('menu');

    ctx.createdSources.at(-1)?.simulateEnded();
    expect(ended).toEqual(['menu']);
  });

  it('stop() ile durdurulan parça bitiş saymaz', async () => {
    const { engine, track } = makeEngineWithTrack(false);
    const ended: string[] = [];
    engine.onTrackEnd((id) => ended.push(id));

    await engine.loadTrack(track);
    await engine.play('menu');
    engine.stop({ fadeOut: 0 });

    ctx.createdSources.at(-1)?.simulateEnded();
    expect(ended).toEqual([]);
  });

  it('abonelik kaldırılınca artık bildirilmez', async () => {
    const { engine, track } = makeEngineWithTrack(false);
    const ended: string[] = [];
    const off = engine.onTrackEnd((id) => ended.push(id));

    await engine.loadTrack(track);
    await engine.play('menu');
    off();

    ctx.createdSources.at(-1)?.simulateEnded();
    expect(ended).toEqual([]);
  });

  it('bir dinleyici patlarsa diğerleri yine çağrılır', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { engine, track } = makeEngineWithTrack(false);
    const ended: string[] = [];
    engine.onTrackEnd(() => {
      throw new Error('dinleyici patladı');
    });
    engine.onTrackEnd((id) => ended.push(id));

    await engine.loadTrack(track);
    await engine.play('menu');
    ctx.createdSources.at(-1)?.simulateEnded();

    expect(ended).toEqual(['menu']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
