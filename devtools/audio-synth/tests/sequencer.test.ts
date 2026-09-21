import { describe, it, expect } from 'vitest';
import { compose, PhaserEffect, Presets } from '@volstudio/audio-synth';
import type { SequenceParams } from '@volstudio/audio-synth';

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

describe('compose — bus efektleri diziye BİR KEZ uygulanır', () => {
  const click = { wave: 'sine' as const, frequency: 2000, normalize: false, gain: 1 };
  const sequence: SequenceParams = { notes: [{ freq: 2000, duration: 0.02 }] };

  function onset(channel: Float32Array): number {
    const peak = channel.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    return channel.findIndex((v) => Math.abs(v) > peak * 0.05);
  }

  it('saf gecikme flanger (5 ms) çıktıyı 5 ms kaydırır, 10 değil', () => {
    // Eski ayıklama listesi flanger'ı unutuyordu: nota başına bir kez, final
    // mix'te bir kez daha uygulanıp gecikmeyi ikiye katlıyordu.
    const flanger = { time: 5, depth: 0, rate: 0, mix: 1, feedback: 0 };
    const dry = compose(sequence, click);
    const wet = compose(sequence, { ...click, flanger });
    const shift = (onset(wet.channels[0]) - onset(dry.channels[0])) / dry.sampleRate;
    expect(shift).toBeCloseTo(0.005, 3);
  });

  it('phaser seviye etkisi tek geçişe eşittir', () => {
    // Durağan (rate 0) phaser + mix 0.5 bir sinüsü |½ + ½e^{jφ}| kadar
    // zayıflatır; iki kez uygulanırsa bu oranın karesi olur. Beklenen oran
    // aynı phaser'ın tek bir sinüse bir kez uygulanmasından ölçülür.
    const phaser = { minFreq: 900, maxFreq: 900.5, rate: 0, stages: 4, mix: 0.5 };
    const f = 900;
    const long: SequenceParams = { notes: [{ freq: f, duration: 0.3 }] };
    const flat = { attack: 0, sustain: 0.3, release: 0, sustainLevel: 1 };
    const rms = (ch: Float32Array) => {
      let s = 0;
      for (let i = 2000; i < 12000; i++) s += ch[i] * ch[i];
      return Math.sqrt(s / 10000);
    };
    const base = { ...click, frequency: f, envelope: flat };
    const composed =
      rms(compose(long, { ...base, phaser }).channels[0]) / rms(compose(long, base).channels[0]);
    const single = new PhaserEffect(phaser, 44100);
    const sine = Float32Array.from({ length: 13000 }, (_, i) =>
      Math.sin((2 * Math.PI * f * i) / 44100),
    );
    const once = rms(sine.map((x, i) => single.process(x, i / 44100))) / rms(sine);
    expect(Math.abs(20 * Math.log10(composed / once))).toBeLessThan(0.3);
    expect(Math.abs(20 * Math.log10(once))).toBeGreaterThan(1);
  });

  it('nota başına bus efekti sessizce silinmez, adıyla reddedilir', () => {
    for (const key of ['delay', 'flanger', 'phaser', 'chorus', 'pan', 'reverb', 'stereoWidth']) {
      const withEffect: SequenceParams = {
        notes: [{ freq: 440, duration: 0.05, params: { [key]: key === 'pan' ? 0 : {} } }],
      };
      expect(() => compose(withEffect, click), key).toThrow(
        expect.objectContaining({ path: `notes[0].params.${key}`, issue: 'combination' }),
      );
    }
  });
});
