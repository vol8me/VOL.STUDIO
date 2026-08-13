import { describe, it, expect, beforeEach } from 'vitest';
import { SfxBank } from '@/app/SfxBank';
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

  function activeSources(event: SoundEvent): FakeAudioBufferSourceNode[] {
    const states = (
      bank as unknown as { voiceStates: Map<string, { active: Set<FakeAudioBufferSourceNode> }> }
    ).voiceStates;
    const state = states.get(soundKeys[event]);
    return state ? Array.from(state.active) : [];
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
});
