import type { ReverbParams } from '../types';
import { resolveReverbParams } from '../guard/effects';
import { checkSampleRate } from '../guard/read';

class CombFilter {
  private readonly buffer: Float32Array;
  private index = 0;
  private filterStore = 0;
  private readonly feedback: number;
  private readonly damp: number;

  constructor(size: number, feedback: number, damp: number) {
    this.buffer = new Float32Array(size);
    this.feedback = feedback;
    this.damp = damp;
  }

  process(input: number): number {
    const output = this.buffer[this.index];
    this.filterStore = output * (1 - this.damp) + this.filterStore * this.damp;
    this.buffer[this.index] = input + this.filterStore * this.feedback;
    this.index = (this.index + 1) % this.buffer.length;
    return output;
  }

  reset(): void {
    this.buffer.fill(0);
    this.index = 0;
    this.filterStore = 0;
  }
}

/**
 * Schroeder allpass, kafes biçimi: w = x + g·w[n−N], y = −g·w + w[n−N] →
 * H = (z^−N − g) / (1 − g·z^−N), |H| = 1. Freeverb'ün `y = w[n−N] − g·x`
 * varyantı allpass DEĞİLDİR (g = 0.5'te kademe başına ~+2 dB enerji ve
 * ±3.5 dB renklenme); difüzör sesi renklendirmemeli.
 */
class AllpassFilter {
  private readonly buffer: Float32Array;
  private index = 0;
  private readonly feedback: number;

  constructor(size: number, feedback: number) {
    this.buffer = new Float32Array(size);
    this.feedback = feedback;
  }

  process(input: number): number {
    const delayed = this.buffer[this.index];
    const w = input + delayed * this.feedback;
    this.buffer[this.index] = w;
    this.index = (this.index + 1) % this.buffer.length;
    return delayed - w * this.feedback;
  }

  reset(): void {
    this.buffer.fill(0);
    this.index = 0;
  }
}

/**
 * Alçak geçiren geri beslemeli comb'un beyaz gürültü enerji kazancı.
 *
 * Döngü `z^-N / (1 − g·H(z)·z^-N)`; N büyükken her ω'da `ωN` fazı hızla
 * döner ve Poisson çekirdeğinin ortalaması `1 / (1 − g²|H(ω)|²)` kalır. H
 * birim DC kazançlı tek kutuplu alçak geçirendir:
 * |H|² = (1−d)² / (1 − 2d·cos ω + d²). İntegral orta nokta kuralıyla alınır.
 */
function combEnergyGain(g: number, damp: number): number {
  const steps = 256;
  let sum = 0;
  for (let k = 0; k < steps; k++) {
    const w = (Math.PI * (k + 0.5)) / steps;
    const h2 = ((1 - damp) * (1 - damp)) / (1 - 2 * damp * Math.cos(w) + damp * damp);
    sum += 1 / (1 - g * g * h2);
  }
  return sum / steps;
}

/** Wet yolun DC engelleyicisinin kesimi (Hz) — tarihî master kuralıyla aynı. */
const DC_BLOCK_HZ = 20;

/** Tek kanal reverb çekirdeği — comb + allpass zinciri. */
class ReverbCore {
  private readonly combFilters: CombFilter[];
  private readonly allpassFilters: AllpassFilter[];
  private readonly preDelayBuffer: Float32Array;
  private preDelayIndex = 0;
  private readonly preDelaySamples: number;
  private readonly wetScale: number;
  private readonly dcPole: number;
  private dcIn = 0;
  private dcOut = 0;

  constructor(
    combSizes: readonly number[],
    allpassSizes: readonly number[],
    sampleRate: number,
    rt60: number,
    damp: number,
    preDelaySamples: number,
  ) {
    // Schroeder: her tur `g` ile çarpılan bir hat T60 sonunda 10^-3'e iner,
    // yani g = 10^(−3·D/T60). Kazanç her comb'un KENDİ gecikmesinden
    // hesaplanır; ortak bir kazanç uzun comb'ları kısa olanlardan yavaş
    // söndürürdü. Damping filtresinin DC kazancı 1 olduğu için T60 alçak
    // frekanslarda tam tutar; `damp` yalnız tizlerin sönümünü hızlandırır.
    const gains = combSizes.map((size) => Math.pow(10, (-3 * size) / (sampleRate * rt60)));
    this.combFilters = combSizes.map((size, i) => new CombFilter(size, gains[i], damp));
    this.allpassFilters = allpassSizes.map((size) => new AllpassFilter(size, 0.5));
    // `amount` bir karışım oranıdır: wet yol, geniş bant enerji kazancı 1
    // olacak biçimde ölçeklenir. Yoksa uzun RT60'ta biriken enerji wet'i
    // ~10 dB yükseltir ve `decay` süreyle birlikte seviyeyi de değiştirirdi.
    // Comb'lar ilintisizdir; ortalamanın enerjisi Σ E_i / n²'dir.
    const n = combSizes.length;
    const energy = gains.reduce((sum, g) => sum + combEnergyGain(g, damp), 0) / (n * n);
    this.wetScale = 1 / Math.sqrt(energy);
    // Comb'ların DC kazancı 1/(1−g)'dir ve RT60 uzadıkça ~10× olur; bir oda
    // DC basınç taşımaz, o yüzden wet çıkış tek kutuplu DC engelleyiciden geçer.
    this.dcPole = Math.exp((-2 * Math.PI * DC_BLOCK_HZ) / sampleRate);
    this.preDelaySamples = preDelaySamples;
    this.preDelayBuffer = new Float32Array(Math.max(1, preDelaySamples));
  }

