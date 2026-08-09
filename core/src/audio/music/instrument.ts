import { compose } from '../synth/sequencer';
import { synth } from '../synth/engine';
import type { SequenceNote, SynthParams, SynthesisResult } from '../synth/types';

/** Nota bazlı müzik çalımı için enstrüman şablonu.
 *  `SynthParams` üzerine kurulu; her notaya `frequency` ve `duration` enjekte edilir.
 */
export type InstrumentParams = Omit<SynthParams, 'frequency' | 'duration'>;

/** Melodik fraze içindeki tek nota. */
export interface MelodicNote {
  /** Beat başlangıcı (0 = phrase başı). */
  beat: number;
  /** Beat cinsinden nota süresi. */
  duration: number;
  /** Frekans (Hz) veya semitone. */
  freq?: number;
  semitone?: number;
  /** Notaya özel kazanç (0-1). */
  gain?: number;
}

/** Melodik fraze. */
export interface MelodicPhrase {
  /** Tempo (BPM). */
  bpm: number;
  /** Notalar. */
  notes: MelodicNote[];
  /** Tekrar sayısı. Varsayılan 1. */
  loop?: number;
  /** Tekrarlar arası bekleme (beat). Varsayılan 0. */
  loopDelay?: number;
}

/** Soft, karanlık temaya uygun hazır enstrümanlar. */
export type InstrumentName =
  | 'softPad'
  | 'softLead'
  | 'softBell'
  | 'softPluck'
  | 'softBass'
  | 'softDrone'
  | 'softChoir'
  | 'softTexture'
  | 'cyberCello'
  | 'cyberChoir'
  | 'cyberBell'
  | 'cyberPizz'
  | 'cyberWind'
  | 'cyberSparkle';

/** Müzik motoru için enstrüman.
 *  Sentez motorunu nota/fraze üretimine adapte eder.
 */
export class Instrument {
  constructor(public readonly params: InstrumentParams) {}

  /** Nota listesini `compose` ile tek buffer'a çevirir.
   *  Notalar `beat` alanına göre hizalanır; aynı beat'tekiler akor oluşturur.
   */
  renderPhrase(phrase: MelodicPhrase): SynthesisResult {
    const rootFreq = 220;
    const notes: SequenceNote[] = [];
    let prevBeat = 0;
    let prevDuration = 0;

    for (const note of phrase.notes) {
      const delay = note.beat - (prevBeat + prevDuration);
      notes.push({
        ...this.toSequenceNote(note, rootFreq),
        delay,
        params: note.gain !== undefined ? { gain: note.gain } : undefined,
      });
      prevBeat = note.beat;
      prevDuration = note.duration;
    }

    return compose({ notes, bpm: phrase.bpm, loop: phrase.loop, loopDelay: phrase.loopDelay }, {
      ...this.params,
      frequency: rootFreq,
    } as SynthParams);
  }

  /** Tek nota render eder. */
  renderNote(freq: number, duration: number, gain = 1): SynthesisResult {
    return synth(duration, {
      ...this.params,
      frequency: freq,
      gain: (this.params.gain ?? 1) * gain,
    } as SynthParams);
  }

  /** Enstrümanın gain'ini değiştirerek yeni bir kopya döner. */
  withGain(gain: number): Instrument {
    return new Instrument({ ...this.params, gain });
  }

  /** Enstrümanın frekans aralığını düşürerek yeni bir kopya döner. */
  withLowpass(cutoff: number): Instrument {
    return new Instrument({
      ...this.params,
      lowpass: { ...(this.params.lowpass ?? { cutoff }), cutoff },
    });
  }

  private toSequenceNote(note: MelodicNote, rootFreq: number): SequenceNote {
    const freq = note.freq ?? rootFreq * Math.pow(2, (note.semitone ?? 0) / 12);
    return { freq, duration: note.duration };
  }

  /** Hazır soft preset'ten enstrüman üretir. */
  static fromPreset(name: InstrumentName): Instrument {
    const params = PRESETS[name];
    return new Instrument(params);
  }
}

