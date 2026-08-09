import { describe, it, expect } from 'vitest';
import { compose, Presets } from '@volstudio/core/audio/synth';
import type { SequenceParams } from '@volstudio/core/audio/synth';

describe('Sequencer', () => {
  it('basit arp doğru uzunlukta buffer üretir', () => {
    const base = Presets.blip(440, 0.1);
    const sequence: SequenceParams = {
      notes: [
        { semitone: 0, duration: 0.1 },
        { semitone: 4, duration: 0.1, delay: 0.05 },
        { semitone: 7, duration: 0.1, delay: 0.05 },
      ],
      rootFreq: 440,
    };

    const result = compose(sequence, base);
    const expectedDuration = 0.1 + 0.05 + 0.1 + 0.05 + 0.1;
    expect(result.duration).toBeCloseTo(expectedDuration, 3);
    expect(result.channels[0].length).toBeCloseTo(expectedDuration * result.sampleRate, -1);
  });

  it('loop sayısı buffer uzunluğunu çarpar', () => {
    const base = Presets.blip(440, 0.1);
    const sequence: SequenceParams = {
      notes: [{ semitone: 0, duration: 0.1 }],
      loop: 3,
      loopDelay: 0.05,
    };

    const result = compose(sequence, base);
    const expectedDuration = 3 * 0.1 + 2 * 0.05;
    expect(result.duration).toBeCloseTo(expectedDuration, 3);
  });

  it('freq ile mutlak frekans çalınır', () => {
    const base = Presets.blip(440, 0.1);
    const sequence: SequenceParams = {
      notes: [{ freq: 880, duration: 0.1 }],
    };

    const result = compose(sequence, base);
    expect(result.channels[0].length).toBeGreaterThan(0);
  });

  it('BPM ile beat değerleri saniyeye çevrilir', () => {
    const base = Presets.blip(440, 0.1);
    const sequence: SequenceParams = {
      notes: [{ semitone: 0, duration: 1, delay: 0 }],
      bpm: 60,
    };

    const result = compose(sequence, base);
    expect(result.duration).toBeCloseTo(1, 3);
  });

  it('notalar üst üste binebilir (polyphony yok, ama mix)', () => {
    const base = Presets.blip(440, 0.2);
    const sequence: SequenceParams = {
      notes: [
        { freq: 440, duration: 0.2, delay: 0 },
        { freq: 554, duration: 0.2, delay: 0 },
      ],
    };

    const result = compose(sequence, base);
    expect(result.channels[0].length).toBeGreaterThan(0);
  });

  it('preset arpejleri sentezlenebilir', () => {
    const arp = Presets.arpeggioUp(440);
    const base = Presets.blip(440, 0.1);
    const result = compose(arp, base);
    expect(result.channels[0].length).toBeGreaterThan(0);
  });

  it('compose sonucu normalize edilmiştir', () => {
    const base = { wave: 'sawtooth' as const, frequency: 440, gain: 1 };
    const sequence: SequenceParams = {
      notes: [{ semitone: 0, duration: 0.2 }],
    };

    const result = compose(sequence, base);
    const peak = Math.max(...result.channels[0].map((s) => Math.abs(s)));
    expect(peak).toBeLessThanOrEqual(1.01);
  });
});
