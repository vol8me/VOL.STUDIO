import { describe, expect, it } from 'vitest';
import { truePeakDb } from '../../src/analysis/loudness';
import {
  compress,
  compressorCurveDb,
  shapeTransients,
  type CompressorSettings,
} from '../../src/effects/dynamics';
import { applyBiquad, biquadResponseDb, eqCoefficients, passCascade } from '../../src/effects/eq';
import { limitTruePeak } from '../../src/effects/limiter';
import { crush, saturate } from '../../src/effects/saturation';
import { powerSpectrum } from '../../src/analysis/spectrum';

/**
 * Dalga 10 işleme kapanış kanıtları: EQ standart frekans yanıtı fixture'ları
 * (analitik + ölçülen), kompresör statik/dinamik eğrisi, sessiz sidechain'de
 * bit-eşitlik ve ducking zarfı, true-peak sınırlayıcının tavanı.
 */
const RATE = 48000;

const sine = (f: number, seconds: number, amplitude = 0.5, rate = RATE) =>
  Float32Array.from(
    { length: Math.round(seconds * rate) },
    (_, i) => amplitude * Math.sin((2 * Math.PI * f * i) / rate),
  );

const rmsDb = (x: Float32Array, from = 0, to = x.length) => {
  let e = 0;
  for (let i = from; i < to; i++) e += x[i] * x[i];
  return 10 * Math.log10(e / (to - from));
};

/** Sabit sinüsün işlendikten sonraki kazancı (dB), geçici bölge atılarak. */
function measuredGain(process: (x: Float32Array) => void, f: number): number {
  const x = sine(f, 0.5);
  const y = x.slice();
  process(y);
  const from = Math.round(0.25 * RATE);
  return rmsDb(y, from) - rmsDb(x, from);
}

describe('parametrik EQ (RBJ)', () => {
  it.each([
    ['bell +6 dB @1 kHz', { type: 'bell', frequency: 1000, gainDb: 6, q: 1 }, 1000, 6],
    ['bell −9 dB @250 Hz', { type: 'bell', frequency: 250, gainDb: -9, q: 2 }, 250, -9],
    ['low-shelf +8 dB, 40 Hz', { type: 'low-shelf', frequency: 300, gainDb: 8, q: 0.707 }, 40, 8],
    [
      'low-shelf yarı kazanç kenarda',
      { type: 'low-shelf', frequency: 300, gainDb: 8, q: 0.707 },
      300,
      4,
    ],
    [
      'high-shelf −6 dB, 15 kHz',
      { type: 'high-shelf', frequency: 3000, gainDb: -6, q: 0.707 },
      15000,
      -6,
    ],
    [
      'highpass −3 dB kesimde',
      { type: 'highpass', frequency: 200, gainDb: 0, q: Math.SQRT1_2 },
      200,
      -3.01,
    ],
    [
      'lowpass −3 dB kesimde',
      { type: 'lowpass', frequency: 5000, gainDb: 0, q: Math.SQRT1_2 },
      5000,
      -3.01,
    ],
  ] as const)('%s: analitik ve ölçülen kazanç ±0.15 dB', (_n, band, f, expected) => {
    const c = eqCoefficients(band, RATE);
    expect(biquadResponseDb(c, f, RATE)).toBeCloseTo(expected, 1);
    expect(Math.abs(measuredGain((y) => applyBiquad(y, c), f) - expected)).toBeLessThan(0.15);
  });

  it('bell uzak bantta etkisiz, shelf karşı uçta etkisiz', () => {
    const bell = eqCoefficients({ type: 'bell', frequency: 1000, gainDb: 6, q: 4 }, RATE);
    expect(Math.abs(biquadResponseDb(bell, 60, RATE))).toBeLessThan(0.05);
    const shelf = eqCoefficients({ type: 'low-shelf', frequency: 200, gainDb: 10, q: 0.707 }, RATE);
    expect(Math.abs(biquadResponseDb(shelf, 12000, RATE))).toBeLessThan(0.05);
  });

  it('pass kaskadı: aşama başına 12 dB/oktav, Q son aşamada rezonans', () => {
    const response = (order: number, f: number, q = Math.SQRT1_2) =>
      passCascade('highpass', 1000, q, order, RATE).reduce(
        (db, c) => db + biquadResponseDb(c, f, RATE),
        0,
      );
    for (const order of [1, 2, 3, 4]) {
      expect(response(order, 1000)).toBeCloseTo(-3.01, 1);
      expect(response(order, 250)).toBeLessThan(-22 * order);
    }
    expect(response(1, 1000, 3)).toBeGreaterThan(8);
  });
});

