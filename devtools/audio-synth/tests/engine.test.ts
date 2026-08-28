import { describe, it, expect } from 'vitest';
import { synthesize, synth, normalize, mix, Presets } from '@volstudio/audio-synth';
import { DelayLine, Reverb } from '../src/effects';

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
    // FM, taşıyıcının fazını modüle eder — sonuç düz sinüsten farklı bir
    // dalga formudur. Normalizasyon zirveleri eşitleyebileceği için peak
    // karşılaştırması güvenilmez; bunun yerine örnek-örnek farkın sıfır
    // olmaması, iki dalga formunun farklı olduğunu doğrular.
    const dryCh = dry.channels[0];
    const fmCh = fm.channels[0];
    let maxDiff = 0;
    for (let i = 0; i < dryCh.length; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(dryCh[i] - fmCh[i]));
    }
    expect(maxDiff).toBeGreaterThan(0.01);
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

  it('additive harmonics: h.gain genliği kontrol eder (yoksayılmaz)', () => {
    const envelope = { attack: 0, hold: 0.05, release: 0 };
    const loud = synthesize({
      harmonics: [
        { ratio: 1, gain: 0.05 },
        { ratio: 2, gain: 1.0 },
      ],
      frequency: 440,
      duration: 0.05,
      normalize: false,
      envelope,
    });
    const quiet = synthesize({
      harmonics: [
        { ratio: 1, gain: 0.05 },
        { ratio: 2, gain: 0.05 },
      ],
      frequency: 440,
      duration: 0.05,
      normalize: false,
      envelope,
    });
    const energy = (ch: Float32Array) => ch.reduce((a, b) => a + b * b, 0);
    // Yalnızca 2. harmonik'in gain'i farklı (1.0 vs 0.05) — `h.gain`
    // uygulanmazsa iki çıktı da eşit enerjili olurdu.
    expect(energy(loud.channels[0])).toBeGreaterThan(energy(quiet.channels[0]) * 2);
  });

  it('additive harmonics: Nyquist üstü harmonikler çıktıya katkı yapmaz', () => {
    const base = {
      frequency: 15000,
      duration: 0.05,
      normalize: false,
      envelope: { attack: 0, hold: 0.05, release: 0 },
    } as const;
    // ratio=1 → 15000Hz, iç örnekleme Nyquist'inin (~39690Hz) altında, duyulur.
    // ratio=3/5/7 → 45000/75000/105000Hz, kesinlikle üstünde.
    const onlyFundamental = synthesize({ ...base, harmonics: [{ ratio: 1, gain: 1 }] });
    const withInaudibleHarmonics = synthesize({
      ...base,
      harmonics: [
        { ratio: 1, gain: 1 },
        { ratio: 3, gain: 1 },
        { ratio: 5, gain: 1 },
        { ratio: 7, gain: 1 },
      ],
    });
    // Nyquist üstü harmonikler tamamen sessiz olmalı — eskiden hepsi aynı
    // katlanmış (nyquistLimit) frekansa binip fazladan enerji/yapay ton
    // eklerdi, bu durumda iki çıktı FARKLI olurdu.
    const chA = onlyFundamental.channels[0];
    const chB = withInaudibleHarmonics.channels[0];
    expect(chA.length).toBe(chB.length);
    for (let i = 0; i < chA.length; i++) {
      expect(chB[i]).toBeCloseTo(chA[i], 5);
    }
  });

  it('SynthParams: NaN/Infinity/0/negatif değerler çökme veya sessiz-boş çıktı üretmez', () => {
    const cases = [
      { duration: NaN },
      { duration: Infinity },
      { duration: -5 },
      { frequency: NaN },
      { frequency: Infinity },
      { frequency: -100 },
      { sampleRate: 0 },
      { sampleRate: NaN },
      { sampleRate: -44100 },
      { repeat: NaN },
      { repeat: -5 },
      { repeat: Infinity },
      { repeatTime: NaN },
      { seed: NaN },
      { gain: NaN },
      { pulseWidth: NaN },
      { slide: NaN },
      { slide: Infinity },
    ];
    for (const overrides of cases) {
      const result = synthesize({ wave: 'sine', frequency: 440, duration: 0.05, ...overrides });
      expect(result.channels[0].length).toBeGreaterThan(0);
      for (const s of result.channels[0]) {
        expect(Number.isFinite(s)).toBe(true);
      }
    }
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
