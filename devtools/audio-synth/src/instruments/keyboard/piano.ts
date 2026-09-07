/**
 * Physical modeling — piyano (vurmalı telli) sentezi.
 *
 * Modal sentez: piyano teli sert ve inharmoniktir. Her kısmi ton kendi
 * sönüm sabitiyle çürür; yüksek kısmi tonlar daha hızlı solar. Çekiç
 * vuruşu kısa bir gürültü patlaması (lowpass ile yumuşatılmış), gövde
 * rezonansı ayrı bir alçak frekans modu olarak eklenir. Üçtel unison
 * yüksek perdelerde hafif detune ve faz farkıyla çalışır.
 */

import { createRandom, DEFAULT_SEED } from '@volstudio/core/random';
import { clamp } from '@volstudio/core/math/interpolation';
import type { SynthesisResult } from '../../types';

export interface PianoParams {
  /** Temel frekans (Hz). */
  frequency: number;
  /** Süre (saniye). */
  duration: number;
  /** Örnek oranı. Varsayılan 44100. */
  sampleRate?: number;
  /** Inharmonisite katsayısı B. 0 = tam harmonik, 0.001 = derin teller. */
  inharmonicity?: number;
  /** Kısmi ton sayısı. */
  partials?: number;
  /** Çekiç sertliği (0-1). Yüksek = daha parlak atak. */
  hammerHardness?: number;
  /** Temel sönüm sabiti (saniye). */
  decay?: number;
  /** Yüksek kısmi tonlara ek sönüm çarpanı. */
  highDamping?: number;
  /** Unison detune (cent). */
  unisonDetune?: number;
  /** Gövde rezonans frekansı (Hz). 0 = kapalı. */
  bodyResonance?: number;
  /** Gövde rezonans şiddeti (0-1). */
  bodyAmount?: number;
  /** Genel kazanç (0-1). */
  gain?: number;
  /** Deterministik fazlar için seed. */
  seed?: number;
}

/** 1-pole lowpass — çekiç gürültüsü yumuşatmak için. */
class OnePoleLowpass {
  private prev = 0;
  private readonly coefficient: number;

  /** coefficient: 0-1 arası. Yüksek = daha fazla geçiş. */
  constructor(coefficient: number) {
    this.coefficient = Math.max(0, Math.min(0.99, coefficient));
  }

  process(input: number): number {
    this.prev = input * (1 - this.coefficient) + this.prev * this.coefficient;
    return this.prev;
  }
}

function inharmonicFrequency(n: number, f0: number, b: number): number {
  return n * f0 * Math.sqrt(1 + b * n * n);
}

function partialGain(n: number, hammerHardness: number): number {
  // Sert çekiç üst tonları daha az kısar.
  const rolloff = 1 + (1 - hammerHardness) * 0.7;
  return 1 / Math.pow(n, rolloff);
}

function partialDecay(n: number, baseDecay: number, highDamping: number): number {
  return baseDecay / (1 + highDamping * (n - 1));
}

