/**
 * Fiziksel model — keman, viyola, viyolonsel, kontrabas (yaylı tel).
 *
 * Yaylı tel: sürtünme arayüzü (yay) ile temeli ve üst tonları sürekli uyarır.
 * Model modal toplama kurar:
 * - 1/n genlikli kısmi tonlar (testere dişi spektrum)
 * - düşük perdelerde inharmonisite, yüksek perdelerde unison
 * - yay hareketinin frekans modülasyonu (vibrato)
 * - sürtünmeden filtrelenmiş düşük seviyeli gürültü (bow noise)
 * Yavaş atak, uzun sustain, sonuç tepeye göre normalize edilir.
 */

import { createRandom, DEFAULT_SEED } from '@volstudio/core/random';
import { clamp } from '@volstudio/core/math/interpolation';
import type { SynthesisResult } from '../../types';

export interface BowedStringParams {
  /** Temel frekans (Hz). */
  frequency: number;
  /** Süre (saniye). */
  duration: number;
  /** Örnek oranı. Varsayılan 44100. */
  sampleRate?: number;
  /** Vibrato derinliği (Hz). Varsayılan frekansın ~%1,2'si. */
  vibratoDepth?: number;
  /** Vibrato hızı (Hz). Varsayılan 5,5. */
  vibratoRate?: number;
  /** Kısmi ton sayısı. Varsayılan 16. */
  partials?: number;
  /** Inharmonisite katsayısı B. Verilmezse tel kalınlığına göre hesaplanır. */
  inharmonicity?: number;
  /** Unison detune (cent). Varsayılan 6. */
  unisonDetune?: number;
  /** Yay gürültüsü seviyesi (0-1). Varsayılan 0.04. */
  bowNoise?: number;
  /** Yay gürültüsü lowpass katsayısı (0-0.99). Varsayılan 0.3. */
  bowNoiseCutoff?: number;
  /** Genlik atağı (saniye). Varsayılan 0.2. */
  attack?: number;
  /** Genlik sonuşu (saniye). Varsayılan 0.25. */
  release?: number;
  /** Genel kazanç (0-1). Varsayılan 0.5. */
  gain?: number;
  /** Deterministik gürültü/fazlar için seed. */
  seed?: number;
}

/** 1-pole lowpass — gürültüyü kısıtlı bant genişliğe getirir. */
class OnePoleLowpass {
  private prev = 0;
  private readonly coefficient: number;

  constructor(coefficient: number) {
    this.coefficient = clamp(coefficient, 0, 0.99);
  }

  process(input: number): number {
    this.prev = input * (1 - this.coefficient) + this.prev * this.coefficient;
    return this.prev;
  }
}

function inharmonicFrequency(n: number, f0: number, b: number): number {
  return n * f0 * Math.sqrt(1 + b * n * n);
}

function sawtoothGain(n: number): number {
  return 1 / n;
}

function defaultInharmonicity(f0: number): number {
  // Düşük tellerde B daha büyük, yüksek tellerde unisona yaklaşır.
  return clamp(0.0002 * (196 / f0), 0, 0.003);
}

function amplitudeEnvelope(t: number, attack: number, release: number, duration: number): number {
  if (t < attack) {
    const r = attack > 0 ? t / attack : 1;
    return r * r;
  }

  const releaseStart = Math.max(attack, duration - release);
  if (duration > releaseStart && t >= releaseStart) {
    const r = (t - releaseStart) / (duration - releaseStart);
    return 1 - r;
  }

  return 1;
}

