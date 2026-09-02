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
});