/** Adaptif müzikte state'e göre gain değiştiren hafif bir ara katman. */
export function instrumentGainFor(
  instrument: Instrument,
  state: { intensity?: number; tension?: number },
  baseGain = 1,
): Instrument {
  const intensity = state.intensity ?? 0;
  const tension = state.tension ?? 0;
  const dynamic = baseGain * (1 + (intensity + tension) * 0.2);
  return instrument.withGain(Math.min(1, dynamic));
}

/** Soft, karanlık temaya uygun preset'ler.
 *  Cızırtıyı önlemek için yalnızca sine/triangle temelli, ılımlı filtre ve zarflar.
 */
const PRESETS: Record<InstrumentName, InstrumentParams> = {
  softPad: {
    wave: ['sine', 'sine'],
    detune: 7,
    envelope: {
      attack: 0.6,
      hold: 0,
      decay: 0.2,
      sustain: 2,
      release: 1.5,
      sustainLevel: 0.8,
      curve: 'cosine',
    },
    lowpass: { cutoff: 420 },
    highpass: { cutoff: 60 },
    chorus: { depth: 2, rate: 0.05, mix: 0.25 },
    reverb: { amount: 0.18, decay: 1.0, roomSize: 0.5, damp: 0.5 },
    gain: 0.6,
  },

  softLead: {
    wave: ['sine', 'triangle'],
    detune: 5,
    envelope: {
      attack: 0.05,
      hold: 0.05,
      decay: 0.1,
      sustain: 0.6,
      release: 0.35,
      sustainLevel: 0.6,
      curve: 'cosine',
    },
    lowpass: { cutoff: 1400 },
    highpass: { cutoff: 120 },
    reverb: { amount: 0.12, decay: 0.7, roomSize: 0.45, damp: 0.55 },
    gain: 0.55,
  },

  softBell: {
    wave: 'sine',
    fm: {
      modulatorWave: 'sine',
      ratio: 2,
      index: 1.2,
      modulatorEnvelope: {
        attack: 0.01,
        decay: 0.2,
        sustain: 0,
        release: 0.3,
        sustainLevel: 0,
        curve: 'cosine',
      },
    },
    envelope: {
      attack: 0.01,
      hold: 0.05,
      decay: 0.1,
      sustain: 0.1,
      release: 0.6,
      sustainLevel: 0.3,
      curve: 'cosine',
    },
    lowpass: { cutoff: 2200 },
    highpass: { cutoff: 150 },
    reverb: { amount: 0.16, decay: 0.9, roomSize: 0.5, damp: 0.55 },
    gain: 0.45,
  },

  softPluck: {
    wave: 'triangle',
    envelope: {
      attack: 0.005,
      hold: 0.03,
      decay: 0.08,
      sustain: 0,
      release: 0.15,
      sustainLevel: 0.5,
      curve: 'cosine',
    },
    lowpass: { cutoff: 1600 },
    highpass: { cutoff: 100 },
    gain: 0.65,
  },

  softBass: {
    wave: 'sine',
    detune: 3,
    envelope: {
      attack: 0.03,
      hold: 0,
      decay: 0.05,
      sustain: 0.5,
      release: 0.2,
      sustainLevel: 0.75,
      curve: 'cosine',
    },
    lowpass: { cutoff: 240 },
    highpass: { cutoff: 40 },
    gain: 0.75,
  },

  softDrone: {
    wave: ['sine', 'sine'],
    detune: 5,
    envelope: {
      attack: 2,
      hold: 0,
      decay: 0,
      sustain: 4,
      release: 3,
      sustainLevel: 1,
      curve: 'cosine',
    },
    lowpass: { cutoff: 320 },
    highpass: { cutoff: 50 },
    chorus: { depth: 2, rate: 0.08, mix: 0.2 },
    gain: 0.55,
  },

  softChoir: {
    wave: ['sine', 'triangle'],
    detune: 8,
    envelope: {
      attack: 0.8,
      hold: 0,
      decay: 0.2,
      sustain: 1.5,
      release: 1.2,
      sustainLevel: 0.7,
      curve: 'cosine',
    },
    lowpass: { cutoff: 600 },
    highpass: { cutoff: 120 },
    chorus: { depth: 2.5, rate: 0.06, mix: 0.35 },
    reverb: { amount: 0.2, decay: 1.1, roomSize: 0.55, damp: 0.5 },
    gain: 0.5,
  },

  softTexture: {
    wave: 'pink',
    envelope: {
      attack: 1.5,
      hold: 0,
      decay: 0,
      sustain: 4,
      release: 2,
      sustainLevel: 0.4,
      curve: 'cosine',
    },
    lowpass: { cutoff: 260 },
    highpass: { cutoff: 80 },
    gain: 0.18,
  },

  // Melancholic Cyber-Chamber presets
  cyberCello: {
    wave: ['sawtooth', 'sine'],
    detune: 5,
    vibratoDepth: 4,
    vibratoRate: 3,
    envelope: {
      attack: 0.15,
      hold: 0.1,
      decay: 0.2,
      sustain: 0.8,
      release: 0.5,
      sustainLevel: 0.7,
      curve: 'cosine',
    },
    lowpass: { cutoff: 600 },
    highpass: { cutoff: 60 },
    reverb: { amount: 0.15, decay: 0.9, roomSize: 0.5, damp: 0.55 },
    gain: 0.55,
  },

  cyberChoir: {
    wave: ['sine', 'triangle'],
    detune: 8,
    envelope: {
      attack: 1.2,
      hold: 0,
      decay: 0.3,
      sustain: 2,
      release: 2,
      sustainLevel: 0.75,
      curve: 'cosine',
    },
    lowpass: { cutoff: 500 },
    highpass: { cutoff: 80 },
    chorus: { depth: 2.5, rate: 0.05, mix: 0.35 },
    reverb: { amount: 0.2, decay: 1.2, roomSize: 0.55, damp: 0.5 },
    gain: 0.5,
  },

  cyberBell: {
    wave: 'sine',
    fm: {
      modulatorWave: 'sine',
      ratio: 2,
      index: 0.8,
      modulatorEnvelope: {
        attack: 0.01,
        decay: 0.1,
        sustain: 0,
        release: 0.3,
        sustainLevel: 0,
        curve: 'cosine',
      },
    },
    envelope: {
      attack: 0.002,
      hold: 0.01,
      decay: 0.1,
      sustain: 0.05,
      release: 0.5,
      sustainLevel: 0.3,
      curve: 'cosine',
    },
    lowpass: { cutoff: 2200 },
    highpass: { cutoff: 150 },
    reverb: { amount: 0.18, decay: 0.9, roomSize: 0.5, damp: 0.55 },
    gain: 0.48,
  },

  cyberPizz: {
    wave: 'triangle',
    detune: 3,
    envelope: {
      attack: 0.005,
      hold: 0.02,
      decay: 0.06,
      sustain: 0,
      release: 0.15,
      sustainLevel: 0.5,
      curve: 'cosine',
    },
    lowpass: { cutoff: 1200 },
    highpass: { cutoff: 80 },
    gain: 0.65,
  },

  cyberWind: {
    wave: 'pink',
    envelope: {
      attack: 2,
      hold: 0,
      decay: 0,
      sustain: 8,
      release: 5,
      sustainLevel: 0.5,
      curve: 'cosine',
    },
    lowpass: { cutoff: 260 },
    highpass: { cutoff: 80 },
    gain: 0.2,
  },

  cyberSparkle: {
    wave: 'sine',
    envelope: {
      attack: 0.005,
      hold: 0.02,
      decay: 0.05,
      sustain: 0,
      release: 0.1,
      sustainLevel: 0.3,
      curve: 'cosine',
    },
    lowpass: { cutoff: 3000 },
    highpass: { cutoff: 500 },
    reverb: { amount: 0.12, decay: 0.6, roomSize: 0.5, damp: 0.55 },
    gain: 0.08,
  },
};