  process(input: number): number {
    let delayedInput = input;
    if (this.preDelaySamples > 0) {
      const readIndex =
        (this.preDelayIndex - this.preDelaySamples + this.preDelayBuffer.length) %
        this.preDelayBuffer.length;
      delayedInput = this.preDelayBuffer[readIndex]!;
      this.preDelayBuffer[this.preDelayIndex] = input;
      this.preDelayIndex = (this.preDelayIndex + 1) % this.preDelayBuffer.length;
    }

    let combSum = 0;
    for (const comb of this.combFilters) {
      combSum += comb.process(delayedInput);
    }
    let reverb = combSum / this.combFilters.length;

    for (const allpass of this.allpassFilters) {
      reverb = allpass.process(reverb);
    }

    const wet = reverb * this.wetScale;
    this.dcOut = wet - this.dcIn + this.dcPole * this.dcOut;
    this.dcIn = wet;
    return this.dcOut;
  }

  reset(): void {
    this.combFilters.forEach((c) => c.reset());
    this.allpassFilters.forEach((a) => a.reset());
    this.preDelayBuffer.fill(0);
    this.preDelayIndex = 0;
    this.dcIn = 0;
    this.dcOut = 0;
  }
}

/** Freeverb gecikmeleri 44.1 kHz örnek cinsinden tanımlıdır; diğer oranlara ölçeklenir. */
const REFERENCE_RATE = 44100;

function scaledSizes(times: readonly number[], scale: number): number[] {
  return times.map((time) => Math.max(1, Math.floor(time * scale)));
}

/** Stereo reverb — L ve R için bağımsız çekirdekler, farklı delay süreleri.
 *  Freeverb stereo yaklaşımı: R kanalı ~3% uzun delay → geniş stereo imaj.
 *
 *  `decay` RT60'tır (saniye): alçak frekans kuyruğunun 60 dB düşme süresi.
 *  `roomSize` yalnız comb gecikmelerini (yankı yoğunluğu, modal aralık)
 *  ölçekler; sönüm süresini DEĞİŞTİRMEZ. */
export class Reverb {
  private readonly left: ReverbCore;
  private readonly right: ReverbCore;
  private readonly amount: number;

  // L ve R için farklı comb süreleri — stereo genişlik
  private static readonly COMB_TIMES_L = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116] as const;
  private static readonly COMB_TIMES_R = [1601, 1665, 1537, 1463, 1313, 1393, 1223, 1151] as const;
  private static readonly ALLPASS_TIMES = [225, 556, 441, 341] as const;

  /**
   * Kuyruğun -60 dB'ye düşmesi için gereken süre (saniye): ön gecikme + en
   * uzun comb'un ilk yankısı + allpass zincirinin taşıma gecikmesi + RT60.
   * Bir tamponun kuyruğu kesmeden taşıması gereken ek süre budur.
   */
  readonly tailSeconds: number;

  constructor(params: ReverbParams, sampleRate: number) {
    const resolved = resolveReverbParams(params, 'reverb');
    const rate = checkSampleRate(sampleRate, 'sampleRate');
    this.amount = resolved.amount;

    const rateScale = rate / REFERENCE_RATE;
    const roomScale = 0.6 + resolved.roomSize * 0.8;
    const combL = scaledSizes(Reverb.COMB_TIMES_L, rateScale * roomScale);
    const combR = scaledSizes(Reverb.COMB_TIMES_R, rateScale * roomScale);
    const allpass = scaledSizes(Reverb.ALLPASS_TIMES, rateScale);
    const preDelaySamples = Math.round(resolved.preDelay * rate);

    this.left = new ReverbCore(
      combL,
      allpass,
      rate,
      resolved.decay,
      resolved.damp,
      preDelaySamples,
    );
    this.right = new ReverbCore(
      combR,
      allpass,
      rate,
      resolved.decay,
      resolved.damp,
      preDelaySamples,
    );

    const longestComb = Math.max(...combL, ...combR);
    const allpassChain = allpass.reduce((sum, size) => sum + size, 0);
    this.tailSeconds =
      preDelaySamples / rate + (longestComb + allpassChain) / rate + resolved.decay;
  }

  /** Mono işlem — geriye dönük uyum. L+R ortalaması. */
  process(input: number): number {
    const l = this.left.process(input);
    const r = this.right.process(input);
    return input * (1 - this.amount) + (l + r) * 0.5 * this.amount;
  }

  /** Stereo işlem — L ve R bağımsız reverb kuyrukları. */
  processStereo(leftIn: number, rightIn: number): [number, number] {
    const l = this.left.process(leftIn);
    const r = this.right.process(rightIn);
    return [
      leftIn * (1 - this.amount) + l * this.amount,
      rightIn * (1 - this.amount) + r * this.amount,
    ];
  }

  reset(): void {
    this.left.reset();
    this.right.reset();
  }
}
