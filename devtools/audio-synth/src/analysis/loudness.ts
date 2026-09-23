/**
 * Yükseklik ve tepe ölçümü — ITU-R BS.1770-5 / EBU Tech 3341 anlamında.
 *
 * RMS "LUFS" DEĞİLDİR ve örnek tepesi "true peak" DEĞİLDİR: LUFS K-ağırlıklı,
 * kapılı ortalamadır; true peak örnekler ARASINDAKİ tepedir. Bu dosya ikisini
 * de standardın tanımıyla hesaplar; RMS/örnek tepe ayrı adlarla kalır.
 */

export interface Biquad {
  readonly b: readonly [number, number, number];
  readonly a: readonly [number, number];
}

/**
 * K-ağırlıklama: yüksek raf (1. aşama) + RLB yüksek geçiren (2. aşama).
 * BS.1770 katsayıları yalnız 48 kHz için verir ve diğer oranlar için "aynı
 * frekans yanıtını" ister; analog prototip parametreleri 48 kHz tablosunu
 * ~1e-15 hassasiyetle yeniden üreten ters parametrizasyondur (libebur128 /
 * FFmpeg af_ebur128).
 */
export function kWeighting(sampleRate: number): readonly [Biquad, Biquad] {
  const shelfK = Math.tan((Math.PI * 1681.974450955533) / sampleRate);
  const shelfQ = 0.7071752369554196;
  const vh = Math.pow(10, 3.999843853973347 / 20);
  const vb = Math.pow(vh, 0.4996667741545416);
  const shelfA0 = 1 + shelfK / shelfQ + shelfK * shelfK;
  const shelf: Biquad = {
    b: [
      (vh + (vb * shelfK) / shelfQ + shelfK * shelfK) / shelfA0,
      (2 * (shelfK * shelfK - vh)) / shelfA0,
      (vh - (vb * shelfK) / shelfQ + shelfK * shelfK) / shelfA0,
    ],
    a: [(2 * (shelfK * shelfK - 1)) / shelfA0, (1 - shelfK / shelfQ + shelfK * shelfK) / shelfA0],
  };
  const hpK = Math.tan((Math.PI * 38.13547087602444) / sampleRate);
  const hpQ = 0.5003270373238773;
  const hpA0 = 1 + hpK / hpQ + hpK * hpK;
  const highpass: Biquad = {
    b: [1, -2, 1],
    a: [(2 * (hpK * hpK - 1)) / hpA0, (1 - hpK / hpQ + hpK * hpK) / hpA0],
  };
  return [shelf, highpass];
}

function filterBiquad(input: Float64Array | Float32Array, stage: Biquad): Float64Array {
  const out = new Float64Array(input.length);
  const [b0, b1, b2] = stage.b;
  const [a1, a2] = stage.a;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  return out;
}

/** Kanal başına K-ağırlıklı karelerin önek toplamı: blok ortalaması O(1) olur. */
function weightedSquarePrefix(channel: Float32Array, sampleRate: number): Float64Array {
  const [shelf, highpass] = kWeighting(sampleRate);
  const weighted = filterBiquad(filterBiquad(channel, shelf), highpass);
  const prefix = new Float64Array(weighted.length + 1);
  for (let i = 0; i < weighted.length; i++) prefix[i + 1] = prefix[i] + weighted[i] * weighted[i];
  return prefix;
}

/**
 * BS.1770 kanal ağırlıkları: L, R, C = 1.0; surround 1.41; LFE dışarıda.
 * Çözücü yalnız mono ve stereo verir; ikisinde de ağırlık 1'dir. Mono dosya
 * tek kanal sayılır (FFmpeg ebur128'in varsayılanı; "dual mono" değil).
 */
const CHANNEL_WEIGHT = 1;

function loudnessOf(sumWeightedMeanSquares: number): number {
  return sumWeightedMeanSquares > 0
    ? -0.691 + 10 * Math.log10(sumWeightedMeanSquares)
    : Number.NEGATIVE_INFINITY;
}

function blockMeanSquares(
  prefixes: readonly Float64Array[],
  start: number,
  length: number,
  total: number,
): number {
  let sum = 0;
  const end = Math.min(total, start + length);
  const from = Math.max(0, start);
  for (const prefix of prefixes) {
    sum += (CHANNEL_WEIGHT * (prefix[end] - prefix[from])) / length;
  }
  return sum;
}

