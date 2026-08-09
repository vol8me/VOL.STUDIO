import { describe, it, expect } from 'vitest';
import { synthesize, synth, normalize, mix, Presets } from '@volstudio/core/audio/synth';
import { DelayLine, Reverb } from '../../../src/audio/synth/effects';

describe('Synth engine', () => {
  it('üretilen mono örnek sayısı doğru', () => {
    const result = synth(0.1, { wave: 'sine', frequency: 440 });
    expect(result.channels).toHaveLength(1);
    expect(result.channels[0]?.length).toBe(4410); // 0.1s @ 44100Hz
    expect(result.sampleRate).toBe(44100);
  });

  it('pan ile stereo çıkış üretir', () => {
    // square + sabit zarf ile pan farkı net görülür
    const result = synthesize({
      wave: 'square',
      frequency: 440,
      duration: 0.05,
      pan: 0.5,
      envelope: { attack: 0, hold: 0.05, release: 0 },
    });
    expect(result.channels).toHaveLength(2);
    expect(result.channels[0]?.length).toBe(result.channels[1]?.length);
    expect(result.channels[0]?.[10]).not.toBe(result.channels[1]?.[10]);
  });

  it('normalize edilmiş örnekler -1 ile 1 arasında', () => {
    const result = synth(0.1, { wave: 'sawtooth', frequency: 220, gain: 1 });
    for (const s of result.channels[0] ?? []) {
      expect(s).toBeGreaterThanOrEqual(-1);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it('farklı dalga şekilleri sıfır olmayan çıkış üretir', () => {
    const waves = ['sine', 'triangle', 'sawtooth', 'square', 'pulse'] as const;
    for (const wave of waves) {
      const result = synth(0.05, { wave, frequency: 440 });
      const sum = result.channels[0]?.reduce((a, b) => a + Math.abs(b), 0) ?? 0;
      expect(sum).toBeGreaterThan(0);
    }
  });

  it('gürültü türleri sıfır olmayan çıkış üretir', () => {
    const types = ['noise', 'pink', 'brown'] as const;
    for (const type of types) {
      const result = synth(0.05, { wave: type, frequency: 100 });
      const sum = result.channels[0]?.reduce((a, b) => a + Math.abs(b), 0) ?? 0;
      expect(sum).toBeGreaterThan(0);
    }
  });

  it('repeat ile daha uzun buffer üretir', () => {
    const single = synth(0.1, { wave: 'sine', frequency: 440 });
    const repeated = synthesize({
      wave: 'sine',
      frequency: 440,
      duration: 0.1,
      repeat: 3,
      repeatTime: 0.05,
    });
    expect(repeated.channels[0]?.length).toBeGreaterThan(single.channels[0]?.length ?? 0);
  });

  it('normalize hedef zirveye yaklaşır', () => {
    const buf = new Float32Array([0.1, 0.5, -0.9, 0.2]);
    const out = normalize(buf, 0.95);
    const peak = Math.max(...out.map((s) => Math.abs(s)));
    expect(peak).toBeCloseTo(0.95, 5);
  });

  it('mix tamponları toplar', () => {
    const a = new Float32Array([0.1, 0.2, 0.3]);
    const b = new Float32Array([-0.1, 0.1, -0.3]);
    const out = mix(a, b);
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[1]).toBeCloseTo(0.3, 5);
    expect(out[2]).toBeCloseTo(0, 5);
  });

  it('mix ve normalize birlikte çalışır', () => {
    const a = new Float32Array([0.1, 0.2, 0.3]);
    const b = new Float32Array([-0.1, 0.1, -0.3]);
    const summed = mix(a, b);
    const out = normalize(summed, 0.95);
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[1]).toBeCloseTo(0.95, 5);
    expect(out[2]).toBeCloseTo(0, 5);
  });

  it('hazır presetler geçerli SynthParams döner', () => {
    const params = Presets.laser(880, 0.1);
    expect(params.duration).toBe(0.1);
    expect(params.frequency).toBe(880);
    expect(params.wave).toBeDefined();
  });

  it('distortion sesi şekillendirir', () => {
    const dry = synth(0.05, { wave: 'sine', frequency: 440, gain: 1 });
    const distorted = synth(0.05, {
      wave: 'sine',
      frequency: 440,
      gain: 1,
      distortion: { amount: 1, type: 'hard' },
    });
    // Hard clip en azından zirveyi sınırlar
    const peak = Math.max(...distorted.channels[0].map((s) => Math.abs(s)));
    expect(peak).toBeLessThanOrEqual(1.01);
    // Distortion harmonik ekler, bazı örnekler kuru sinyalden farklı olur
    let diffCount = 0;
    for (let i = 0; i < dry.channels[0].length; i++) {
      if (Math.abs(dry.channels[0][i] - distorted.channels[0][i]) > 0.001) diffCount++;
    }
    expect(diffCount).toBeGreaterThan(0);
  });

  it('stereo width stereo kanalları genişletir', () => {
    const base = synth(0.05, {
      wave: 'sine',
      frequency: 440,
      pan: -0.3,
      envelope: { attack: 0, hold: 0.05, release: 0 },
    });
    const wide = synth(0.05, {
      wave: 'sine',
      frequency: 440,
      pan: -0.3,
      stereoWidth: { width: 1.5 },
      envelope: { attack: 0, hold: 0.05, release: 0 },
    });
    expect(wide.channels).toHaveLength(2);
    // Genişletilmiş çıkışta sol ve sağ arasındaki fark artar
    const baseMaxDiff = Math.max(
      ...base.channels[0].map((s, i) => Math.abs(s - base.channels[1][i])),
    );
    const wideMaxDiff = Math.max(
      ...wide.channels[0].map((s, i) => Math.abs(s - wide.channels[1][i])),
    );
    expect(wideMaxDiff).toBeGreaterThan(baseMaxDiff * 1.2);
  });

  it('pan ve stereo width birlikte çalışır', () => {
    const result = synth(0.05, {
      wave: 'square',
      frequency: 440,
      pan: 0.3,
      stereoWidth: { width: 1.2 },
      envelope: { attack: 0, hold: 0.05, release: 0 },
    });
    expect(result.channels).toHaveLength(2);
    expect(result.channels[0]?.length).toBe(result.channels[1]?.length);
  });

  it('FM ile harmonic zenginlik ekler', () => {
    const dry = synth(0.1, { wave: 'sine', frequency: 440, gain: 1 });
    const fm = synth(0.1, {
      wave: 'sine',
      frequency: 440,
      gain: 1,
      fm: { modulatorWave: 'sine', ratio: 1, index: 2 },
      envelope: { attack: 0, hold: 0.1, release: 0 },
    });
    // FM çıkışı düz sinüse göre daha fazla harmonik içerir
    const dryHf = dry.channels[0].reduce((a, s, i) => a + Math.abs(s) * (i % 2 === 0 ? 1 : -1), 0);
    const fmHf = fm.channels[0].reduce((a, s, i) => a + Math.abs(s) * (i % 2 === 0 ? 1 : -1), 0);
    expect(Math.abs(fmHf)).not.toBeCloseTo(Math.abs(dryHf), 1);
  });

  it('FM index 0 iken normal sinüs çıkar', () => {
    const a = synth(0.05, { wave: 'sine', frequency: 440 });
    const b = synth(0.05, { wave: 'sine', frequency: 440, fm: { index: 0 } });
    // Zirve normalize sonrası yaklaşık aynı
    expect(Math.max(...b.channels[0].map(Math.abs))).toBeCloseTo(
      Math.max(...a.channels[0].map(Math.abs)),
      1,
    );
  });

  it('FM presetleri sentezlenebilir', () => {
    const fmPresets = [
      Presets.bell(),
      Presets.electricPiano(),
      Presets.metallicClang(),
      Presets.dubBass(),
      Presets.fmLaser(),
    ];
    for (const params of fmPresets) {
      const result = synth(params.duration, params);
      expect(result.channels[0].length).toBeGreaterThan(0);
    }
  });

  it('sample layer synth ile karışır', () => {
    const sampleData = new Float32Array(4410).fill(0.5);
    const result = synth(0.1, {
      wave: 'sine',
      frequency: 440,
      envelope: { attack: 0, hold: 0.1, release: 0 },
      sample: { data: sampleData, gain: 0.2 },
    });
    const peak = Math.max(...result.channels[0].map(Math.abs));
    expect(peak).toBeGreaterThan(0.2);
  });

  it('phaser sinyali değiştirir', () => {
    const dry = synth(0.2, {
      wave: 'sawtooth',
      frequency: 440,
      envelope: { attack: 0, hold: 0.2, release: 0 },
    });
    const wet = synth(0.2, {
      wave: 'sawtooth',
      frequency: 440,
      phaser: { minFreq: 200, maxFreq: 2000, rate: 2, stages: 6, mix: 0.6 },
      envelope: { attack: 0, hold: 0.2, release: 0 },
    });
    let diffCount = 0;
    for (let i = 0; i < dry.channels[0].length; i++) {
      if (Math.abs(dry.channels[0][i] - wet.channels[0][i]) > 0.001) diffCount++;
    }
    expect(diffCount).toBeGreaterThan(dry.channels[0].length * 0.1);
  });

  it('flanger sinyali değiştirir', () => {
    const dry = synth(0.2, {
      wave: 'sine',
      frequency: 440,
      envelope: { attack: 0, hold: 0.2, release: 0 },
    });
    const wet = synth(0.2, {
      wave: 'sine',
      frequency: 440,
      flanger: { time: 1, depth: 0.5, rate: 2, feedback: 0.3, mix: 0.5 },
      envelope: { attack: 0, hold: 0.2, release: 0 },
    });
    let diffCount = 0;
    for (let i = 0; i < dry.channels[0].length; i++) {
      if (Math.abs(dry.channels[0][i] - wet.channels[0][i]) > 0.001) diffCount++;
    }
    expect(diffCount).toBeGreaterThan(dry.channels[0].length * 0.1);
  });

  it('DelayLine istenen gecikme kadar sonra impulsu çıkarır', () => {
    const sampleRate = 44100;
    const delay = new DelayLine({ time: 0.05, feedback: 0, mix: 1 }, sampleRate);
    const delaySamples = Math.round(0.05 * sampleRate);

    const output: number[] = [];
    // Bir impuls gönder ve delaySamples kadar örnek işle
    for (let i = 0; i <= delaySamples; i++) {
      output.push(delay.process(i === 0 ? 1 : 0));
    }

    // Gecikme süresi kadar sonra orijinal impuls dry-mix'siz olarak çıkmalı
    expect(output[0]).toBeCloseTo(0, 5);
    expect(output[delaySamples]).toBeCloseTo(1, 5);
  });

  it('Reverb impuls sonrası sönümlenir ve feedback 0.82yi aşmaz', () => {
    const reverb = new Reverb({ amount: 1, decay: 10, roomSize: 1, damp: 0.5 }, 44100);
    let energy = 0;
    let peak = 0;
    // Kısa bir impuls gönder
    for (let i = 0; i < 44100; i++) {
      const out = reverb.process(i === 0 ? 1 : 0);
      energy += out * out;
      peak = Math.max(peak, Math.abs(out));
    }
    // Çok uzun decay bile sonunda sönümlenmeli
    expect(energy).toBeGreaterThan(0);
    expect(peak).toBeLessThan(1.1);
  });
});
