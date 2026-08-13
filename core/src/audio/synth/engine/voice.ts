import type { FmParams, HarmonicParams, Waveform } from '../types';
import { Envelope } from '../envelope';
import { createNoiseSource, type NoiseSource } from '../noise';

export type FmState = {
  params: FmParams;
  envelope?: Envelope;
  lastModSample: number;
  /** Modülatörün birikmiş fazı (0-1). */
  modPhase: number;
};

/**
 * Bir osilatör sesi. `phase` alanları KRİTİK: faz her örnekte anlık frekansla
 * ilerletilir. Faz `frekans * t` ile hesaplanırsa — önceki tasarım böyleydi —
 * zamanla değişen frekansta (slide, vibrato, pitchJump, FM) duyulan frekans
 * yanlış olur, çünkü faz frekansın İNTEGRALİDİR. Lineer bir slide'da nota
 * sonunda `f₁` yerine `2·f₁ - f₀` duyuluyordu; vibrato derinliği de zamanla
 * lineer büyüyordu.
 */
export type Voice =
  | { type: 'noise'; noise: NoiseSource; detuneCents: 0 }
  | {
      type: 'tone';
      wave: Exclude<Waveform, 'noise' | 'pink' | 'brown'>;
      detuneCents: number;
      /** Taşıyıcının birikmiş fazı (0-1). */
      phase: number;
      fm?: FmState;
    }
  | {
      type: 'additive';
      harmonics: HarmonicParams[];
      detuneCents: number;
      /** Harmonik başına birikmiş faz (0-1). */
      phases: Float64Array;
    };

export function createFmState(fm: FmParams | undefined, duration: number): FmState | undefined {
  if (!fm || (fm.index ?? 0) <= 0) return undefined;
  const envelope = fm.modulatorEnvelope ? new Envelope(fm.modulatorEnvelope, duration) : undefined;
  return { params: fm, envelope, lastModSample: 0, modPhase: 0 };
}

export function createVoices(
  wave: Waveform | Waveform[] | undefined,
  detune: number | undefined,
  fm: FmParams | undefined,
  duration: number,
  harmonics: HarmonicParams[] | undefined,
  seed: number,
): Voice[] {
  const voices: Voice[] = [];

  // Additive synthesis — harmonik serisi varsa sine toplamı kullan
  if (harmonics && harmonics.length > 0) {
    voices.push({
      type: 'additive',
      harmonics,
      detuneCents: 0,
      phases: new Float64Array(harmonics.length),
    });
    const detuneCents = detune ?? 0;
    if (detuneCents !== 0) {
      voices.push({
        type: 'additive',
        harmonics,
        detuneCents,
        phases: new Float64Array(harmonics.length),
      });
    }
    return voices;
  }

  const waves = Array.isArray(wave) ? wave : [wave ?? 'sine'];

  // Her gürültü sesi kendi seed'ini alır; aynı preset içinde iki gürültü
  // katmanı birebir aynı diziyi üretip birbirini iki katına çıkarmasın.
  let noiseIndex = 0;

  for (const w of waves) {
    if (w === 'noise' || w === 'pink' || w === 'brown') {
      voices.push({
        type: 'noise',
        noise: createNoiseSource(w, seed + noiseIndex++),
        detuneCents: 0,
      });
    } else {
      voices.push({
        type: 'tone',
        wave: w,
        detuneCents: 0,
        phase: 0,
        fm: createFmState(fm, duration),
      });
    }
  }

  // Detune varsa ton seslerinin kopyasını ekle
  const detuneCents = detune ?? 0;
  if (detuneCents !== 0) {
    const originalLength = voices.length;
    for (let i = 0; i < originalLength; i++) {
      const v = voices[i];
      if (v?.type === 'tone') {
        voices.push({
          type: 'tone',
          wave: v.wave,
          detuneCents,
          phase: 0,
          fm: createFmState(fm, duration),
        });
      }
    }
  }

  return voices;
}