/**
 * Kapılı integrated loudness (LUFS). 400 ms blok, %75 örtüşme; mutlak kapı
 * −70 LUFS, göreli kapı −10 LU. Tam blok yoksa ya da hepsi kapıda kalırsa
 * `-Infinity` (tanımsız) döner — kısa SFX'te integrated anlamsızdır.
 */
export function integratedLoudness(channels: readonly Float32Array[], sampleRate: number): number {
  const total = channels[0]?.length ?? 0;
  const block = Math.round(0.4 * sampleRate);
  const step = Math.round(0.1 * sampleRate);
  if (total < block) return Number.NEGATIVE_INFINITY;
  const prefixes = channels.map((channel) => weightedSquarePrefix(channel, sampleRate));
  const blocks: number[] = [];
  for (let start = 0; start + block <= total; start += step) {
    blocks.push(blockMeanSquares(prefixes, start, block, total));
  }
  const absolute = blocks.filter((z) => loudnessOf(z) > -70);
  if (absolute.length === 0) return Number.NEGATIVE_INFINITY;
  const relativeGate = loudnessOf(absolute.reduce((a, z) => a + z, 0) / absolute.length) - 10;
  const gated = absolute.filter((z) => loudnessOf(z) > relativeGate);
  return loudnessOf(gated.reduce((a, z) => a + z, 0) / gated.length);
}

/**
 * En yüksek momentary loudness (LUFS): 400 ms kayan pencere, 10 ms adım,
 * iki yanda sıfır dolgu — kısa bir olay da tam bir pencerede ölçülür (bir
 * sayaç olayı böyle görür).
 */
export function maxMomentaryLoudness(
  channels: readonly Float32Array[],
  sampleRate: number,
): number {
  const total = channels[0]?.length ?? 0;
  if (total === 0) return Number.NEGATIVE_INFINITY;
  const window = Math.round(0.4 * sampleRate);
  const hop = Math.max(1, Math.round(0.01 * sampleRate));
  const prefixes = channels.map((channel) => weightedSquarePrefix(channel, sampleRate));
  let best = 0;
  for (let end = hop; end < total + window; end += hop) {
    best = Math.max(best, blockMeanSquares(prefixes, end - window, window, total));
  }
  return loudnessOf(best);
}

/** Örnek tepesi (dBFS) — örnekler ARASINI görmez. */
export function samplePeakDb(channels: readonly Float32Array[]): number {
  let peak = 0;
  for (const channel of channels) {
    for (const v of channel) peak = Math.max(peak, Math.abs(v));
  }
  return peak > 0 ? 20 * Math.log10(peak) : Number.NEGATIVE_INFINITY;
}

/** True-peak yeniden örnekleme: fs < 96 kHz'te 4×, < 192 kHz'te 2× (BS.1770 Ek 2). */
function truePeakFactor(sampleRate: number): number {
  if (sampleRate < 96000) return 4;
  return sampleRate < 192000 ? 2 : 1;
}

/** Çekirdek yarı genişliği (giriş örneği) — Kaiser A = 80 dB, geçiş 0.45–0.55·fs. */
const TP_HALF_WIDTH = 25;
const TP_BETA = 0.1102 * (80 - 8.7);

function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  for (let k = 1; k < 64; k++) {
    term *= (x * x) / 4 / (k * k);
    sum += term;
    if (term < sum * 1e-16) break;
  }
  return sum;
}

interface Phase {
  readonly taps: Float64Array;
  readonly absSum: number;
}

/**
 * Çok fazlı ara değer süzgeci: faz p için h(k − p/L) = sinc·Kaiser; k tam
 * sayıda sinc sıfırdır, yani faz 0 örneğin kendisidir ve hesaplanmaz.
 */
function truePeakPhases(factor: number): Phase[] {
  const norm = besselI0(TP_BETA);
  const phases: Phase[] = [];
  for (let p = 1; p < factor; p++) {
    const taps = new Float64Array(2 * TP_HALF_WIDTH);
    let absSum = 0;
    for (let j = 0; j < taps.length; j++) {
      const t = j - TP_HALF_WIDTH + 1 - p / factor;
      const u = t / TP_HALF_WIDTH;
      const window = Math.abs(u) < 1 ? besselI0(TP_BETA * Math.sqrt(1 - u * u)) / norm : 0;
      taps[j] = (Math.sin(Math.PI * t) / (Math.PI * t)) * window;
      absSum += Math.abs(taps[j]);
    }
    phases.push({ taps, absSum });
  }
  return phases;
}