const SETTINGS: CompressorSettings = {
  thresholdDb: -20,
  ratio: 4,
  kneeDb: 0,
  attackSeconds: 0.001,
  releaseSeconds: 0.05,
  makeupDb: 0,
  detector: 'peak',
  rmsSeconds: 0,
  link: 'linked',
};

describe('kompresör', () => {
  it('statik eğri: eşik altı 1:1, üstü 1:ratio; yumuşak diz süreklidir', () => {
    expect(compressorCurveDb(-30, SETTINGS)).toBe(-30);
    expect(compressorCurveDb(-8, SETTINGS)).toBeCloseTo(-17, 10);
    const soft = { ...SETTINGS, kneeDb: 12 };
    const left = compressorCurveDb(-26.0001, soft);
    const right = compressorCurveDb(-25.9999, soft);
    expect(Math.abs(left - right)).toBeLessThan(1e-3);
    expect(compressorCurveDb(-14, soft)).toBeCloseTo(-20 + 6 / 4, 6);
  });

  it('ölçülen kararlı durum kazancı statik eğriye ±0.3 dB uyar (RMS detektör)', () => {
    const settings = {
      ...SETTINGS,
      detector: 'rms' as const,
      rmsSeconds: 0.02,
      releaseSeconds: 0.2,
    };
    for (const inputDb of [-30, -14, -6]) {
      const amplitude = Math.pow(10, inputDb / 20) * Math.SQRT2;
      const x = sine(1000, 0.6, amplitude);
      const y = x.slice();
      compress([y], RATE, settings);
      const from = Math.round(0.4 * RATE);
      const expected = compressorCurveDb(inputDb, settings) - inputDb;
      expect(Math.abs(rmsDb(y, from) - rmsDb(x, from) - expected), `${inputDb} dB`).toBeLessThan(
        0.3,
      );
    }
  });

  it('atak ve bırakma zaman sabitleri: basamakta %63 dB yolu τ ±%15 içinde', () => {
    const settings = { ...SETTINGS, attackSeconds: 0.01, releaseSeconds: 0.08 };
    const step = new Float32Array(RATE).fill(0.05);
    for (let i = RATE / 4; i < RATE / 2; i++) step[i] = 1;
    const [gains] = compress([step.slice()], RATE, settings);
    const db = (i: number) => 20 * Math.log10(gains[i]);
    const target = compressorCurveDb(0, settings);
    const reach = (from: number, done: (value: number) => boolean) => {
      for (let i = from; i < gains.length; i++) if (done(db(i))) return (i - from) / RATE;
      return Infinity;
    };
    const attack = reach(RATE / 4, (v) => v <= 0.632 * target);
    const release = reach(RATE / 2, (v) => v >= 0.368 * target);
    expect(Math.abs(attack - 0.01) / 0.01).toBeLessThan(0.15);
    expect(Math.abs(release - 0.08) / 0.08).toBeLessThan(0.15);
  });

  it('sessiz sidechain çıktıyı bit-eşit bırakır; aktif sidechain ölçülür bir ducking zarfı üretir', () => {
    const music = sine(220, 1, 0.5);
    const silent = [new Float32Array(music.length)];
    const parity = music.slice();
    compress([parity], RATE, { ...SETTINGS, thresholdDb: -40, ratio: 10 }, silent);
    expect(parity).toEqual(music);
    const kick = new Float32Array(music.length);
    for (let beat = 0; beat < 4; beat++) {
      for (let i = 0; i < 2400; i++) kick[beat * 12000 + i] = 0.9 * Math.exp(-i / 600);
    }
    const ducked = music.slice();
    const [envelope] = compress(
      [ducked],
      RATE,
      { ...SETTINGS, thresholdDb: -30, ratio: 8, releaseSeconds: 0.1 },
      [kick],
    );
    const reduction = (i: number) => 20 * Math.log10(envelope[i]);
    expect(reduction(12000 + 200)).toBeLessThan(-10);
    expect(reduction(12000 + 11000)).toBeGreaterThan(reduction(12000 + 200) + 6);
    expect(rmsDb(ducked)).toBeLessThan(rmsDb(music) - 1);
  });

  it('bağlı mod iki kanala aynı zarfı, bağımsız mod ayrı zarf uygular', () => {
    const loud = sine(300, 0.3, 0.9);
    const quiet = sine(300, 0.3, 0.05);
    const linked = compress([loud.slice(), quiet.slice()], RATE, SETTINGS);
    const independent = compress([loud.slice(), quiet.slice()], RATE, {
      ...SETTINGS,
      link: 'independent',
    });
    expect(linked).toHaveLength(1);
    expect(independent).toHaveLength(2);
    expect(independent[1][10000]).toBeGreaterThan(independent[0][10000]);
  });
});