export function bowedString(params: BowedStringParams): SynthesisResult {
  const sampleRate = clamp(params.sampleRate ?? 44100, 1000, 384000);
  const f0 = clamp(params.frequency, 20, sampleRate / 2);
  const duration = clamp(params.duration, 0.05, 600);
  const totalSamples = Math.floor(sampleRate * duration);

  const maxVibrato = f0 * 0.25;
  const vibratoDepth = clamp(params.vibratoDepth ?? f0 * 0.012, 0, maxVibrato);
  const vibratoRate = clamp(params.vibratoRate ?? 5.5, 0, 1000);
  const maxPartials = Math.floor(clamp(params.partials ?? 16, 1, 64));
  const unisonDetune = clamp(params.unisonDetune ?? 6, 0, 50);
  const bowNoise = clamp(params.bowNoise ?? 0.04, 0, 1);
  const bowNoiseCutoff = clamp(params.bowNoiseCutoff ?? 0.3, 0, 0.99);
  const attack = clamp(params.attack ?? 0.2, 0.001, duration * 0.5);
  const release = clamp(params.release ?? 0.25, 0.001, duration * 0.5);
  const gain = clamp(params.gain ?? 0.5, 0, 1);
  const seed = Number.isFinite(params.seed) ? (params.seed as number) : DEFAULT_SEED;
  const random = createRandom(seed);
  const randomRight = createRandom(seed + 1);

  const inharmonicity =
    params.inharmonicity !== undefined
      ? clamp(params.inharmonicity, 0, 0.01)
      : defaultInharmonicity(f0);

  // Yüksek perde: daha fazla tel (unison), düşük perde: tek tel.
  let unisonCount = 1;
  if (f0 > 300) unisonCount = 3;
  else if (f0 > 120) unisonCount = 2;

  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  const lpLeft = new OnePoleLowpass(bowNoiseCutoff);
  const lpRight = new OnePoleLowpass(bowNoiseCutoff);

  type Oscillator = {
    readonly fn: number;
    readonly gain: number;
    detuneL: number;
    detuneR: number;
    phaseL: number;
    phaseR: number;
  };

  const oscillators: Oscillator[] = [];

  for (let n = 1; n <= maxPartials; n++) {
    const fn = inharmonicFrequency(n, f0, inharmonicity);
    if (fn > sampleRate / 2) break;

    const amp = sawtoothGain(n) * gain;

    for (let u = 0; u < unisonCount; u++) {
      const detuneL = unisonCount === 1 ? 0 : (random.bipolar() * unisonDetune) / 2;
      const detuneR = unisonCount === 1 ? 0 : (random.bipolar() * unisonDetune) / 2;

      oscillators.push({
        fn,
        gain: amp,
        detuneL,
        detuneR,
        phaseL: random.next(),
        phaseR: random.next(),
      });
    }
  }

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const env = amplitudeEnvelope(t, attack, release, duration);
    const vibrato =
      vibratoDepth > 0 && vibratoRate > 0 ? Math.sin(2 * Math.PI * vibratoRate * t) : 0;

    let sumL = 0;
    let sumR = 0;

    for (const osc of oscillators) {
      const ratioL = Math.pow(2, osc.detuneL / 1200);
      const ratioR = Math.pow(2, osc.detuneR / 1200);

      // Vibrato aynı cent sapmasını tüm kısmi tonlara uygular.
      const vibratoL = ((vibratoDepth * osc.fn) / f0) * vibrato * ratioL;
      const vibratoR = ((vibratoDepth * osc.fn) / f0) * vibrato * ratioR;

      const freqL = osc.fn * ratioL + vibratoL;
      const freqR = osc.fn * ratioR + vibratoR;

      sumL += Math.sin(2 * Math.PI * osc.phaseL) * osc.gain * env;
      sumR += Math.sin(2 * Math.PI * osc.phaseR) * osc.gain * env;

      osc.phaseL = (osc.phaseL + freqL / sampleRate) % 1;
      osc.phaseR = (osc.phaseR + freqR / sampleRate) % 1;
    }

    const nL = lpLeft.process(random.bipolar());
    const nR = lpRight.process(randomRight.bipolar());
    const noiseAmp = bowNoise * 0.2 * env;

    sumL += nL * noiseAmp;
    sumR += nR * noiseAmp;

    left[i] = sumL;
    right[i] = sumR;
  }

  // Normalizasyon: tepeyi hedef seviyeye çek, kırpma yok.
  let peak = 0;
  for (let i = 0; i < totalSamples; i++) {
    const aL = Math.abs(left[i]);
    const aR = Math.abs(right[i]);
    if (aL > peak) peak = aL;
    if (aR > peak) peak = aR;
  }

  if (peak > 0) {
    const target = 0.95 * gain;
    const scale = target / peak;
    for (let i = 0; i < totalSamples; i++) {
      left[i] *= scale;
      right[i] *= scale;
    }
  }

  return {
    channels: [left, right],
    sampleRate,
    duration,
  };
}
