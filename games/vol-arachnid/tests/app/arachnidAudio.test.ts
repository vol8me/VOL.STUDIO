import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MusicEngine, SoundBank } from '@volstudio/core';
import { arachnidAmbienceTrack, arachnidAudioConfig } from '@/config/audio';
import { ArachnidAudio, createArachnidAudio } from '@/app/ArachnidAudio';

class FakeParam {
  value = 0;
}

class FakeNode {
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
}

class FakeCompressor extends FakeNode {
  readonly threshold = new FakeParam();
  readonly knee = new FakeParam();
  readonly ratio = new FakeParam();
  readonly attack = new FakeParam();
  readonly release = new FakeParam();
}

class FakeContext {
  state: AudioContextState = 'suspended';
  readonly destination = new FakeNode() as unknown as AudioDestinationNode;
  readonly gain = new FakeGain();
  readonly compressor = new FakeCompressor();
  readonly resume = vi.fn(() => {
    this.state = 'running';
    return Promise.resolve();
  });
  readonly suspend = vi.fn(() => {
    this.state = 'suspended';
    return Promise.resolve();
  });
  readonly close = vi.fn(() => {
    this.state = 'closed';
    return Promise.resolve();
  });

  createGain(): GainNode {
    return this.gain as unknown as GainNode;
  }

  createDynamicsCompressor(): DynamicsCompressorNode {
    return this.compressor as unknown as DynamicsCompressorNode;
  }
}

function makeSoundBank() {
  return {
    register: vi.fn(),
    loadAll: vi.fn().mockResolvedValue(undefined),
    play: vi.fn(),
    setBusVolume: vi.fn(),
    dispose: vi.fn(),
  } satisfies Pick<SoundBank, 'register' | 'loadAll' | 'play' | 'setBusVolume' | 'dispose'>;
}

