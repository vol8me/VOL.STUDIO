import { fft } from '../analysis/spectrum';
import { AudioParamError } from '../guard/errors';
import { resample } from './sample';

/**
 * Birbirinden BAĞIMSIZ zaman germe ve perde kaydırma (offline).
 *
 * - `wsola` — Waveform Similarity Overlap-Add (Verhelst & Roelands 1993):
 *   40 ms Hann çerçeve, %50 örtüşme; her çerçeve doğal devamıyla en benzer
 *   (±10 ms, normalize çapraz ilinti) giriş konumundan alınır. Dalga biçimini
 *   kopyaladığı için transient'leri korur; tonal materyalde çerçeve sınırında
 *   hafif pürüz bırakabilir.
 * - `phase-vocoder` — kimlik faz kilitli faz vokoderi (Laroche & Dolson
 *   1999): ~43 ms Hann, %75 örtüşme; tepe kutuların anlık frekansı ile faz
 *   ilerletilir, tepenin etki bölgesindeki kutular tepeye kilitlenir (faz
 *   tutarlılığı → "fazlılık" azalır). Tonal materyalde temiz; transient'leri
 *   bulaştırır.
 *
 * Perde kaydırma = oranla germe + aynı oranla Kaiser sinc yeniden örnekleme
 * (süre korunur). `resample` yöntemi klasik bağlı değişimdir: hız
 * 2^(p/12)/stretch ile hem perde hem süre birlikte değişir.
 */
export type StretchMethod = 'wsola' | 'phase-vocoder' | 'resample';

const hann = (length: number) =>
  Float64Array.from({ length }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / length));

function checkFactor(factor: number, label: string): void {
  if (!(factor >= 0.25 && factor <= 4)) {
    throw new AudioParamError(label, 'range', '[0.25, 4] aralığında olmalı', factor);
  }
}

