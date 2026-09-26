import { describe, expect, it } from 'vitest';
import { powerSpectrum } from '../src/analysis/spectrum';
import { downsample2x } from '../src/engine/render';
import {
  NOISE_CLOCK_PER_HZ,
  renderRetro,
  RETRO_TABLES,
  waveformFields,
  type RetroEnvelopeV1,
  type RetroOscillatorV1,
  type RetroPitchV1,
  type RetroWaveform,
} from '../src/synthesis/retro';
import { autocorrelationPitch, peakFrequency } from './support/measure';
import { RENDER_BLOCK } from './support/timeouts';

const RATE = 44100;
const FLAT: RetroEnvelopeV1 = { attack: 0, decay: 0, sustain: 1, release: 0, steps: 0 };

function osc(waveform: RetroWaveform, over: Partial<RetroOscillatorV1> = {}): RetroOscillatorV1 {
  return {
    ...waveformFields(waveform),
    duty: 0.5,
    dutyTo: 0.5,
    dutySeconds: 0,
    noiseClockHz: null,
    interpolate: false,
    syncRatio: 1,
    bits: 0,
    holdHz: 0,
    ...over,
  };
}

function pitch(frequencyHz: number, over: Partial<RetroPitchV1> = {}): RetroPitchV1 {
  return { frequencyHz, arpeggio: null, sweep: null, vibrato: null, ...over };
}

function render(
  o: RetroOscillatorV1,
  p: RetroPitchV1,
  seconds = 0.7,
  envelope = FLAT,
  oversample = 2,
): Float32Array {
  return renderRetro(o, p, envelope, {
    seconds,
    sampleRate: RATE,
    oversample,
    gain: 1,
    decimate: (b) => downsample2x(b, RATE * 2, RATE),
  });
}

/** Kafes dışı / kafes gücü (dB): harmonik olmayan her enerji katlanmadır. */
function aliasDb(x: Float32Array, f: number): number {
  const size = 16384;
  const power = powerSpectrum(x, Math.floor(0.25 * RATE), size);
  const binHz = RATE / size;
  const top = Math.floor((0.4535 * RATE) / binHz);
  const on = new Uint8Array(top + 1);
  for (let k = 0; k <= 5; k++) on[k] = 1;
  for (let m = 1; m * f <= 0.4535 * RATE + 5 * binHz; m++) {
    const c = Math.round((m * f) / binHz);
    for (let k = c - 5; k <= c + 5; k++) if (k >= 0 && k <= top) on[k] = 1;
  }
  let signal = 0;
  let alias = 0;
  for (let k = 0; k <= top; k++) {
    if (on[k]) signal += power[k];
    else alias += power[k];
  }
  return 10 * Math.log10(alias / signal);
}

function harmonic(x: Float32Array, f: number, n: number): number {
  const size = 16384;
  const power = powerSpectrum(x, Math.floor(0.2 * RATE), size);
  const bin = Math.round((n * f * size) / RATE);
  return power[bin - 1] + power[bin] + power[bin + 1];
}