describe('true-peak sınırlayıcı', () => {
  it('örnekler arası tepeyi (fs/4 − faz) tavanın altına çeker', () => {
    const x = Float32Array.from(
      { length: RATE },
      (_, i) => 1.2 * Math.sin((Math.PI / 2) * i + Math.PI / 4),
    );
    const samplePeakDb = 20 * Math.log10(Math.max(...x.map(Math.abs)));
    expect(truePeakDb([x], RATE) - samplePeakDb).toBeGreaterThan(2.9);
    const y = x.slice();
    const outcome = limitTruePeak([y], RATE, {
      ceilingDb: -1,
      lookaheadSeconds: 0.005,
      releaseSeconds: 0.05,
    });
    expect(truePeakDb([y], RATE)).toBeLessThanOrEqual(-1 + 0.002);
    expect(outcome.truePeakDb).toBeLessThanOrEqual(-1 + 0.002);
    const needed = -1 - truePeakDb([x], RATE);
    expect(outcome.maxReductionDb).toBeLessThanOrEqual(needed + 0.002);
    expect(outcome.maxReductionDb).toBeGreaterThan(needed - 0.5);
  });

  it('tavan altındaki sinyale dokunmaz; tepe öncesi kazanç ileri bakışla iner (tık yok)', () => {
    const quiet = sine(440, 0.3, 0.3);
    const copy = quiet.slice();
    expect(
      limitTruePeak([copy], RATE, { ceilingDb: -1, lookaheadSeconds: 0.005, releaseSeconds: 0.05 })
        .maxReductionDb,
    ).toBe(0);
    expect(copy).toEqual(quiet);
    const burst = sine(440, 0.3, 0.2);
    for (let i = 7000; i < 7400; i++) burst[i] *= 5;
    const out = burst.slice();
    limitTruePeak([out], RATE, { ceilingDb: -3, lookaheadSeconds: 0.004, releaseSeconds: 0.05 });
    const gain = (i: number) => Math.abs(out[i] / (burst[i] || 1));
    let worstStep = 0;
    for (let i = 6500; i < 7400; i++) {
      if (Math.abs(burst[i]) > 0.05 && Math.abs(burst[i - 1]) > 0.05)
        worstStep = Math.max(worstStep, Math.abs(gain(i) - gain(i - 1)));
    }
    expect(worstStep).toBeLessThan(0.05);
    expect(truePeakDb([out], RATE)).toBeLessThanOrEqual(-3 + 0.002);
  });
});

