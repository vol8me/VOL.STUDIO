import type { SynthParams } from '../synth/types';

/** SFX üretiminde kullanılan enstrüman preset'leri.
 *  Müzik runtime'da çalınmaz — WAV'lar önceden üretilir.
 *  Bu sınıf sadece build-time SFX script'leri için preset sağlar. */
export type InstrumentParams = Omit<SynthParams, 'frequency' | 'duration'>;

/** SFX script'lerinde kullanılan hazır preset'ler. */
export type InstrumentName = 'obsidianBell' | 'obsidianPluck';

/** SFX üretiminde kullanılan enstrüman şablonu. */
export class Instrument {
  constructor(public readonly params: InstrumentParams) {}

  /** Hazır preset'ten enstrüman üretir. */
  static fromPreset(name: InstrumentName): Instrument {
    return new Instrument(PRESETS[name]);
  }
}

/** SFX için obsidyen temelli preset'ler — karanlık, derin, parlak değil.
 *  Müziğin sinematik/volkanik dokusuyla uyumlu; D minor tonalitesine göre tasarlandı. */
const PRESETS: Record<InstrumentName, InstrumentParams> = {
  /** Obsidyen çan — karanlık FM bell.
   *  Düşük cutoff ile parlaklık kesilmiş, FM index azaltılmış.
   *  Sustain kısa — çan vurması sonra hızlı sönüm. */
  obsidianBell: {
    wave: 'sine',
    fm: {
      modulatorWave: 'sine',
      ratio: 2,
      index: 0.5,
      modulatorEnvelope: {
        attack: 0.008,
        decay: 0.08,
        sustain: 0,
        release: 0.25,
        sustainLevel: 0,
        curve: 'cosine',
      },
    },
    envelope: {
      attack: 0.003,
      hold: 0.008,
      decay: 0.09,
      sustain: 0.04,
      release: 0.4,
      sustainLevel: 0.25,
      curve: 'cosine',
    },
    lowpass: { cutoff: 1500 },
    highpass: { cutoff: 120 },
    reverb: { amount: 0.15, decay: 0.8, roomSize: 0.5, damp: 0.6 },
    gain: 0.48,
  },

  /** Obsidyen pluck — karanlık telli vuruş.
   *  Düşük cutoff, kısa decay, yumuşak transient.
   *  Daha derin body, daha az parlak üst tını. */
  obsidianPluck: {
    wave: 'triangle',
    detune: 4,
    envelope: {
      attack: 0.004,
      hold: 0.015,
      decay: 0.05,
      sustain: 0,
      release: 0.12,
      sustainLevel: 0.45,
      curve: 'cosine',
    },
    lowpass: { cutoff: 900 },
    highpass: { cutoff: 70 },
    gain: 0.65,
  },
};
