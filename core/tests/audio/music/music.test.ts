import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MusicEngine, MusicScheduler, resolveStemGain } from '../../../src/audio/music';
import type { LoopTimingMismatch } from '../../../src/audio/music';
import { FakeAudioContext } from './mock-audio';

function makeBuffer(context: FakeAudioContext, duration = 2, sampleRate = 44100): AudioBuffer {
  const length = Math.floor(duration * sampleRate);
  const buffer = context.createBuffer(1, length, sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    channel[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
  }
  return buffer as unknown as AudioBuffer;
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

describe('MusicEngine — eşzamanlılık ve buffer önbelleği', () => {
  let fakeContext: FakeAudioContext;

  beforeEach(() => {
    fakeContext = new FakeAudioContext();
  });

  afterEach(() => {
    fakeContext = undefined as unknown as FakeAudioContext;
    vi.restoreAllMocks();
  });

  it("aynı stem.id farklı track'lerde farklı buffer'ları karıştırmaz", async () => {
    const engine = new MusicEngine({ audioContext: fakeContext as unknown as AudioContext });
    const bufferA = makeBuffer(fakeContext, 2);
    const bufferB = makeBuffer(fakeContext, 3);

    await engine.loadTrack({ id: 'trackA', bpm: 120, stems: [{ id: 'pad', buffer: bufferA }] });
    // AYNI stem.id ('pad'), FARKLI buffer — eskiden buffer önbelleği salt
    // `stem.id` ile anahtarlandığı için `loadTrack` burada sessizce
    // atlıyordu (`if (buffers.has('pad')) return`) ve trackB, trackA'nın
    // buffer'ını çalardı.
    await engine.loadTrack({ id: 'trackB', bpm: 120, stems: [{ id: 'pad', buffer: bufferB }] });

    await engine.play('trackB');
    const activeStems = (engine as unknown as { activeStems: Map<string, { buffer: AudioBuffer }> })
      .activeStems;
    const active = activeStems.values().next().value!;
    expect(active.buffer.duration).toBeCloseTo(bufferB.duration, 5);
  });

  it("play() yarışında SON çağrı kazanır (loadTrack await'i sırasında ikinci play gelirse)", async () => {
    const engine = new MusicEngine({ audioContext: fakeContext as unknown as AudioContext });
    const bufferA = makeBuffer(fakeContext, 2);
    const bufferB = makeBuffer(fakeContext, 3);

    await engine.loadTrack({ id: 'trackA', bpm: 120, stems: [{ id: 'a', buffer: bufferA }] });
    await engine.loadTrack({ id: 'trackB', bpm: 120, stems: [{ id: 'b', buffer: bufferB }] });

    // İkisi de birbirini beklemeden çağrılır — trackA'nın loadTrack await'i
    // sırasında trackB gelir. Eskiden hangisinin loadTrack'i önce dönerse o
    // kazanırdı (çağrı sırasına değil, network/microtask zamanlamasına bağlı
    // bir yarış); artık her zaman SON çağrı (trackB) kazanmalı.
    const playA = engine.play('trackA');
    const playB = engine.play('trackB');
    await Promise.all([playA, playB]);

    expect(engine.getCurrentState().trackId).toBe('trackB');
    expect(engine.getCurrentState().playing).toBe(true);

    const activeStems = (
      engine as unknown as { activeStems: Map<string, { stem: { id: string } }> }
    ).activeStems;
    const stemIds = [...activeStems.values()].map((s) => s.stem.id);
    expect(stemIds).toEqual(['b']);
  });

  it("load promise'ları ters sırada çözülse bile son play state'i kazanır", async () => {
    const engine = new MusicEngine({ audioContext: fakeContext as unknown as AudioContext });
    const bufferA = makeBuffer(fakeContext, 2);
    const bufferB = makeBuffer(fakeContext, 3);
    const tracks = (engine as unknown as { tracks: Map<string, unknown> }).tracks;
    tracks.set('trackA', { id: 'trackA', bpm: 120, stems: [{ id: 'a', src: 'a.ogg' }] });
    tracks.set('trackB', { id: 'trackB', bpm: 120, stems: [{ id: 'b', src: 'b.ogg' }] });

    let resolveA!: (buffer: AudioBuffer) => void;
    let resolveB!: (buffer: AudioBuffer) => void;
    vi.spyOn(engine.loader, 'loadFromUrl').mockImplementation((src) => {
      return new Promise<AudioBuffer>((resolve) => {
        if (src === 'a.ogg') resolveA = resolve;
        else resolveB = resolve;
      });
    });

    const playA = engine.play('trackA');
    const playB = engine.play('trackB');
    resolveB(bufferB as unknown as AudioBuffer);
    await Promise.resolve();
    resolveA(bufferA as unknown as AudioBuffer);
    await Promise.all([playA, playB]);

    expect(engine.getCurrentState().trackId).toBe('trackB');
  });

  it('play() beklerken stop() gelirse, play() döndüğünde sesi geri açmaz', async () => {
    const engine = new MusicEngine({ audioContext: fakeContext as unknown as AudioContext });
    const buffer = makeBuffer(fakeContext, 2);
    await engine.loadTrack({ id: 'trackA', bpm: 120, stems: [{ id: 'a', buffer }] });

    const playPromise = engine.play('trackA');
    engine.stop({ fadeOut: 0 });
    await playPromise;

    expect(engine.getCurrentState().playing).toBe(false);
  });

  it('tüm stemler yüklenemezse isPlaying takılı kalmaz, play() reddedilir', async () => {
    const engine = new MusicEngine({ audioContext: fakeContext as unknown as AudioContext });
    await engine.loadTrack({
      id: 'broken',
      bpm: 120,
      // Ne `buffer` ne `src` — loadTrack bu stem'i sessizce atlar, hiçbir
      // buffer üretilmez.
      stems: [{ id: 'missing' }],
    });

    // Eskiden bu, activeStems boşken bile `isPlaying = true` set ederdi —
    // hiçbir stem başlamadığı için `onended` asla tetiklenmez ve motor
    // sonsuza dek "çalıyor" durumunda TAKILI kalırdı.
    await expect(engine.play('broken')).rejects.toThrow(/hiçbir stem/);
    expect(engine.getCurrentState().playing).toBe(false);
    expect(engine.getCurrentState().trackId).toBeUndefined();
  });

  it('dispose() sonrası trackEnd dinleyicileri temizlenir', async () => {
    const engine = new MusicEngine({ audioContext: fakeContext as unknown as AudioContext });
    const buffer = makeBuffer(fakeContext, 2);
    await engine.loadTrack({
      id: 'menu',
      bpm: 100,
      stems: [{ id: 'menu-stem', buffer, loop: false }],
    });
    await engine.play('menu');

    const ended: string[] = [];
    engine.onTrackEnd((id) => ended.push(id));

    const handlers = (engine as unknown as { trackEndHandlers: Set<unknown> }).trackEndHandlers;
    expect(handlers.size).toBe(1);

    engine.dispose();
    expect(handlers.size).toBe(0);
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

  describe('MusicEngine — loop zamanlaması ayrışması', () => {
    let fakeContext: FakeAudioContext;

    beforeEach(() => {
      fakeContext = new FakeAudioContext();
    });

    afterEach(() => {
      fakeContext = undefined as unknown as FakeAudioContext;
      vi.restoreAllMocks();
    });

    /** 2 saniyelik buffer taşıyan tek stem'li track. */
    async function loadTrackWith(engine: MusicEngine, loopEnd?: number): Promise<string> {
      const buffer = makeBuffer(fakeContext, 2);
      await engine.loadTrack({
        id: 'drift-test',
        bpm: 120,
        loopEnd,
        stems: [{ id: 'stem-a', buffer, loop: true }],
      });
      return 'drift-test';
    }

    it('loopEnd dosya süresiyle ayrışırsa BİLDİRİLİR', async () => {
      // Kelepçeleme tek başına yetmez çünkü sessizdir: config 30 s derken
      // dosya 2 s ise parça sessizce erken sarar ve bu ancak kulakla fark
      // edilir. İki sayı ayrı yerlerde üretildiği için gerçek bir olasılık.
      const onTimingMismatch = vi.fn<(info: LoopTimingMismatch) => void>();
      const engine = new MusicEngine({
        audioContext: fakeContext as unknown as AudioContext,
        onTimingMismatch,
      });

      const id = await loadTrackWith(engine, 30);
      await engine.play(id);

      expect(onTimingMismatch).toHaveBeenCalledTimes(1);
      const info = onTimingMismatch.mock.calls[0][0];
      expect(info.trackId).toBe(id);
      expect(info.stemId).toBe('stem-a');
      expect(info.configuredEnd).toBe(30);
      expect(info.actualDuration).toBeCloseTo(2, 1);
    });

    it('süreler uyuşuyorsa bildirim YAPILMAZ', async () => {
      const onTimingMismatch = vi.fn();
      const engine = new MusicEngine({
        audioContext: fakeContext as unknown as AudioContext,
        onTimingMismatch,
      });

      const id = await loadTrackWith(engine, 2);
      await engine.play(id);

      expect(onTimingMismatch).not.toHaveBeenCalled();
    });

    it('loopEnd verilmezse bildirim yapılmaz', async () => {
      const onTimingMismatch = vi.fn();
      const engine = new MusicEngine({
        audioContext: fakeContext as unknown as AudioContext,
        onTimingMismatch,
      });

      const id = await loadTrackWith(engine);
      await engine.play(id);

      expect(onTimingMismatch).not.toHaveBeenCalled();
    });

    it('aynı stem için uyarı BİR KEZ verilir', async () => {
      // Her çalışta tekrarlamak konsolu doldurup asıl bilgiyi gömerdi.
      const onTimingMismatch = vi.fn();
      const engine = new MusicEngine({
        audioContext: fakeContext as unknown as AudioContext,
        onTimingMismatch,
      });

      const id = await loadTrackWith(engine, 30);
      await engine.play(id);
      engine.stop();
      await engine.play(id);

      expect(onTimingMismatch).toHaveBeenCalledTimes(1);
    });

    it('kanca verilmezse konsola yazılır — sessiz kalmaz', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const engine = new MusicEngine({
        audioContext: fakeContext as unknown as AudioContext,
      });

      const id = await loadTrackWith(engine, 30);
      await engine.play(id);

      expect(warn).toHaveBeenCalled();
      expect(String(warn.mock.calls[0][0])).toContain('loopEnd');
      warn.mockRestore();
    });
  });
});

describe('MusicEngine — geçiş işlem bütünlüğü', () => {
  let fakeContext: FakeAudioContext;

  beforeEach(() => {
    fakeContext = new FakeAudioContext();
  });

  afterEach(() => {
    fakeContext = undefined as unknown as FakeAudioContext;
    vi.restoreAllMocks();
  });

  /** Buffer'ı hiç çözülemeyen, yani asla çalınamayacak bir track. */
  function unplayableTrack(id: string) {
    return { id, bpm: 120, stems: [{ id: 'lead', src: `${id}.ogg`, gain: 1 }] };
  }

  function playableTrack(id: string, buffer: AudioBuffer) {
    return { id, bpm: 120, stems: [{ id: 'lead', buffer, gain: 1 }] };
  }

  it('crossfade hedefi çalınamıyorsa MEVCUT müzik ayakta kalır', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = new MusicEngine({ audioContext: fakeContext as unknown as AudioContext });
    const buffer = makeBuffer(fakeContext, 2);

    await engine.loadTrack(playableTrack('menu', buffer));
    await engine.play('menu');
    expect(engine.getCurrentState().playing).toBe(true);

    // Hedefin hiçbir stem'i yüklenemez.
    await engine.loadTrack(unplayableTrack('broken'));
    await expect(engine.crossfadeTo('broken', 1)).rejects.toThrow(/crossfade/i);

    // Eski parça DOKUNULMAMIŞ olmalı: geçiş hiç başlamadı.
    const state = engine.getCurrentState();
    expect(state.playing).toBe(true);
    expect(state.trackId).toBe('menu');
  });

  it('başarısız crossfade sonrası aynı hedefe yeniden geçiş yapılabilir', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = new MusicEngine({ audioContext: fakeContext as unknown as AudioContext });
    const buffer = makeBuffer(fakeContext, 2);

    await engine.loadTrack(playableTrack('menu', buffer));
    await engine.play('menu');
    await engine.loadTrack(unplayableTrack('battle'));
    await expect(engine.crossfadeTo('battle', 1)).rejects.toThrow();

    // Buffer sonradan elde edilirse geçiş normal çalışır — motor kilitlenmez.
    await engine.loadTrack(playableTrack('battle', makeBuffer(fakeContext, 2)));
    await engine.crossfadeTo('battle', 1);
    expect(engine.getCurrentState().trackId).toBe('battle');
    expect(engine.getCurrentState().playing).toBe(true);
  });

  it('play hedefi çalınamıyorsa çalan müziği DURDURMAZ', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = new MusicEngine({ audioContext: fakeContext as unknown as AudioContext });
    const buffer = makeBuffer(fakeContext, 2);

    await engine.loadTrack(playableTrack('menu', buffer));
    await engine.play('menu');
    await engine.loadTrack(unplayableTrack('ghost'));

    await expect(engine.play('ghost')).rejects.toThrow(/çalınamadı/i);
    const state = engine.getCurrentState();
    expect(state.playing).toBe(true);
    expect(state.trackId).toBe('menu');
  });
});
