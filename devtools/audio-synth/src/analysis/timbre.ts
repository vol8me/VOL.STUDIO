import { powerSpectrum } from './spectrum';

/**
 * Tını zarfı (`timbre-envelope-v1`): perde ve seviye eşitlendikten sonra
 * kalan spektral biçim. Uzun dönem spektrumu 1/6 oktav bantlarda (25 Hz –
 * 16 kHz) dB olarak alınır; iki zarfın uzaklığı, biri log-frekansta ±3
 * oktava kadar kaydırılırken ortalaması çıkarılmış farkın en küçük RMS'idir.
 * Böylece aynı mekanizmanın hızlanması (motor devri, perde) spektrumu
 * kaydırır ama kimliği değiştirmez; ortalamayı çıkarmak seviyeyi eler.
 *
 * Kareler 8192 nokta Hann, yarı örtüşme; en güçlü karenin 40 dB altındaki
 * kareler sayılmaz; bantlar en güçlü bandın 60 dB altında kırpılır.
 * Bu bir ölçüm sözleşmesidir, algısal "aynı kaynak" iddiası değildir: eşik
 * aile başına beyan edilir, yabancı sesleri ayırdığı testte gösterilir.
 * Ses yolu formant gibi SABİT rezonanslarla tanınan kaynaklarda (konuşma)
 * kaydırma serbestliği fazla hoşgörülüdür; o aileler kaydırmayı daraltmalı.
 */
export const TIMBRE_METHOD = 'timbre-envelope-v1';

const FRAME = 8192;
const HOP = FRAME / 2;
const LOW_HZ = 25;
const HIGH_HZ = 16000;
export const TIMBRE_BANDS_PER_OCTAVE = 6;
const BANDS = Math.floor(Math.log2(HIGH_HZ / LOW_HZ) * TIMBRE_BANDS_PER_OCTAVE);
const ACTIVE_DB = 40;
const FLOOR_DB = 60;
/** Karşılaştırmada en az bu oranda bant örtüşmeli. */
const MIN_OVERLAP = 0.6;
export const TIMBRE_MAX_SHIFT_OCTAVES = 3;

function hann(size: number): Float64Array {
  return Float64Array.from(
    { length: size },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size),
  );
}

/** Mono katlanmış sinyalin tını zarfı (dB, 1/6 oktav); etkin kare yoksa `null`. */
export function timbreEnvelope(
  channels: readonly Float32Array[],
  sampleRate: number,
): number[] | null {
  const mono =
    channels.length === 1 ? channels[0] : channels[0].map((x, i) => 0.5 * (x + channels[1][i]));
  const window = hann(FRAME);
  const spectra: Float64Array[] = [];
  const energies: number[] = [];
  for (let at = 0; at + FRAME <= Math.max(FRAME, mono.length); at += HOP) {
    const power = powerSpectrum(mono, at, FRAME, window);
    spectra.push(power);
    energies.push(power.reduce((sum, p) => sum + p, 0));
  }
  const loudest = Math.max(...energies);
  if (!(loudest > 0)) return null;
  const bands = new Float64Array(BANDS);
  spectra.forEach((power, f) => {
    if (energies[f] < loudest * 10 ** (-ACTIVE_DB / 10)) return;
    for (let k = 1; k < power.length; k++) {
      const hz = (k * sampleRate) / FRAME;
      if (hz < LOW_HZ || hz >= HIGH_HZ) continue;
      const b = Math.floor(Math.log2(hz / LOW_HZ) * TIMBRE_BANDS_PER_OCTAVE);
      if (b < BANDS) bands[b] += power[k];
    }
  });
  const db = Array.from(bands, (e) => 10 * Math.log10(e + 1e-30));
  const top = Math.max(...db);
  return db.map((v) => Number(Math.max(v, top - FLOOR_DB).toFixed(3)));
}

export interface TimbreDistanceV1 {
  /** Ortalaması çıkarılmış zarf farkının RMS'i (dB). */
  readonly distance: number;
  /** En iyi hizadaki kaydırma (oktav; + → ikinci zarf daha tiz). */
  readonly shiftOctaves: number;
}

export function timbreDistance(
  a: readonly number[],
  b: readonly number[],
  maxShiftOctaves = TIMBRE_MAX_SHIFT_OCTAVES,
): TimbreDistanceV1 {
  const limit = Math.round(maxShiftOctaves * TIMBRE_BANDS_PER_OCTAVE);
  let best = { distance: Infinity, shiftOctaves: 0 };
  for (let s = -limit; s <= limit; s++) {
    let n = 0;
    let sa = 0;
    let sb = 0;
    for (let i = 0; i < a.length; i++) {
      if (i + s < 0 || i + s >= b.length) continue;
      n++;
      sa += a[i];
      sb += b[i + s];
    }
    if (n < MIN_OVERLAP * a.length) continue;
    const offset = (sa - sb) / n;
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      if (i + s >= 0 && i + s < b.length) sum += (a[i] - b[i + s] - offset) ** 2;
    }
    const distance = Math.sqrt(sum / n);
    if (distance < best.distance) best = { distance, shiftOctaves: s / TIMBRE_BANDS_PER_OCTAVE };
  }
  return {
    distance: Number(best.distance.toFixed(3)),
    shiftOctaves: Number(best.shiftOctaves.toFixed(3)),
  };
}
