import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SfxBank } from '@/app/SfxBank';
import { sfxVoiceConfig } from '@/config/audio';
import { soundKeys, type SoundEvent } from '@/config/sounds';
import { FakeAudioContext } from '../mocks/audio';
import type { FakeAudioBufferSourceNode } from '../mocks/audio';

describe('SfxBank', () => {
  let context: FakeAudioContext;
  let destination: AudioNode;
  let bank: SfxBank;

  beforeEach(() => {
    context = new FakeAudioContext();
    destination = context.destination;
    bank = new SfxBank(context as unknown as AudioContext, destination);
  });

  function seedBuffer(event: SoundEvent): void {
    // StemLoader/fetch'e gitmeden doğrudan cache'i doldur.
    (bank as unknown as { buffers: Map<string, AudioBuffer[]> }).buffers.set(soundKeys[event], [
      context.createBuffer(),
    ]);
  }

  interface TestVoice {
    source: FakeAudioBufferSourceNode;
    gain: GainNode;
  }

  function activeVoices(event: SoundEvent): TestVoice[] {
    const states = (bank as unknown as { voiceStates: Map<string, { active: Set<TestVoice> }> })
      .voiceStates;
    const state = states.get(soundKeys[event]);
    return state ? Array.from(state.active) : [];
  }

  function activeSources(event: SoundEvent): FakeAudioBufferSourceNode[] {
    return activeVoices(event).map((voice) => voice.source);
  }

  function liveVoiceCount(): number {
    return (bank as unknown as { liveVoices: Set<TestVoice> }).liveVoices.size;
  }

  it('stopAll() tüm aktif sesleri durdurur ve setleri temizler', async () => {
    seedBuffer('fire');
    context.currentTime = 1;
    await bank.play('fire', {});

    const sources = activeSources('fire');
    expect(sources.length).toBe(1);

    bank.stopAll();

    expect(sources[0]?.stop).toHaveBeenCalledTimes(1);
    expect(activeSources('fire').length).toBe(0);
  });

  it('stopEvent() yalnızca belirtilen eventin seslerini durdurur', async () => {
    seedBuffer('fire');
    seedBuffer('dash');

    context.currentTime = 1;
    await bank.play('fire', {});
    context.currentTime = 2;
    await bank.play('dash', {});

    const fireSource = activeSources('fire')[0];
    const dashSource = activeSources('dash')[0];

    expect(fireSource).toBeDefined();
    expect(dashSource).toBeDefined();

    bank.stopEvent('fire');

    expect(fireSource?.stop).toHaveBeenCalledTimes(1);
    expect(dashSource?.stop).not.toHaveBeenCalled();
    expect(activeSources('fire').length).toBe(0);
    expect(activeSources('dash').length).toBe(1);
  });

  it('release() aktif sesleri durdurur ve cache/temizler', async () => {
    seedBuffer('fire');
    context.currentTime = 1;
    await bank.play('fire', {});

    const source = activeSources('fire')[0];
    bank.release();

    expect(source.stop).toHaveBeenCalledTimes(1);
    expect(activeSources('fire').length).toBe(0);
    expect((bank as unknown as { buffers: Map<string, unknown> }).buffers.size).toBe(0);
    expect((bank as unknown as { voiceStates: Map<string, unknown> }).voiceStates.size).toBe(0);
  });

  it('currentTime sıfırken ilk ses minInterval tarafından susturulmaz', async () => {
    seedBuffer('menuBlip');
    context.currentTime = 0;

    await bank.play('menuBlip', {});

    expect(activeSources('menuBlip')).toHaveLength(1);
  });

  it('sahne geçişinde sesi sert kesmek yerine kısa fade uygular', async () => {
    seedBuffer('menuBlip');
    context.currentTime = 3;
    await bank.play('menuBlip');

    const [voice] = activeVoices('menuBlip');
    expect(voice).toBeDefined();

    bank.stopAll();

    expect(voice.gain.gain.value).toBe(0);
    expect(voice.source.stop).toHaveBeenCalledWith(3 + sfxVoiceConfig.stopFadeSeconds);
    expect(activeSources('menuBlip')).toHaveLength(0);
  });

  it('farklı olaylar toplansa da global SFX kaynak tavanını aşmaz', async () => {
    seedBuffer('menuBlip');
    context.currentTime = 1;
    await bank.play('menuBlip', { maxVoices: 100, minInterval: 0 });
    const first = activeSources('menuBlip')[0];

    for (let i = 1; i <= sfxVoiceConfig.globalMaxVoices; i++) {
      context.currentTime += 0.001;
      await bank.play('menuBlip', { maxVoices: 100, minInterval: 0 });
    }

    expect(activeSources('menuBlip')).toHaveLength(sfxVoiceConfig.globalMaxVoices);
    expect(first?.stop).toHaveBeenCalledTimes(1);
  });

  it('fade kuyruğu salkım altında gerçek bağlı Web Audio kaynak tavanını aşmaz', async () => {
    seedBuffer('menuBlip');
    const createSource = vi.spyOn(context, 'createBufferSource');

    for (let i = 0; i < sfxVoiceConfig.globalMaxLiveVoices * 3; i++) {
      context.currentTime += 0.0001;
      await bank.play('menuBlip', { maxVoices: 100, minInterval: 0 });
    }

    expect(liveVoiceCount()).toBe(sfxVoiceConfig.globalMaxLiveVoices);
    expect(createSource).toHaveBeenCalledTimes(sfxVoiceConfig.globalMaxLiveVoices);
  });

  it('geçersiz ses seçenekleri AudioParam içine NaN taşımaz', async () => {
    seedBuffer('fire');
    context.currentTime = 1;

    expect(() => bank.setBusVolume(Number.NaN, Infinity)).not.toThrow();
    bank.setBusVolume(0.25, 0.2);
    await expect(
      bank.play('fire', { volume: Number.NaN, pitchVar: Infinity }),
    ).resolves.toBeUndefined();

    const busGain = (bank as unknown as { busGain: GainNode }).busGain;
    expect(Number.isFinite(busGain.gain.value)).toBe(true);
  });

  it('release sonrası ses parametresi güncellenmez', () => {
    bank.release();

    expect(() => bank.setBusVolume(0.5)).not.toThrow();
  });

  it('release sırasında tamamlanan yükleme cache’i yeniden canlandırmaz', async () => {
    let resolveLoad: ((buffer: AudioBuffer) => void) | undefined;
    const pendingBuffer = new Promise<AudioBuffer>((resolve) => {
      resolveLoad = resolve;
    });
    const loader = (bank as unknown as { loader: { loadFromUrl: () => Promise<AudioBuffer> } })
      .loader;
    vi.spyOn(loader, 'loadFromUrl').mockReturnValue(pendingBuffer);

    const load = bank.load('fire');
    bank.release();
    resolveLoad?.(context.createBuffer());
    await load;

    expect((bank as unknown as { buffers: Map<string, unknown> }).buffers.size).toBe(0);
  });
});