export function piano(params: PianoParams): SynthesisResult {
  const sampleRate = clamp(params.sampleRate ?? 44100, 1000, 384000);
  const f0 = clamp(params.frequency, 20, sampleRate / 2);
  const duration = clamp(params.duration, 0.05, 600);
  const totalSamples = Math.floor(sampleRate * duration);

  const b = clamp(params.inharmonicity ?? 0.0004, 0, 0.01);
  const partials = Math.floor(clamp(params.partials ?? 16, 1, 64));
  const hammerHardness = clamp(params.hammerHardness ?? 0.5, 0, 1);
  const baseDecay = clamp(params.decay ?? 1.5, 0.01, 20);
  const highDamping = clamp(params.highDamping ?? 0.08, 0, 1);
  const unisonDetune = clamp(params.unisonDetune ?? 6, 0, 50);
  const bodyResonance = params.bodyResonance ? clamp(params.bodyResonance, 20, sampleRate / 2) : 0;
  const bodyAmount = clamp(params.bodyAmount ?? 0.2, 0, 1);
  const gain = clamp(params.gain ?? 0.5, 0, 1);
  const seed = Number.isFinite(params.seed) ? (params.seed as number) : DEFAULT_SEED;
  const random = createRandom(seed);

  // Yüksek perde: 3 tel; orta: 2; düşük: 1.
  let unisonCount = 1;
  if (f0 > 300) unisonCount = 3;
  else if (f0 > 100) unisonCount = 2;

  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  // Çekiç gürültüsü — kısa, lowpass ile yumuşatılmış patlama.
  const hammerMs = 0.003 + 0.004 * (1 - hammerHardness);
  const hammerSamples = Math.floor(sampleRate * hammerMs);
  const hammerLp = new OnePoleLowpass(0.2 + 0.75 * hammerHardness);
  const hammerBuffer = new Float32Array(hammerSamples);
  for (let i = 0; i < hammerSamples; i++) {
    const noise = random.bipolar();
    const env = 1 - i / hammerSamples;
    hammerBuffer[i] = hammerLp.process(noise * env) * (0.3 + 0.7 * hammerHardness);
  }
  for (let i = 0; i < hammerSamples; i++) {
    left[i] += hammerBuffer[i] * gain;
    right[i] += hammerBuffer[i] * gain;
  }

  // Kısmi tonlar: her biri için unison tel sayısı kadar osilatör.
  for (let n = 1; n <= partials; n++) {
    const fn = inharmonicFrequency(n, f0, b);
    if (fn > sampleRate / 2) break;

    const amp = partialGain(n, hammerHardness) * gain;
    const tau = partialDecay(n, baseDecay, highDamping);
    const releaseRate = tau > 0 ? 1 / tau : 1;

    for (let u = 0; u < unisonCount; u++) {
      const detuneL = unisonCount === 1 ? 0 : (random.bipolar() * unisonDetune) / 2;
      const detuneR = unisonCount === 1 ? 0 : (random.bipolar() * unisonDetune) / 2;
      const detuneRatioL = Math.pow(2, detuneL / 1200);
      const detuneRatioR = Math.pow(2, detuneR / 1200);
      const phaseStepL = (2 * Math.PI * fn * detuneRatioL) / sampleRate;
      const phaseStepR = (2 * Math.PI * fn * detuneRatioR) / sampleRate;

      let phaseL = random.next();
      let phaseR = random.next();

      for (let i = 0; i < totalSamples; i++) {
        const t = i / sampleRate;
        const env = Math.exp(-t * releaseRate);
        const sample = Math.sin(2 * Math.PI * phaseL) * amp * env;
        left[i] += sample;

        phaseL += phaseStepL / (2 * Math.PI);
        phaseL -= Math.floor(phaseL);

        const sampleR = Math.sin(2 * Math.PI * phaseR) * amp * env;
        right[i] += sampleR;

        phaseR += phaseStepR / (2 * Math.PI);
        phaseR -= Math.floor(phaseR);
      }
    }
  }

  // Gövde rezonansı — ayrı alçak frekans modu.
  if (bodyResonance > 0) {
    const bodyStep = (2 * Math.PI * bodyResonance) / sampleRate;
    const bodyTau = baseDecay * 2;
    const bodyRelease = bodyTau > 0 ? 1 / bodyTau : 1;
    const bodyAmp = bodyAmount * gain;
    let phaseL = random.next();
    let phaseR = random.next();
    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * bodyRelease);
      const s = Math.sin(2 * Math.PI * phaseL) * bodyAmp * env;
      left[i] += s;
      right[i] += s;
      phaseL += bodyStep / (2 * Math.PI);
      phaseL -= Math.floor(phaseL);
      phaseR += bodyStep / (2 * Math.PI);
      phaseR -= Math.floor(phaseR);
    }
  }

  return {
    channels: [left, right],
    sampleRate,
    duration,
  };
}