export function stretchWsola(x: Float32Array, stretch: number, sampleRate: number): Float32Array {
  checkFactor(stretch, 'stretch');
  const outLength = Math.max(1, Math.round(x.length * stretch));
  if (stretch === 1) return x.slice(0, outLength);
  const frame = 2 * Math.round(0.02 * sampleRate);
  const synthesisHop = frame / 2;
  const analysisHop = synthesisHop / stretch;
  const tolerance = Math.round(0.01 * sampleRate);
  const window = hann(frame);
  const out = new Float64Array(outLength + frame);
  const at = (i: number) => (i >= 0 && i < x.length ? x[i] : 0);
  let previous = 0;
  const frames = Math.ceil(outLength / synthesisHop) + 1;
  for (let k = 0; k < frames; k++) {
    let start = Math.round(k * analysisHop);
    if (k > 0) {
      const natural = previous + synthesisHop;
      let best = start;
      let bestScore = -Infinity;
      for (let delta = -tolerance; delta <= tolerance; delta++) {
        const candidate = start + delta;
        let cross = 0;
        let energy = 1e-12;
        for (let n = 0; n < frame; n += 4) {
          const c = at(candidate + n);
          cross += at(natural + n) * c;
          energy += c * c;
        }
        const score = cross / Math.sqrt(energy);
        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
      start = best;
    }
    const base = k * synthesisHop;
    for (let n = 0; n < frame && base + n < out.length; n++)
      out[base + n] += window[n] * at(start + n);
    previous = start;
  }
  return Float32Array.from(out.subarray(0, outLength));
}

const princarg = (phase: number) => phase - 2 * Math.PI * Math.round(phase / (2 * Math.PI));

export function stretchPhaseVocoder(
  x: Float32Array,
  stretch: number,
  sampleRate: number,
): Float32Array {
  checkFactor(stretch, 'stretch');
  const outLength = Math.max(1, Math.round(x.length * stretch));
  if (stretch === 1) return x.slice(0, outLength);
  let size = 256;
  while (size < 0.04 * sampleRate) size *= 2;
  const hop = size / 4;
  const half = size / 2;
  const window = hann(size);
  const out = new Float64Array(outLength + size);
  const previousPhase = new Float64Array(half + 1);
  const synthPhase = new Float64Array(half + 1);
  const frames = Math.ceil(outLength / hop) + 1;
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const magnitude = new Float64Array(half + 1);
  const phase = new Float64Array(half + 1);
  let lastStart = 0;
  for (let m = 0; m < frames; m++) {
    const start = Math.round((m * hop) / stretch);
    for (let n = 0; n < size; n++) {
      const i = start + n;
      re[n] = (i < x.length ? x[i] : 0) * window[n];
      im[n] = 0;
    }
    fft(re, im);
    for (let k = 0; k <= half; k++) {
      magnitude[k] = Math.hypot(re[k], im[k]);
      phase[k] = Math.atan2(im[k], re[k]);
    }
    if (m === 0) {
      synthPhase.set(phase);
    } else {
      const analysisHop = Math.max(1, start - lastStart);
      const peaks: number[] = [];
      for (let k = 1; k < half; k++) {
        if (magnitude[k] > magnitude[k - 1] && magnitude[k] >= magnitude[k + 1]) peaks.push(k);
      }
      if (peaks.length === 0) peaks.push(1);
      const advanced = new Float64Array(half + 1);
      for (const p of peaks) {
        const omega = (2 * Math.PI * p) / size;
        const deviation = princarg(phase[p] - previousPhase[p] - omega * analysisHop);
        advanced[p] = synthPhase[p] + (hop * (omega * analysisHop + deviation)) / analysisHop;
      }
      let region = 0;
      for (let k = 0; k <= half; k++) {
        while (region + 1 < peaks.length && k > (peaks[region] + peaks[region + 1]) / 2) region++;
        const p = peaks[region];
        synthPhase[k] = advanced[p] + (phase[k] - phase[p]);
      }
    }
    previousPhase.set(phase);
    lastStart = start;
    for (let k = 0; k <= half; k++) {
      re[k] = magnitude[k] * Math.cos(synthPhase[k]);
      im[k] = magnitude[k] * Math.sin(synthPhase[k]);
      if (k > 0 && k < half) {
        re[size - k] = re[k];
        im[size - k] = -im[k];
      }
    }
    for (let n = 0; n < size; n++) im[n] = -im[n];
    fft(re, im);
    const base = m * hop;
    for (let n = 0; n < size && base + n < out.length; n++) {
      out[base + n] += ((re[n] / size) * window[n]) / 1.5;
    }
  }
  return Float32Array.from(out.subarray(0, outLength));
}

/**
 * Kenar dolgusu: ilk ve son yarım çerçeve tek pencereyle örtülür ve söner;
 * giriş iki yandan 50 ms sıfırla uzatılıp çıktı karşılık gelen aralıktan
 * kesilir — başlangıçtaki transient pencere yükselişinde kaybolmaz.
 */
export function timeStretch(
  x: Float32Array,
  stretch: number,
  method: Exclude<StretchMethod, 'resample'>,
  sampleRate: number,
): Float32Array {
  checkFactor(stretch, 'stretch');
  const outLength = Math.max(1, Math.round(x.length * stretch));
  if (stretch === 1) return x.slice(0, outLength);
  const pad = Math.round(0.05 * sampleRate);
  const padded = new Float32Array(x.length + 2 * pad);
  padded.set(x, pad);
  const core = method === 'wsola' ? stretchWsola : stretchPhaseVocoder;
  const y = core(padded, stretch, sampleRate);
  const offset = Math.round(pad * stretch);
  return y.slice(offset, offset + outLength);
}

/**
 * Perde (yarım ton) ve süre (oran) değişimi. `resample` dışında ikisi
 * bağımsızdır: çıktı uzunluğu round(L·stretch), perde 2^(p/12).
 */
export function shiftAndStretch(
  x: Float32Array,
  semitones: number,
  stretch: number,
  method: StretchMethod,
  sampleRate: number,
): Float32Array {
  checkFactor(stretch, 'stretch');
  if (!(Math.abs(semitones) <= 24)) {
    throw new AudioParamError('pitch', 'range', '[−24, 24] yarım ton', semitones);
  }
  const ratio = Math.pow(2, semitones / 12);
  if (method === 'resample') return resample(x, ratio / stretch);
  const outLength = Math.max(1, Math.round(x.length * stretch));
  if (semitones === 0) return timeStretch(x, stretch, method, sampleRate);
  const combined = stretch * ratio;
  const stretched =
    combined >= 0.25 && combined <= 4
      ? timeStretch(x, combined, method, sampleRate)
      : timeStretch(timeStretch(x, stretch, method, sampleRate), ratio, method, sampleRate);
  return resample(stretched, ratio, outLength);
}