/**
 * Örnek başına örnekler-arası tepe: `out[k]` = [k, k+1) aralığındaki en büyük
 * |ara değer| (4× çok fazlı süzgeç, `truePeakDb` ile aynı çekirdek). True-peak
 * sınırlayıcı kazanç ihtiyacını buradan okur.
 */
export function interSamplePeaks(channel: Float32Array, sampleRate: number): Float32Array {
  const factor = truePeakFactor(sampleRate);
  const n = channel.length;
  const out = new Float32Array(n);
  for (let k = 0; k < n; k++) out[k] = Math.abs(channel[k]);
  if (factor === 1) return out;
  const phases = truePeakPhases(factor);
  for (let k = 0; k < n; k++) {
    const base = k - TP_HALF_WIDTH + 1;
    const from = Math.max(0, -base);
    const to = Math.min(2 * TP_HALF_WIDTH, n - base);
    let best = out[k];
    for (const phase of phases) {
      let acc = 0;
      for (let j = from; j < to; j++) acc += channel[base + j] * phase.taps[j];
      const magnitude = Math.abs(acc);
      if (magnitude > best) best = magnitude;
    }
    out[k] = best;
  }
  return out;
}

/**
 * True peak (dBTP): örnekler arası tepe, 4× (fs < 96 kHz) aşırı örneklenmiş
 * dalgada. Kesin budama: bir noktanın ara değeri |y| ≤ max|x|·Σ|h| ile
 * sınırlıdır; bu sınır mevcut en iyi tepenin altındaysa nokta hesaplanmaz —
 * sonuç budamasız hesapla aynıdır.
 */
export function truePeakDb(channels: readonly Float32Array[], sampleRate: number): number {
  const factor = truePeakFactor(sampleRate);
  let best = 0;
  for (const channel of channels) {
    for (const v of channel) best = Math.max(best, Math.abs(v));
  }
  if (factor === 1 || best === 0) return best > 0 ? 20 * Math.log10(best) : -Infinity;
  const phases = truePeakPhases(factor);
  const bound = Math.max(...phases.map((phase) => phase.absSum));
  for (const x of channels) {
    const n = x.length;
    // Kayan pencere maksimumu (monoton kuyruk): [k − H + 1, k + H].
    const deque = new Int32Array(n);
    let head = 0;
    let tail = 0;
    let next = 0;
    for (let k = 0; k < n; k++) {
      const hi = Math.min(n - 1, k + TP_HALF_WIDTH);
      for (; next <= hi; next++) {
        while (tail > head && Math.abs(x[deque[tail - 1]]) <= Math.abs(x[next])) tail--;
        deque[tail++] = next;
      }
      while (deque[head] < k - TP_HALF_WIDTH + 1) head++;
      if (Math.abs(x[deque[head]]) * bound <= best) continue;
      for (const phase of phases) {
        let acc = 0;
        const base = k - TP_HALF_WIDTH + 1;
        for (let j = 0; j < phase.taps.length; j++) {
          const index = base + j;
          if (index >= 0 && index < n) acc += x[index] * phase.taps[j];
        }
        best = Math.max(best, Math.abs(acc));
      }
    }
  }
  return 20 * Math.log10(best);
}

/**
 * Kırpma sayımı, KANAL örneği cinsinden. Tek toplu sayaç stereo içerikte
 * anlam değiştirirdi (aynı çerçevede iki kanal bir mi iki mi?); burada her
 * kanal ayrı sayılır, toplam kanal-örneği ve etkilenen çerçeve ayrıca verilir.
 */
export interface ClipCount {
  readonly perChannel: readonly number[];
  readonly channelSamples: number;
  readonly frames: number;
}

export function countClips(channels: readonly Float32Array[], threshold = 0.999): ClipCount {
  const perChannel = channels.map(() => 0);
  let frames = 0;
  const length = channels[0]?.length ?? 0;
  for (let i = 0; i < length; i++) {
    let clipped = false;
    channels.forEach((channel, ch) => {
      if (Math.abs(channel[i]) >= threshold) {
        perChannel[ch]++;
        clipped = true;
      }
    });
    if (clipped) frames++;
  }
  return { perChannel, channelSamples: perChannel.reduce((a, b) => a + b, 0), frames };
}
