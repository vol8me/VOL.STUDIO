/**
 * Physical modeling — Karplus-Strong pluck sentezi.
 *
 * Geliştirilmiş KS algoritması: telli enstrüman (gitar/çello) simülasyonu.
 * - Excitation: noise yerine zengin harmonik (sawtooth + noise karışımı)
 * - Delay line: frekansa göre uzunluk, fractional delay için linear interpolasyon
 * - Lowpass feedback: 1-pole filter, harmonik zamanla solar (doğal telli sönüm)
 * - Decay kontrolü: brightness (sustain) vs total decay
 * - Stereo: iki hafif farklı delay line ile yayılım
 *
 * Node.js ve tarayıcıda çalışır — saf matematik, bağımlılık yok.
 */

import { createRandom, DEFAULT_SEED } from './random';
import type { SynthesisResult } from './types';

export interface PluckParams {
  /** Temel frekans (Hz). */
  frequency: number;
  /** Süre (saniye). */
  duration: number;
  /** Örnek oranı. Varsayılan 44100. */
  sampleRate?: number;
  /** Decay faktörü (0.90 - 0.999). Yüksek = uzun sustain.
   *  Düşük frekanslar için daha yüksek, yüksek frekanslar için daha düşük önerilir. */
  decay?: number;
  /** Excitation karışımı — 0 = saf noise, 1 = saf harmonik. Varsayılan 0.5. */
  excitationMix?: number;
  /** Excitation harmonik sayısı (1-8). Yüksek = daha zengin atak. Varsayılan 4. */
  excitationHarmonics?: number;
  /** Stereo yayılım (0-1). 0 = mono, 1 = tam stereo. Varsayılan 0.3. */
  stereoWidth?: number;
  /** Genel kazanç (0-1). Varsayılan 0.5. */
  gain?: number;
  /** Body resonance — ek rezonans frekansı (Hz). 0 = kapalı. Varsayılan 0. */
  bodyResonance?: number;
  /** Body resonance şiddeti (0-1). Varsayılan 0.3. */
  bodyAmount?: number;
  /** Deterministik gürültü için seed. Varsayılan sabit seed. */
  seed?: number;
}

/** Fractional delay line — linear interpolasyon ile.
 *  Tam frekans için fractional sample gerekiyor — integer delay pitch hatalı olur. */
class FractionalDelayLine {
  private readonly buffer: Float32Array;
  private writeIndex = 0;
  private readonly delaySamples: number;

  constructor(delaySamples: number) {
    this.delaySamples = Math.max(1, delaySamples);
    // Buffer delay + 8 sample ek — güvenlik marjı
    this.buffer = new Float32Array(Math.ceil(this.delaySamples) + 8);
  }

  /** Fractional delay ile oku — linear interpolasyon. */
  read(): number {
    const readPos = this.writeIndex - this.delaySamples + this.buffer.length;
    const idx0 = Math.floor(readPos) % this.buffer.length;
    const idx1 = (idx0 + 1) % this.buffer.length;
    const frac = readPos - Math.floor(readPos);
    return this.buffer[idx0] * (1 - frac) + this.buffer[idx1] * frac;
  }

  write(sample: number): void {
    this.buffer[this.writeIndex] = sample;
    this.writeIndex = (this.writeIndex + 1) % this.buffer.length;
  }

  /** Oku + yaz — KS döngüsü için. */
  processWrite(input: number): number {
    const output = this.read();
    this.write(input);
    return output;
  }
}

/** 1-pole lowpass — KS feedback filtresi.
 *  Harmonik zamanla solar — telli doğal sönüm karakteri. */
class OnePoleLowpass {
  private prev = 0;
  private readonly coefficient: number;

  /** coefficient: 0-1 arası. Yüksek = daha az sönüm (daha parlak kalır). */
  constructor(coefficient: number) {
    this.coefficient = Math.max(0, Math.min(0.99, coefficient));
  }

  process(input: number): number {
    this.prev = input * (1 - this.coefficient) + this.prev * this.coefficient;
    return this.prev;
  }
}

/** Excitation — noise + harmonik karışımı.
 *  Saf noise klasik KS'tir; harmonik eklemek daha zengin atak verir. */
function generateExcitation(
  length: number,
  harmonics: number,
  mix: number,
  random = createRandom(DEFAULT_SEED),
): Float32Array {
  const buffer = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const noise = random.bipolar();
    // Harmonik excitation — sawtooth benzeri, kısa burst
    const phase = i / length;
    let harmonic = 0;
    for (let n = 1; n <= harmonics; n++) {
      harmonic += Math.sin(2 * Math.PI * n * phase) / n;
    }
    harmonic = (harmonic * 2) / Math.PI; // normalize [-1, 1]
    buffer[i] = noise * (1 - mix) + harmonic * mix;
  }
  return buffer;
}