describe('transient şekillendirici, doygunluk, bit indirgeme', () => {
  const hits = () => {
    const x = new Float32Array(RATE);
    for (const at of [1000, 16000, 32000]) {
      for (let i = 0; i < 12000; i++)
        x[at + i] = 0.5 * Math.exp(-i / 3000) * Math.sin((2 * Math.PI * 330 * i) / RATE);
    }
    return x;
  };

  it('atak kazancı ilk 5 ms’yi, gövde kazancı kuyruğu seviyeden bağımsız değiştirir', () => {
    const x = hits();
    const attack = x.slice();
    shapeTransients([attack], RATE, { attackDb: 9, sustainDb: 0, speedSeconds: 0.002 });
    const sustain = x.slice();
    shapeTransients([sustain], RATE, { attackDb: 0, sustainDb: -9, speedSeconds: 0.002 });
    const head = (y: Float32Array) => rmsDb(y, 16000, 16240) - rmsDb(x, 16000, 16240);
    const tail = (y: Float32Array) => rmsDb(y, 22000, 27000) - rmsDb(x, 22000, 27000);
    expect(head(attack)).toBeGreaterThan(2);
    expect(Math.abs(tail(attack))).toBeLessThan(1);
    expect(tail(sustain)).toBeLessThan(-3);
    const scaled = Float32Array.from(x, (v) => v * 0.1);
    shapeTransients([scaled], RATE, { attackDb: 9, sustainDb: 0, speedSeconds: 0.002 });
    expect(head(Float32Array.from(scaled, (v) => v * 10))).toBeCloseTo(head(attack), 3);
  });

  it('doygunluk tanh tek, asymmetric çift harmonik üretir; 4× aşırı örnekleme alias’ı bastırır', () => {
    const f = 1000;
    const level = (y: Float32Array, hz: number) => {
      const size = 16384;
      const p = powerSpectrum(y, 8192, size);
      const k = Math.round((hz * size) / RATE);
      return 10 * Math.log10(Math.max(p[k - 1], p[k], p[k + 1]) + 1e-30);
    };
    const odd = sine(f, 1, 0.9);
    saturate([odd], { driveDb: 18, character: 'tanh', mix: 1, outputDb: 0 });
    const even = sine(f, 1, 0.9);
    saturate([even], { driveDb: 18, character: 'asymmetric', mix: 1, outputDb: 0 });
    expect(level(odd, 3 * f) - level(odd, 2 * f)).toBeGreaterThan(30);
    expect(level(even, 2 * f)).toBeGreaterThan(level(odd, 2 * f) + 30);
    const high = sine(7000, 1, 0.9);
    const naive = high.map((v) => Math.max(-1, Math.min(1, v * Math.pow(10, 24 / 20))));
    saturate([high], { driveDb: 24, character: 'hard', mix: 1, outputDb: 0 });
    const alias = 48000 - 5 * 7000;
    const naiveAlias = level(naive, alias) - level(naive, 7000);
    const oversampledAlias = level(high, alias) - level(high, 7000);
    expect(naiveAlias).toBeGreaterThan(-20);
    expect(oversampledAlias).toBeLessThan(-45);
    expect(naiveAlias - oversampledAlias).toBeGreaterThan(30);
  });

  it('bit indirgeme seviye sayısı ve örnek tutma ile basamak üretir', () => {
    const x = sine(100, 0.1, 0.8);
    crush([x], { bits: 3, hold: 4, mix: 1 });
    const levels = new Set([...x].map((v) => v.toFixed(6)));
    expect(levels.size).toBeLessThanOrEqual(9);
    for (let i = 0; i < 400; i += 4) expect(x[i + 1]).toBe(x[i]);
  });
});
