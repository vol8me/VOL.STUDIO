import { describe, it, expect } from 'vitest';
import { MusicEngine } from '../../../src/audio/music/engine';
import { Instrument } from '../../../src/audio/music/instrument';
import { FakeAudioContext } from './mock-audio';

describe('MelodicEngine / MusicEngine.playPhrase', () => {
  it('renders and schedules a phrase on a track', async () => {
    const fakeContext = new FakeAudioContext();
    const engine = new MusicEngine({ audioContext: fakeContext as unknown as AudioContext });

    const buffer = fakeContext.createBuffer(1, 44100 * 2, 44100);
    await engine.loadTrack({
      id: 'test',
      bpm: 60,
      stems: [{ id: 'drone', buffer: buffer as unknown as AudioBuffer, gain: 0.5 }],
    });

    const inst = Instrument.fromPreset('softPluck');
    const phrase = {
      bpm: 60,
      notes: [
        { beat: 0, duration: 1, freq: 440 },
        { beat: 1, duration: 1, freq: 330 },
      ],
    };

    await engine.play('test');
    const when = engine.playPhrase(phrase, inst, { beat: 0 });
    expect(when).toBeGreaterThan(0);
  });

  it('throws if playPhrase is called without a track', () => {
    const fakeContext = new FakeAudioContext();
    const engine = new MusicEngine({ audioContext: fakeContext as unknown as AudioContext });
    const inst = Instrument.fromPreset('softLead');
    const phrase = { bpm: 60, notes: [{ beat: 0, duration: 1, freq: 220 }] };
    expect(() => engine.playPhrase(phrase, inst)).toThrow('Fraze çalmak için aktif track gerekli.');
  });
});
