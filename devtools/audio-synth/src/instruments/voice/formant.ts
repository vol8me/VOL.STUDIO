/**
 * Fiziksel model — formant sentezi / koro.
 *
 * Gırtlak kaynağı (sawtooth-benzeri zengin harmonikler) bir dizi bandpass
 * filtrede geçirilerek ünlü (vokal) formantları oluşturulur. Koro etkisi
 * için hafif detune'lu, farklı fazlı çok sayıda ses birlikte çalışır.
 */

import { createRandom, DEFAULT_SEED } from '@volstudio/core/random';
import { clamp } from '@volstudio/core/math/interpolation';
import type { SynthesisResult } from '../../types';
import { BiquadFilter } from '../../synthesis/filter';
import { Envelope } from '../../synthesis/envelope';

export interface Formant {
  /** Formant merkez frekansı (Hz). */
  frequency: number;
  /** Formant kazancı (0-1). */
  gain: number;
  /** Formant bant genişliği (Hz); küçük = yüksek Q. */
  bandwidth: number;
}

export interface FormantParams {
  /** Temel frekans (Hz). */
  frequency: number;
  /** Süre (saniye). */
  duration: number;
  /** Örnek oranı. Varsayılan 44100. */
  sampleRate?: number;
  /** Formant listesi. Varsayılan orta "ah" (700/1220/2600 Hz). */
  formants?: Formant[];
  /** Vibrato derinliği (Hz). */
  vibratoDepth?: number;
  /** Vibrato hızı (Hz). */
  vibratoRate?: number;
  /** Koro sesi sayısı (1-8). Varsayılan 4. */
  voices?: number;
  /** Sesler arası detune (cent). */
  unisonDetune?: number;
  /** Zarf atağı (saniye). Varsayılan 0.12. */
  attack?: number;
  /** Zarf sonuşu (saniye). Varsayılan 0.2. */
  release?: number;
  /** Genel kazanç (0-1). */
  gain?: number;
  /** Deterministik fazlar için seed. */
  seed?: number;
}

function sawGain(n: number): number {
  return 1 / n;
}

/** Bir bandpass formant filtresi oluştur; Q merkez/bant genişliği. */
function createFormantFilter(sampleRate: number, formant: Formant): BiquadFilter {
  const q = formant.frequency / Math.max(1, formant.bandwidth);
  return new BiquadFilter(sampleRate, 'bandpass', Math.max(0.5, q));
}

export function formant(params: FormantParams): SynthesisResult {
  const sampleRate = clamp(params.sampleRate ?? 44100, 1000, 384000);
  const f0 = clamp(params.frequency, 65, sampleRate / 2);
  const duration = clamp(params.duration, 0.05, 600);
  const totalSamples = Math.floor(sampleRate * duration);

  const defaultFormants: Formant[] = [
    { frequency: 700, gain: 1.0, bandwidth: 110 },
    { frequency: 1220, gain: 0.63, bandwidth: 140 },
    { frequency: 2600, gain: 0.4, bandwidth: 220 },
  ];
  const formants = params.formants ?? defaultFormants;
  const vibratoDepth = clamp(params.vibratoDepth ?? 2.5, 0, f0 * 0.1);
  const vibratoRate = clamp(params.vibratoRate ?? 5.0, 0, 20);
  const voices = Math.floor(clamp(params.voices ?? 4, 1, 8));
  const unisonDetune = clamp(params.unisonDetune ?? 8, 0, 50);
  const attack = clamp(params.attack ?? 0.12, 0.001, duration * 0.5);
  const release = clamp(params.release ?? 0.2, 0.001, duration * 0.5);
  const gain = clamp(params.gain ?? 0.4, 0, 1);
  const seed = Number.isFinite(params.seed) ? (params.seed as number) : DEFAULT_SEED;

  const envelope = new Envelope(
    {
      attack,
      decay: 0.05,
      sustain: Math.max(0, duration - attack - 0.05 - release),
      release,
      sustainLevel: 0.95,
    },
    duration,
  );

  const nyquist = sampleRate * 0.49;
  const maxPartial = Math.min(50, Math.floor(nyquist / f0));

  type Voice = {
    detune: number;
    pan: number;
    phases: Float64Array;
    phaseSteps: Float64Array;
    filters: { filter: BiquadFilter; gain: number; freq: number }[];
    seed: number;
    random: ReturnType<typeof createRandom>;
  };

  const voiceList: Voice[] = [];
  const baseRandom = createRandom(seed);

  for (let v = 0; v < voices; v++) {
    const pan = voices === 1 ? 0 : (v / (voices - 1)) * 2 - 1;
    const detune = voices === 1 ? 0 : (baseRandom.bipolar() * unisonDetune) / 2;
    const voiceSeed = seed + v * 0x9e3779b9;
    const random = createRandom(voiceSeed);

    const filters = formants
      .filter((f) => f.frequency < nyquist)
      .map((f) => ({
        filter: createFormantFilter(sampleRate, f),
        gain: f.gain,
        freq: f.frequency,
      }));

    const phases = new Float64Array(maxPartial);
    const phaseSteps = new Float64Array(maxPartial);
    for (let n = 0; n < maxPartial; n++) {
      phaseSteps[n] = (f0 * (n + 1) * Math.pow(2, detune / 1200)) / sampleRate;
      phases[n] = random.next();
    }

    voiceList.push({ detune, pan, phases, phaseSteps, filters, seed: voiceSeed, random });
  }

  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const env = envelope.value(t);
    const vibrato =
      vibratoDepth > 0 && vibratoRate > 0 ? Math.sin(2 * Math.PI * vibratoRate * t) : 0;

    let sumL = 0;
    let sumR = 0;

    for (const voice of voiceList) {
      let source = 0;
      for (let n = 0; n < maxPartial; n++) {
        source += sawGain(n + 1) * Math.sin(2 * Math.PI * voice.phases[n]);
        // Vibrato'yu tüm kısmi tonlara orantılı uygula.
        const detunedStep = voice.phaseSteps[n] * (1 + (vibrato / f0) * (n + 1) * 0.01);
        voice.phases[n] += detunedStep;
        voice.phases[n] -= Math.floor(voice.phases[n]);
      }

      // Formant filtreleri: aynı kaynak tüm formantlardan geçirilir.
      // Formant listesi boşsa kaynak aynen iletilir; bu yüksek frekans
      // mutasyon testinin anlamlı karşılaştırması için gerekli.
      let filtered = 0;
      if (voice.filters.length === 0) {
        filtered = source;
      } else {
        for (const f of voice.filters) {
          filtered += f.filter.process(source, f.freq) * f.gain;
        }
      }

      // Pan uygula.
      const panGainL = Math.sqrt(1 - Math.max(-1, Math.min(1, voice.pan)) * 0.5);
      const panGainR = Math.sqrt(1 + Math.max(-1, Math.min(1, voice.pan)) * 0.5);
      sumL += filtered * panGainL;
      sumR += filtered * panGainR;
    }

    left[i] = sumL * env * gain;
    right[i] = sumR * env * gain;
  }

  // İç normalize: kırpma yok.
  let peak = 0;
  for (let i = 0; i < totalSamples; i++) {
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  if (peak > 0) {
    const scale = 0.95 / peak;
    for (let i = 0; i < totalSamples; i++) {
      left[i] *= scale;
      right[i] *= scale;
    }
  }

  return { channels: [left, right], sampleRate, duration };
}