function makeAmbience(loaded = true) {
  return {
    loadTrack: vi.fn().mockResolvedValue(loaded),
    play: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
  } satisfies Pick<MusicEngine, 'loadTrack' | 'play' | 'dispose'>;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('ArachnidAudio', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('assetleri kaydeder, arka planda hazırlar ve ilk etkileşimde ambiyansı başlatır', async () => {
    const context = new FakeContext();
    const soundBank = makeSoundBank();
    const ambience = makeAmbience();
    const audio = new ArachnidAudio({
      context: context as unknown as AudioContext,
      soundBank,
      ambience,
    });
    await flush();

    expect(soundBank.register).toHaveBeenCalledTimes(4);
    expect(soundBank.setBusVolume).toHaveBeenCalledWith(arachnidAudioConfig.sfxVolume);
    expect(soundBank.loadAll).toHaveBeenCalledTimes(1);
    expect(ambience.loadTrack).toHaveBeenCalledWith(arachnidAmbienceTrack);
    expect(ambience.play).not.toHaveBeenCalled();

    window.dispatchEvent(new PointerEvent('pointerdown'));
    await flush();

    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(ambience.play).toHaveBeenCalledWith(arachnidAmbienceTrack.id, { fadeIn: 1.2 });
    // İkinci kullanıcı olayı ambiyansı üst üste başlatmaz.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Space' }));
    await flush();
    expect(ambience.play).toHaveBeenCalledTimes(1);

    audio.destroy();
  });

  it('olay miksini uygular ve intensity değerini güvenli aralığa kelepçeler', () => {
    const context = new FakeContext();
    const soundBank = makeSoundBank();
    const audio = new ArachnidAudio({
      context: context as unknown as AudioContext,
      soundBank,
      ambience: makeAmbience(),
    });

    audio.play('dashLand', 2);
    audio.play('step', Number.NaN);

    expect(soundBank.play).toHaveBeenNthCalledWith(1, 'dashLand', {
      gain: arachnidAudioConfig.events.dashLand.gain,
      rateJitter: arachnidAudioConfig.events.dashLand.rateJitter,
    });
    expect(soundBank.play).toHaveBeenNthCalledWith(2, 'step', {
      gain: 0,
      rateJitter: arachnidAudioConfig.events.step.rateJitter,
    });

    audio.destroy();
  });

  it('arka planda contexti askıya alır, dönüşte yeniden çalıştırır', async () => {
    const context = new FakeContext();
    const audio = new ArachnidAudio({
      context: context as unknown as AudioContext,
      soundBank: makeSoundBank(),
      ambience: makeAmbience(),
    });
    window.dispatchEvent(new PointerEvent('pointerdown'));
    await flush();

    window.dispatchEvent(new Event('blur'));
    await flush();
    expect(context.suspend).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event('focus'));
    await flush();
    expect(context.resume).toHaveBeenCalledTimes(2);

    audio.destroy();
  });

  it('destroy kaynakları tek kez bırakır ve sonrasında ses çalmaz', async () => {
    const context = new FakeContext();
    const soundBank = makeSoundBank();
    const ambience = makeAmbience();
    const audio = new ArachnidAudio({
      context: context as unknown as AudioContext,
      soundBank,
      ambience,
    });

    audio.destroy();
    audio.destroy();
    audio.play('step');
    await flush();

    expect(soundBank.dispose).toHaveBeenCalledTimes(1);
    expect(ambience.dispose).toHaveBeenCalledTimes(1);
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(context.gain.disconnect).toHaveBeenCalledTimes(1);
    expect(context.compressor.disconnect).toHaveBeenCalledTimes(1);
    expect(soundBank.play).not.toHaveBeenCalled();
  });

  it('ambiyans decode edilemezse context açılır ama boş track oynatılmaz', async () => {
    const context = new FakeContext();
    const ambience = makeAmbience(false);
    const audio = new ArachnidAudio({
      context: context as unknown as AudioContext,
      soundBank: makeSoundBank(),
      ambience,
    });

    window.dispatchEvent(new PointerEvent('pointerdown'));
    await flush();

    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(ambience.play).not.toHaveBeenCalled();
    audio.destroy();
  });

  it('tek bir SFX hatasını oyun döngüsüne taşımaz', () => {
    const context = new FakeContext();
    const soundBank = makeSoundBank();
    soundBank.play.mockImplementationOnce(() => {
      throw new Error('node failed');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const audio = new ArachnidAudio({
      context: context as unknown as AudioContext,
      soundBank,
      ambience: makeAmbience(),
    });

    expect(() => audio.play('wallImpact')).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      '[ArachnidAudio] "wallImpact" sesi çalınamadı:',
      expect.any(Error),
    );
    audio.destroy();
  });

  it('Web Audio bulunmazsa factory oyunu çökertmeden null döner', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(createArachnidAudio()).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  describe('dayanıklılık', () => {
    it('başarısız ön yükleme SONSUZA dek "tamamlandı" sayılmaz', async () => {
      /*
       * Söz bir kez kurulup hata yakalanarak `resolve` ediliyordu: başarısız bir
       * yükleme "tamamlandı" sayılıyor ve o oturum boyunca bir daha hiç
       * denenmiyordu. Yerel dosyada hata genelde kalıcıdır ama WebView'da
       * değildir; geçici bir decode hatası sesi kalıcı olarak öldürüyordu.
       */
      const context = new FakeContext();
      const soundBank = makeSoundBank();
      soundBank.loadAll.mockRejectedValueOnce(new Error('geçici decode hatası'));
      const ambience = makeAmbience();
      const audio = new ArachnidAudio({
        context: context as unknown as AudioContext,
        soundBank,
        ambience,
      });
      await flush();
      expect(soundBank.loadAll).toHaveBeenCalledTimes(1);

      window.dispatchEvent(new PointerEvent('pointerdown'));
      await flush();

      // İkinci deneme yapıldı ve bu kez başardı: ambiyans çalıyor.
      expect(soundBank.loadAll).toHaveBeenCalledTimes(2);
      expect(ambience.play).toHaveBeenCalledTimes(1);

      audio.destroy();
    });

    it('ön yükleme sonsuza dek yeniden denenmez', async () => {
      const context = new FakeContext();
      const soundBank = makeSoundBank();
      soundBank.loadAll.mockRejectedValue(new Error('kalıcı hata'));
      const audio = new ArachnidAudio({
        context: context as unknown as AudioContext,
        soundBank,
        ambience: makeAmbience(),
      });
      await flush();

      for (let attempt = 0; attempt < 10; attempt++) {
        window.dispatchEvent(new PointerEvent('pointerdown'));
        await flush();
      }

      // Sınır 3: hatanın kendisinden daha kötü bir yük olmasın.
      expect(soundBank.loadAll.mock.calls.length).toBeLessThanOrEqual(3);
      audio.destroy();
    });

    it('başlatma patlarsa SONRAKİ kullanıcı hareketi yeniden dener', async () => {
      /*
       * Dinleyiciler `resumeAndStart`tan ÖNCE bırakılıyordu: ilk deneme
       * patladığında ikinci bir kullanıcı hareketi hiç denenmiyordu.
       */
      const context = new FakeContext();
      const ambience = makeAmbience();
      ambience.play.mockRejectedValueOnce(new Error('autoplay kapısı'));
      const audio = new ArachnidAudio({
        context: context as unknown as AudioContext,
        soundBank: makeSoundBank(),
        ambience,
      });
      await flush();

      window.dispatchEvent(new PointerEvent('pointerdown'));
      await flush();
      expect(ambience.play).toHaveBeenCalledTimes(1);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Space' }));
      await flush();

      expect(ambience.play).toHaveBeenCalledTimes(2);
      audio.destroy();
    });

    it('askıya alma BAŞARISIZ olsa bile öne dönüşte yeniden denenir', async () => {
      /*
       * Öne dönüş yolu eskiden yalnız `context.state === 'suspended'` iken
       * çalışıyordu. O koşul "neden devam ediyoruz" sorusunu cevaplıyordu,
       * "ne istiyoruz" sorusunu değil.
       *
       * Askıya alma başarısız olabilir (yakalanıp loglanıyor). O zaman uygulama
       * arka plandayken context 'running' kalır, platform sesi kendi durdurur ve
       * öne dönüşte eski koşul geçmez: ambiyans o oturum boyunca ölü kalırdı.
       */
      const context = new FakeContext();
      context.suspend.mockRejectedValue(new Error('askıya alınamadı'));
      const ambience = makeAmbience();
      ambience.play.mockRejectedValueOnce(new Error('geçici hata'));
      const audio = new ArachnidAudio({
        context: context as unknown as AudioContext,
        soundBank: makeSoundBank(),
        ambience,
      });
      await flush();

      window.dispatchEvent(new PointerEvent('pointerdown'));
      await flush();
      expect(ambience.play).toHaveBeenCalledTimes(1);
      expect(context.state).toBe('running');

      // Arka plana git (askıya alma patlar, context 'running' kalır) ve dön.
      window.dispatchEvent(new Event('blur'));
      await flush();
      expect(context.state).toBe('running');
      window.dispatchEvent(new Event('focus'));
      await flush();

      expect(ambience.play).toHaveBeenCalledTimes(2);
      audio.destroy();
    });

    it('bekleme noktasında yıkım gelirse kapanmış context üzerinde çalmaz', async () => {
      const context = new FakeContext();
      const ambience = makeAmbience();
      // Bir NESNE alanı kullanılır: TypeScript, yerel bir değişkene yalnız
      // callback içinde yapılan atamayı göremiyor ve tipi `never`e daraltıyor.
      const deferred: { release?: () => void } = {};
      ambience.loadTrack.mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            deferred.release = () => resolve(true);
          }),
      );
      const audio = new ArachnidAudio({
        context: context as unknown as AudioContext,
        soundBank: makeSoundBank(),
        ambience,
      });

      window.dispatchEvent(new PointerEvent('pointerdown'));
      await flush();

      // Yükleme HÂLÂ beklerken yıkım gelir.
      audio.destroy();
      deferred.release?.();
      await flush();

      expect(ambience.play).not.toHaveBeenCalled();
      expect(context.state).toBe('closed');
    });
  });
});
