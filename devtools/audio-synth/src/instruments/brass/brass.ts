/**
 * Fiziksel model — bakır üflemeli çalgılar (lip-reed): trompet, trombon,
 * korno, tuba.
 *
 * Model, bakır çalgıların ana karakterini modal toplama ile kurar:
 * - silindirik gövde harmonik kısmi tonları (lip türnak atışları)
 * - dar pulse-benzeri uyarım: hem tek hem çift harmonikler
 * - lip gürültüsü / buzz atakta kısa bir gürültü patlaması
 * - lowpass filtre zil/kapak açık-kapalılığını belirler
 *
 * Kaynak gain ile sınırlı, son adımda 0,95 güvenlik katsayısı uygulanır; kırpma yok.
 */

import { createRandom, DEFAULT_SEED } from '@volstudio/core/random';
import { clamp } from '@volstudio/core/math/interpolation';
import type { SynthesisResult } from '../../types';
import { Envelope } from '../../synthesis/envelope';
import { Cascade4Filter } from '../../synthesis/filter';

export interface BrassParams {
  /** Temel frekans (Hz). */
  frequency: number;
  /** Süre (saniye). */
  duration: number;
  /** Örnek oranı. Varsayılan 44100. */
  sampleRate?: number;
  /** Açık/kapalılığı belirleyen lowpass kesim frekansı (Hz). */
  lowpassCutoff?: number;
  /** Atak süresi (saniye). */
  attack?: number;
  /** Sustain seviyesine düşme süresi (saniye). */
  decay?: number;
  /** Sustain seviyesi (0-1). */
  sustainLevel?: number;
  /** Release süresi (saniye). */
  release?: number;
  /** Lip gürültüsü / buzz miktarı (0-1). */
  lipNoise?: number;
  /** Lip gürültüsünün sönüm süresi (saniye). */
  lipNoiseDecay?: number;
  /** Parlaklık (0-1): üst kısmi ton sayısı ve çift harmonik karışımı. */
  brightness?: number;
  /** Genel kazanç (0-1). Çıktı sonunda 0,95*gain güvenlik katsayısı uygulanır. */
  gain?: number;
  /** Deterministik fazlar / gürültü için seed. */
  seed?: number;
}

/** Sağ kanal için farklı bir seed türet; aynı seed tekrarlanmaz. */
function stereoSeed(seed: number): number {
  return (seed + 0x9e3779b9) | 0;
}

export function brass(params: BrassParams): SynthesisResult {
  const sampleRate = clamp(params.sampleRate ?? 44100, 1000, 384000);
  const f0 = clamp(params.frequency, 20, sampleRate / 2);
  const duration = clamp(params.duration, 0.05, 600);
  const totalSamples = Math.floor(sampleRate * duration);

  const lowpassCutoff = clamp(params.lowpassCutoff ?? 6000, 50, sampleRate / 2);
  const attack = clamp(params.attack ?? 0.015, 0.001, duration);
  const decay = clamp(params.decay ?? 0.3, 0.01, 20);
  const sustainLevel = clamp(params.sustainLevel ?? 0.8, 0, 1);
  const release = clamp(params.release ?? 0.15, 0.001, duration);
  const lipNoise = clamp(params.lipNoise ?? 0.2, 0, 1);
  const lipNoiseDecay = clamp(params.lipNoiseDecay ?? 0.04, 0.001, 1);
  const brightness = clamp(params.brightness ?? 0.7, 0, 1);
  const gain = clamp(params.gain ?? 0.5, 0, 1);

  const seed = Number.isFinite(params.seed) ? (params.seed as number) : DEFAULT_SEED;
  const randomL = createRandom(seed);
  const randomR = createRandom(stereoSeed(seed));

  const sustain = Math.max(0, duration - attack - decay - release);
  const envelope = new Envelope(
    {
      attack,
      hold: 0,
      decay,
      sustain,
      release,
      sustainLevel,
      curve: 'cosine',
    },
    duration,
  );

  // Parlaklık: üst tonları hızla yuvarlayan exponent ve çift harmonik katsayısı.
  const rolloff = 1.1 - brightness * 0.6;
  const evenBoost = 0.3 + brightness * 0.7;

  // Kısmi ton sayısı: en fazla Nyquist'e kadar, parlaklıkla büyür.
  const nyquistPartials = Math.max(1, Math.floor(sampleRate / (2 * f0)) - 1);
  const maxPartials = Math.min(nyquistPartials, 30 + Math.floor(brightness * 70));

  const amplitudes: number[] = [];
  let totalAmp = 0;
  for (let n = 1; n <= maxPartials; n++) {
    let a = Math.pow(n, -rolloff);
    if (n % 2 === 0) a *= evenBoost;
    amplitudes.push(a);
    totalAmp += a;
  }
  if (totalAmp <= 0) totalAmp = 1;

  // İki kanal aynı frekansta, farklı faz ve gürültü dizisiyle stereo verir.
  const phaseStepsL = new Float64Array(maxPartials);
  const phaseStepsR = new Float64Array(maxPartials);
  const phasesL = new Float64Array(maxPartials);
  const phasesR = new Float64Array(maxPartials);

  for (let n = 0; n < maxPartials; n++) {
    const partial = n + 1;
    const step = (f0 * partial) / sampleRate;
    phaseStepsL[n] = step;
    phaseStepsR[n] = step;
    phasesL[n] = randomL.next();
    phasesR[n] = randomR.next();
  }

  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);
  const lowpassL = new Cascade4Filter(sampleRate, 'lowpass', 0.707);
  const lowpassR = new Cascade4Filter(sampleRate, 'lowpass', 0.707);

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const env = envelope.value(t);

    // Lip buzz atakta yüksek, hızla sönen bir gürültü karışımı.
    const noiseMix = lipNoise * 0.5 * Math.exp(-t / lipNoiseDecay);
    const pulseMix = 1 - noiseMix;

    const noiseL = randomL.bipolar();
    const noiseR = randomR.bipolar();

    let sumL = 0;
    let sumR = 0;
    for (let n = 0; n < maxPartials; n++) {
      sumL += amplitudes[n] * Math.sin(2 * Math.PI * phasesL[n]);
      sumR += amplitudes[n] * Math.sin(2 * Math.PI * phasesR[n]);

      phasesL[n] += phaseStepsL[n];
      phasesL[n] -= Math.floor(phasesL[n]);
      phasesR[n] += phaseStepsR[n];
      phasesR[n] -= Math.floor(phasesR[n]);
    }

    sumL /= totalAmp;
    sumR /= totalAmp;

    const sourceL = (pulseMix * sumL + noiseMix * noiseL) * env * gain;
    const sourceR = (pulseMix * sumR + noiseMix * noiseR) * env * gain;

    left[i] = lowpassL.process(sourceL, lowpassCutoff);
    right[i] = lowpassR.process(sourceR, lowpassCutoff);
  }

  // Kaynak zaten gain (≤ 1) ile sınırlı; 0,95 ek güvenlik katsayısı.
  for (let i = 0; i < totalSamples; i++) {
    left[i] *= 0.95;
    right[i] *= 0.95;
  }

  return {
    channels: [left, right],
    sampleRate,
    duration,
  };
}