/** Karplus-Strong pluck sentezi — geliştirilmiş.
 *
 *  Algoritma:
 *  1. Excitation buffer'ı delay line'ı doldurur (telli başlangıç durumu)
 *  2. Her sample: delay line oku → lowpass → decay → delay line yaz
 *  3. Body resonance: ek delay line ile rezonans frekansı vurgulanır
 *  4. Stereo: iki hafif farklı delay line (+-0.5 cent) ile yayılım
 *
 *  Sonuç: karanlık, tok, ataklı telli enstrüman tonu. */
export function pluck(params: PluckParams): SynthesisResult {
  const sampleRate = params.sampleRate ?? 44100;
  const freq = Math.max(20, params.frequency);
  const duration = Math.max(0.05, params.duration);
  const totalSamples = Math.floor(sampleRate * duration);
  const decay = params.decay ?? 0.995;
  const excitationMix = params.excitationMix ?? 0.5;
  const excitationHarmonics = params.excitationHarmonics ?? 4;
  const stereoWidth = params.stereoWidth ?? 0.3;
  const gain = params.gain ?? 0.5;
  const bodyResonance = params.bodyResonance ?? 0;
  const bodyAmount = params.bodyAmount ?? 0.3;
  const seed = params.seed ?? DEFAULT_SEED;
  const random = createRandom(seed);

  // Delay line uzunluğu — frekansa göre
  const delaySamples = sampleRate / freq;
  // Stereo için hafif detune (+-0.5 cent)
  const detuneRatio = Math.pow(2, 0.005 / 12); // +0.5 cent
  const delayLeft = delaySamples;
  const delayRight = delaySamples / detuneRatio;

  // Excitation buffer — delay line uzunluğu kadar
  const exciteLength = Math.ceil(delaySamples);
  const excitation = generateExcitation(exciteLength, excitationHarmonics, excitationMix, random);

  // İki delay line (stereo)
  const dlLeft = new FractionalDelayLine(delayLeft);
  const dlRight = new FractionalDelayLine(delayRight);

  // Lowpass feedback — coefficient decay'e bağlı
  // Yüksek decay = daha az sönüm = daha parlak kalır
  const lpLeft = new OnePoleLowpass(0.5 + (decay - 0.9) * 2); // decay 0.9→0.5, 0.999→0.698
  const lpRight = new OnePoleLowpass(0.5 + (decay - 0.9) * 2);

  // Body resonance — ek delay line
  let bodyDlLeft: FractionalDelayLine | null = null;
  let bodyDlRight: FractionalDelayLine | null = null;
  if (bodyResonance > 0) {
    const bodyDelay = sampleRate / bodyResonance;
    bodyDlLeft = new FractionalDelayLine(bodyDelay);
    bodyDlRight = new FractionalDelayLine(bodyDelay / detuneRatio);
  }

  // Excitation'ı delay line'lara yaz
  for (let i = 0; i < exciteLength; i++) {
    dlLeft.write(excitation[i]);
    dlRight.write(excitation[i]);
  }

  // Sentez döngüsü
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);
  const stereoGain = Math.min(1, stereoWidth * 2);

  for (let i = 0; i < totalSamples; i++) {
    // KS döngüsü: oku → lowpass → decay → yaz
    const sampleL = dlLeft.read();
    const sampleR = dlRight.read();

    const filteredL = lpLeft.process(sampleL);
    const filteredR = lpRight.process(sampleR);

    // Decay — feedback gain
    const feedbackL = filteredL * decay;
    const feedbackR = filteredR * decay;

    dlLeft.write(feedbackL);
    dlRight.write(feedbackR);

    // Body resonance — ek rezonans
    let outL = feedbackL;
    let outR = feedbackR;
    if (bodyDlLeft && bodyDlRight) {
      const bodyL = bodyDlLeft.processWrite(feedbackL * bodyAmount);
      const bodyR = bodyDlRight.processWrite(feedbackR * bodyAmount);
      outL = feedbackL * (1 - bodyAmount) + bodyL * bodyAmount;
      outR = feedbackR * (1 - bodyAmount) + bodyR * bodyAmount;
    }

    // Stereo karışım — stereoWidth ile kontrol
    const mono = (outL + outR) * 0.5;
    left[i] = (mono * (1 - stereoGain) + outL * stereoGain) * gain;
    right[i] = (mono * (1 - stereoGain) + outR * stereoGain) * gain;
  }

  return {
    channels: [left, right],
    sampleRate,
    duration,
  };
}
