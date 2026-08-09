import { describe, it, expect } from 'vitest';
import { Instrument } from '../../../src/audio/music/instrument';

describe('Instrument', () => {
  it('renderPhrase creates non-empty audio', () => {
    const inst = Instrument.fromPreset('softPluck');
    const phrase = {
      bpm: 60,
      notes: [
        { beat: 0, duration: 1, freq: 440 },
        { beat: 1, duration: 1, freq: 330 },
      ],
    };
    const result = inst.renderPhrase(phrase);
    expect(result.duration).toBeGreaterThan(0);
    expect(result.channels[0]?.length).toBeGreaterThan(0);
    const max = Math.max(...result.channels[0].map((v) => Math.abs(v)));
    expect(max).toBeGreaterThan(0.001);
  });

  it('per-note gain scales amplitude within the same phrase', () => {
    const inst = Instrument.fromPreset('softPluck');
    const result = inst.renderPhrase({
      bpm: 60,
      notes: [
        { beat: 0, duration: 0.4, freq: 440, gain: 1 },
        { beat: 0.5, duration: 0.4, freq: 440, gain: 0.1 },
      ],
    });
    const buffer = result.channels[0];
    const mid = Math.floor(buffer.length / 2);
    const firstMax = Math.max(...buffer.slice(0, mid).map((v) => Math.abs(v)));
    const secondMax = Math.max(...buffer.slice(mid).map((v) => Math.abs(v)));
    expect(firstMax).toBeGreaterThan(secondMax * 5);
  });

  it('withGain returns a new instrument with different gain', () => {
    const inst = Instrument.fromPreset('softLead');
    const louder = inst.withGain(0.9);
    expect(inst.params.gain).toBe(0.55);
    expect(louder.params.gain).toBe(0.9);
  });
});
