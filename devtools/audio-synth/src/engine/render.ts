import type { Envelope } from '../envelope';
import { getWaveSampleWithPhase } from '../waveforms';
import { BiquadFilter, BUTTERWORTH_Q4, getCutoffAtTime, type Filter } from '../filter';
import type { Distortion } from '../effects';
import type { Voice } from './voice';
import { frequencyAtTime, getFmSample } from './frequency';
import { OVERSAMPLE_FACTOR } from './constants';
import { clamp01 } from '@volstudio/core/math/interpolation';

export function renderDrySample(
  t: number,
  duration: number,
  sampleRate: number,
  voices: Voice[],
  frequency: number,
  slide: number,
  slideCurve: 'linear' | 'exponential' | 'cosine',
  pitchJump: { amount: number; time: number; duration: number } | undefined,
  vibratoDepth: number,
  vibratoRate: number,
  tremoloDepth: number,
  tremoloRate: number,
  pulseWidth: number,
  envelope: Envelope,
  lowpass: Filter | undefined,
  highpass: Filter | undefined,
  lowpassParams: { cutoff: number; slide?: number; envAmount?: number } | undefined,
  highpassParams: { cutoff: number; slide?: number; envAmount?: number } | undefined,
  lowpassEnv: Envelope | undefined,
  highpassEnv: Envelope | undefined,
  distortion: Distortion | undefined,
  lfoValues: { pitch: number; filter: number; amplitude: number },
): number {
  let sample = 0;
  const lfoFreq = frequency + lfoValues.pitch;
  const nyquistLimit = sampleRate * 0.45;

  // Anlık frekans tüm sesler için ortak — bir kez hesaplanır.
  const baseFreq = frequencyAtTime(
    lfoFreq,
    slide,
    slideCurve,
    pitchJump,
    vibratoDepth,
    vibratoRate,
    t,
    duration,
    nyquistLimit,
  );

  for (const voice of voices) {
    if (voice.type === 'noise') {
      sample += voice.noise?.next() ?? 0;
      continue;
    }

    const detunedFreq =
      voice.detuneCents !== 0 ? baseFreq * Math.pow(2, voice.detuneCents / 1200) : baseFreq;

    if (voice.type === 'additive') {
      let sum = 0;
      for (let hi = 0; hi < voice.harmonics.length; hi++) {
        const h = voice.harmonics[hi];
        const hFreq = detunedFreq * h.ratio;
        const inc = hFreq / sampleRate;
        // Nyquist üstü harmonikler KELEPÇELENMEZ. `Math.min(nyquistLimit, hFreq)`
        // frekansı nyquistLimit'e KATLARDI — farklı ratio'lu birden çok harmonik
        // aynı katlanmış frekansta üst üste binip kaynak timbre'de olmayan yapay
        // bir ton/beating üretirdi. Bunun yerine duyulmaz harmonik tamamen
        // atlanır (sessiz). Faz biriktiricisi yine de gerçek frekansla
        // ilerletilir ki slide/vibrato ile harmonik yeniden duyulur aralığa
        // girdiğinde faz süreksizliği/tık oluşmasın.
        if (hFreq < nyquistLimit) {
          // `h.gain` (HarmonicParams) — presetler (örn. additivePad) harmonik
          // başına kasıtlı azalan kazanç tanımlar; burada uygulanmazsa tüm
          // harmonikler eşit sesle çalar ve tasarlanan timbre kaybolur.
          sum +=
            clamp01(h.gain) *
            getWaveSampleWithPhase('sine', voice.phases[hi] + (h.phase ?? 0), pulseWidth, inc);
        }
        voice.phases[hi] = (voice.phases[hi] + inc) % 1;
      }
      sample += sum;
      continue;
    }

    if (voice.fm) {
      sample += getFmSample(voice, detunedFreq, t, sampleRate, pulseWidth);
    } else {
      const inc = detunedFreq / sampleRate;
      sample += getWaveSampleWithPhase(voice.wave, voice.phase, pulseWidth, inc);
      voice.phase = (voice.phase + inc) % 1;
    }
  }

  // Filtreler — LFO + zarf modülasyonu cutoff'a uygula
  if (lowpass && lowpassParams) {
    let cutoff = getCutoffAtTime(lowpassParams, t, duration);
    if (lowpassEnv) {
      const envValue = lowpassEnv.value(t);
      const envAmount = lowpassParams.envAmount ?? 0;
      cutoff *= 1 - envAmount + envAmount * envValue;
    }
    cutoff += lfoValues.filter;
    sample = lowpass.process(sample, Math.max(1, cutoff));
  }
  if (highpass && highpassParams) {
    let cutoff = getCutoffAtTime(highpassParams, t, duration);
    if (highpassEnv) {
      const envValue = highpassEnv.value(t);
      const envAmount = highpassParams.envAmount ?? 0;
      cutoff *= 1 - envAmount + envAmount * envValue;
    }
    cutoff += lfoValues.filter;
    sample = highpass.process(sample, Math.max(1, cutoff));
  }

  // Zarf
  const env = envelope.value(t);
  sample *= env;

  // Tremolo
  if (tremoloDepth > 0 && tremoloRate > 0) {
    const tremolo = 1 - tremoloDepth * (0.5 + 0.5 * Math.sin(2 * Math.PI * tremoloRate * t));
    sample *= tremolo;
  }

  // LFO amplitude modülasyonu
  if (lfoValues.amplitude !== 0) {
    sample *= 1 - lfoValues.amplitude * 0.5;
  }

  // Distortion (zarf sonrası, global efektlerden önce)
  if (distortion) {
    sample = distortion.process(sample);
  }

  return sample;
}

/**
 * 2x oversampling ile anti-aliasing lowpass + decimation.
 *
 * Filtre 4. derece Butterworth: iki biquad kaskadı, Q değerleri 0.5412 ve
 * 1.3066 (Butterworth kutup açılarından).
 */
export function downsample2x(
  buffer: Float32Array,
  internalRate: number,
  targetRate: number,
): Float32Array {
  const cutoff = targetRate * 0.45;
  const f1 = new BiquadFilter(internalRate, 'lowpass', BUTTERWORTH_Q4[0]);
  const f2 = new BiquadFilter(internalRate, 'lowpass', BUTTERWORTH_Q4[1]);
  const filtered = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    const s = buffer[i];
    filtered[i] = f2.process(f1.process(s, cutoff), cutoff);
  }
  // Decimate by 2
  const outLen = Math.floor(buffer.length / OVERSAMPLE_FACTOR);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    out[i] = filtered[i * OVERSAMPLE_FACTOR]!;
  }
  return out;
}
