import { getWaveSampleWithPhase } from '../waveforms';
import type { Voice } from './voice';

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/**
 * 2-operator phase modulation örneği üretir ve hem taşıyıcı hem modülatör
 * fazını bir örnek ilerletir. Faz mutlak zamandan değil birikimden gelir —
 * FM'de taşıyıcı frekansı sürekli değiştiği için bu şart.
 */
export function getFmSample(
  voice: Extract<Voice, { type: 'tone' }>,
  carrierFreq: number,
  t: number,
  sampleRate: number,
  pulseWidth: number,
): number {
  const fm = voice.fm;
  if (!fm) return 0;

  const modWave = fm.params.modulatorWave ?? 'sine';
  const ratio = fm.params.ratio ?? 1;
  const modFreq = carrierFreq * ratio;
  const modLevel = fm.params.modulatorLevel ?? 1;
  const feedback = Math.max(-0.99, Math.min(0.99, fm.params.feedback ?? 0));

  const env = fm.envelope?.value(t) ?? 1;
  let index = (fm.params.index ?? 0) * env * modLevel;

  // Aliasing guard: sideband'ler nyquist altında kalmalı (Bessel: ~index+2 sideband)
  const nyquist = sampleRate * 0.45;
  if (modFreq > 0 && carrierFreq > 0) {
    const maxSidebandFreq = nyquist - carrierFreq;
    if (maxSidebandFreq > 0) {
      const safeIndex = maxSidebandFreq / modFreq - 2;
      if (index > safeIndex) index = Math.max(0, safeIndex);
    } else {
      index = 0;
    }
  }

  // Feedback: bir önceki modulator çıktısı modulator fazına geri beslenir.
  const modInc = modFreq / sampleRate;
  const modSample = getWaveSampleWithPhase(
    modWave,
    fm.modPhase + feedback * fm.lastModSample,
    pulseWidth,
    modInc,
  );
  fm.lastModSample = modSample;
  fm.modPhase = (fm.modPhase + modInc) % 1;

  // Taşıyıcı faz sapması: index radyan cinsinden, 2π ile normalize edilir.
  const carrierInc = carrierFreq / sampleRate;
  const out = getWaveSampleWithPhase(
    voice.wave,
    voice.phase + (index * modSample) / (2 * Math.PI),
    pulseWidth,
    carrierInc,
  );
  voice.phase = (voice.phase + carrierInc) % 1;
  return out;
}

/**
 * Üstel interpolasyon — `start * (end/start)^t`. Ses frekans kaymaları için
 * doğal algı üsteldir; linear kayma perde değişimi olarak değil hacim değişimi
 * olarak duyulur.
 *
 * Üstel slide yalnızca PÖZİTİF uçlarda tanımlıdır: 0'dan pozitife üstel geçiş
 * matematiksel olarak `log(0) = -∞` içerir. Bu yüzden start/end ≤ 0 iken
 * linear lerp'ye düşülür. Çağıran üstel davranış bekliyorsa 0 geçişinden
 * kaçınmalı; bu fallback sessiz sürprizi önlemek için linear tutulur.
 */
function expLerp(start: number, end: number, t: number): number {
  if (start <= 0) return lerp(start, end, t);
  if (end <= 0) return lerp(start, end, t);
  return start * Math.exp(t * Math.log(end / start));
}

export function frequencyAtTime(
  frequency: number,
  slide: number,
  slideCurve: 'linear' | 'exponential' | 'cosine',
  pitchJump: { amount: number; time: number; duration: number } | undefined,
  vibratoDepth: number,
  vibratoRate: number,
  t: number,
  duration: number,
  maxFreq: number,
): number {
  let baseFreq = frequency;
  const endFreq = frequency + slide;

  const ratio = duration > 0 ? t / duration : 0;

  switch (slideCurve) {
    case 'linear':
      baseFreq = lerp(frequency, endFreq, ratio);
      break;
    case 'exponential':
      baseFreq = expLerp(frequency, endFreq, ratio);
      break;
    case 'cosine':
      baseFreq = lerp(frequency, endFreq, (1 - Math.cos(ratio * Math.PI)) / 2);
      break;
  }

  if (pitchJump && duration > 0) {
    const jumpStart = pitchJump.time * duration;
    const jumpEnd = jumpStart + pitchJump.duration;
    if (t >= jumpStart && t < jumpEnd) {
      const jumpRatio = (t - jumpStart) / pitchJump.duration;
      // Üçgensel zıplama: yukarı çık, hemen geri dön
      const jumpFactor = jumpRatio < 0.5 ? jumpRatio * 2 : (1 - jumpRatio) * 2;
      baseFreq += pitchJump.amount * jumpFactor;
    }
  }

  if (vibratoDepth > 0 && vibratoRate > 0) {
    baseFreq += vibratoDepth * Math.sin(2 * Math.PI * vibratoRate * t);
  }

  // Üst kelepçe şart: yukarı slide/derin vibrato frekansı Nyquist'in üstüne
  // çıkarabiliyordu; oversampling pay bırakıyor ama garanti vermiyordu.
  return Math.min(maxFreq, Math.max(1, baseFreq));
}
