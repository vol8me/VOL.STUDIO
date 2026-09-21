import type { Envelope } from '../synthesis/envelope';
import { getWaveSampleWithPhase } from '../synthesis/waveforms';
import { getCutoffAtTime, type Filter } from '../synthesis/filter';
import type { Distortion } from '../effects';
import type { ResolvedFilter } from '../guard/synthesis';
import type { Voice } from './voice';
import { frequencyAtTime, getFmSample } from './frequency';
import { OVERSAMPLE_FACTOR } from './constants';

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
  lowpassParams: ResolvedFilter | undefined,
  highpassParams: ResolvedFilter | undefined,
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
            h.gain * getWaveSampleWithPhase('sine', voice.phases[hi] + h.phase, pulseWidth, inc);
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
      const envAmount = lowpassParams.envAmount;
      cutoff *= 1 - envAmount + envAmount * envValue;
    }
    cutoff += lfoValues.filter;
    sample = lowpass.process(sample, Math.max(1, cutoff));
  }
  if (highpass && highpassParams) {
    let cutoff = getCutoffAtTime(highpassParams, t, duration);
    if (highpassEnv) {
      const envValue = highpassEnv.value(t);
      const envAmount = highpassParams.envAmount;
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
 * 2× decimation filtresi: sıfır fazlı, Kaiser pencereli halfband FIR.
 *
 * Geçiş bandı çıkış oranının %45.35'ine (44.1 kHz'de 20 kHz) kadar düzdür;
 * durdurma bandı `fs − 0.4535·fs`'te başlar — orada katlanan içerik tam
 * geçiş bandı kenarına düşer, yani işitilir banda hiçbir şey ≥ 96 dB
 * zayıflamadan katlanmaz. Eski 4. derece Butterworth 24–40 kHz'i yalnız
 * 7–24 dB söndürüyordu ve iç Nyquist'e kadar izin verilen FM yan bantları
 * oradan işitilir banda katlanıyordu (ölçüm: DESIGN "FM alias").
 *
 * Halfband: çift indisli katsayılar (merkez hariç) sıfırdır ve çekirdek
 * simetriktir; çıkış başına ~M/2 çarpım yeter. Merkezli (nedensel olmayan)
 * çekirdek offline'dır ve zaman kaydırmaz.
 */
const DECIMATOR_PASSBAND = 0.4535;
const DECIMATOR_STOPBAND_DB = 96;

function designHalfband(): Float64Array {
  // Normalize geçiş genişliği, iç oranın döngüsü cinsinden.
  const transition = (0.5 - DECIMATOR_PASSBAND) / OVERSAMPLE_FACTOR;
  const order = (DECIMATOR_STOPBAND_DB - 7.95) / (2.285 * 2 * Math.PI * transition);
  let half = Math.ceil(order / 2);
  if (half % 2 === 0) half++;
  const beta = 0.1102 * (DECIMATOR_STOPBAND_DB - 8.7);
  const i0 = (x: number): number => {
    let sum = 1;
    let term = 1;
    for (let k = 1; k < 64; k++) {
      term *= (x * x) / 4 / (k * k);
      sum += term;
      if (term < sum * 1e-16) break;
    }
    return sum;
  };
  // taps[j] = h[2j + 1]; h[0] = 0.5 ayrı tutulur, çift indisler sıfırdır.
  const taps = new Float64Array((half + 1) / 2);
  const norm = i0(beta);
  for (let j = 0; j < taps.length; j++) {
    const n = 2 * j + 1;
    const u = n / (half + 1);
    const sinc = Math.sin((Math.PI * n) / 2) / ((Math.PI * n) / 2);
    taps[j] = 0.5 * sinc * (i0(beta * Math.sqrt(1 - u * u)) / norm);
  }
  return taps;
}

const HALFBAND_TAPS = designHalfband();

/**
 * 2× oversample tamponu hedef orana indirir. Yalnız çıkış tamponu ayrılır;
 * kaynak sınırların dışında sıfır sayılır.
 */
export function downsample2x(
  buffer: Float32Array,
  _internalRate: number,
  _targetRate: number,
): Float32Array {
  const outLen = Math.floor(buffer.length / OVERSAMPLE_FACTOR);
  const out = new Float32Array(outLen);
  const last = buffer.length - 1;
  const taps = HALFBAND_TAPS;
  for (let i = 0; i < outLen; i++) {
    const center = i * OVERSAMPLE_FACTOR;
    let acc = 0.5 * buffer[center];
    for (let j = 0; j < taps.length; j++) {
      const offset = 2 * j + 1;
      const ahead = center + offset;
      const behind = center - offset;
      acc += taps[j] * ((ahead <= last ? buffer[ahead] : 0) + (behind >= 0 ? buffer[behind] : 0));
    }
    out[i] = acc;
  }
  return out;
}