describe('retro çekirdek', RENDER_BLOCK, () => {
  it('periyodik dalgalar notanın perdesinde çalar; sync periyodu değiştirmez', () => {
    for (const waveform of [
      'pulse',
      'triangle',
      'triangle-4bit',
      'sawtooth',
      'table-organ',
    ] as const) {
      expect(
        peakFrequency(render(osc(waveform), pitch(440)), RATE, 4096, 8192, [100, 2000]),
      ).toBeCloseTo(440, 0);
    }
    const synced = render(osc('sawtooth', { syncRatio: 2.7 }), pitch(220));
    expect(autocorrelationPitch(synced, RATE, 4096, 8192, 150, 1000)).toBeCloseTo(220, -1);
  });

  it('duty 0.5 çift harmonikleri söndürür; 0.25 dördüncüyü söndürür', () => {
    const half = render(osc('pulse', { duty: 0.5 }), pitch(220));
    const quarter = render(osc('pulse', { duty: 0.25 }), pitch(220));
    expect(harmonic(half, 220, 2) / harmonic(half, 220, 1)).toBeLessThan(1e-4);
    expect(harmonic(quarter, 220, 2) / harmonic(quarter, 220, 1)).toBeGreaterThan(0.1);
    expect(harmonic(quarter, 220, 4) / harmonic(quarter, 220, 1)).toBeLessThan(1e-4);
  });

  it('kısa LFSR kipi 93 adımlık dizidir: perde saat/93; uzun kip periyodik değildir', () => {
    const short = render(osc('noise-short'), pitch(200));
    expect(autocorrelationPitch(short, RATE, 2048, 8192, 150, 800)).toBeCloseTo(200, -1);
    const long = render(osc('noise-long'), pitch(200));
    const period = Math.round(RATE / 200);
    let corr = 0;
    let energy = 0;
    for (let i = 4096; i < 12288; i++) {
      corr += long[i] * long[i + period];
      energy += long[i] * long[i];
    }
    expect(Math.abs(corr / energy)).toBeLessThan(0.2);
    expect(NOISE_CLOCK_PER_HZ).toBe(93);
  });

  it('bits genliği 2^(bits−1) seviyeye kuantalar; holdHz örneği tutar', () => {
    const crushed = render(osc('triangle', { bits: 3 }), pitch(110));
    const levels = new Set([...crushed.slice(1000, 20000)].map((v) => Math.round(v * 4)));
    expect(levels.size).toBeLessThanOrEqual(9);
    const held = render(osc('triangle', { holdHz: 4410 }), pitch(110));
    for (let i = 1000; i < 1100; i += 10) {
      expect(new Set(held.slice(i, i + 10)).size).toBe(1);
    }
  });

  it('4-bit zarf seviyesi 16 basamaktır', () => {
    const stepped: RetroEnvelopeV1 = { attack: 0, decay: 0.5, sustain: 0, release: 0, steps: 16 };
    // Kenarsız kaynak: sabit tabloda |x| = zarf değeridir; BLEP kenar lobu
    // basamak sayımına karışmaz.
    const flat = {
      ...osc('table-square-4bit', { interpolate: false }),
      table: [1, 1, 1, 1, 1, 1, 1, 1],
    };
    const x = render(flat, pitch(55), 0.5, stepped, 1);
    const envelope = new Set<number>();
    for (let i = 0; i < x.length; i += 401) envelope.add(Math.round(Math.abs(x[i]) * 1e4));
    expect(envelope.size).toBeLessThanOrEqual(17);
  });

  it('arpej perdeyi kalıp hızıyla değiştirir; süpürme hedefe iner', () => {
    const arp = render(
      osc('pulse'),
      pitch(330, { arpeggio: { semitones: [0, 7], rateHz: 10 } }),
      0.4,
    );
    const first = peakFrequency(arp, RATE, 0, 2048, [200, 1000]);
    const second = peakFrequency(arp, RATE, Math.round(0.1 * RATE), 2048, [200, 1000]);
    expect(second / first).toBeCloseTo(Math.pow(2, 7 / 12), 1);
    const swept = render(
      osc('sawtooth'),
      pitch(220, { sweep: { semitones: 12, seconds: 0.2 } }),
      0.6,
    );
    expect(peakFrequency(swept, RATE, 0, 1024, [100, 1000])).toBeGreaterThan(330);
    expect(peakFrequency(swept, RATE, Math.round(0.3 * RATE), 4096, [100, 1000])).toBeCloseTo(
      220,
      -1,
    );
  });

  it('özel tablo çalar; ara değerli okuma basamaklıdan koyudur', () => {
    const table = [0, 1, 0.5, -0.5, -1, 0.2, -0.2, 0];
    const stepped = render(osc('table-ramp-4bit', { table, interpolate: false }), pitch(440));
    const smooth = render(osc('table-ramp-4bit', { table, interpolate: true }), pitch(440));
    expect(harmonic(stepped, 440, 9)).toBeGreaterThan(harmonic(smooth, 440, 9) * 2);
    expect(RETRO_TABLES['triangle-4bit']).toHaveLength(32);
  });

  it('deterministik: aynı istek aynı örnekler', () => {
    const a = render(osc('noise-long'), pitch(300), 0.3);
    const b = render(osc('noise-long'), pitch(300), 0.3);
    expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(true);
  });
});

/**
 * Kenar alias'ı ÖLÇÜLEREK kilitlenir (kafes yöntemi, 2× iç oran): ölçülen
 * değerin 2 dB üstü sınırdır. PolyBLEP kenar-zamanı düzeltmesi sonrası tüm
 * ızgara −87 dB altına indi; güncel ızgara `scripts/polyblep-alias-report.ts`
 * ile koşulur. F6a hedefi 3.6 kHz testerede −70 dB idi; ölçülen −88.3 dB.
 */
describe('retro alias kilidi', RENDER_BLOCK, () => {
  const limits: [RetroWaveform, Partial<RetroOscillatorV1>, number, number][] = [
    ['pulse', { duty: 0.25 }, 233, -88],
    ['pulse', { duty: 0.25 }, 3600, -88],
    ['sawtooth', {}, 917, -87],
    ['sawtooth', {}, 3600, -86],
    ['triangle-4bit', {}, 917, -86],
    ['table-organ', {}, 3600, -86],
    ['sawtooth', { syncRatio: 2.5 }, 917, -87],
  ];
  it.each(limits)('%s %j @ %d Hz ≤ %d dB', (waveform, over, f, limit) => {
    expect(aliasDb(render(osc(waveform, over), pitch(f)), f)).toBeLessThanOrEqual(limit);
  });
});
