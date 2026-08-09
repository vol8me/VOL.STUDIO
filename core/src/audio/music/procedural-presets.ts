import type { EnvelopeParams, SynthParams, Waveform } from '../synth/types';
import type { ProceduralStemOptions } from './types';

/** Döngüye girecek buffer'da release tamamen buffer içinde bitsin;
 *  aksi halde loop geçişinde "tık" duyulur.
 */
function fitSustainForLoop(envelope: EnvelopeParams, duration: number): EnvelopeParams {
  const e = { ...envelope };
  const attack = e.attack ?? 0;
  const hold = e.hold ?? 0;
  const decay = e.decay ?? 0;
  const release = e.release ?? 0;
  const head = attack + hold + decay + release;
  e.sustain = head < duration ? duration - head : 0;
  return e;
}

/** Pad / ambient synth parametreleri üretir.
 *  Cızırtıyı önlemek için yalnızca sine temelli dalgalar ve ılımlı reverb kullanılır.
 */
export function padParams(options: ProceduralStemOptions): SynthParams {
  const envelope = options.envelope ?? {
    attack: 1,
    hold: 0,
    decay: 0,
    sustain: options.duration * 0.8,
    release: 2,
    sustainLevel: 0.8,
    curve: 'cosine',
  };
  return {
    wave: options.wave ?? ['sine', 'sine'],
    frequency: options.frequency ?? 220,
    detune: 5,
    duration: options.duration,
    envelope: options.loop ? fitSustainForLoop(envelope, options.duration) : envelope,
    lowpass: options.lowpass ?? { cutoff: 600, slide: 0 },
    highpass: options.highpass ?? { cutoff: 60 },
    chorus: options.chorus ?? { depth: 2, rate: 0.2, mix: 0.25 },
    reverb: options.reverb ?? { amount: 0.22, decay: 1.2, roomSize: 0.5, damp: 0.5 },
    gain: options.gain ?? 0.9,
    sampleRate: options.sampleRate,
  };
}

/** Drone / uzun ambient synth parametreleri üretir. */
export function droneParams(options: ProceduralStemOptions): SynthParams {
  const wave: Waveform[] = Array.isArray(options.wave) ? options.wave : [options.wave ?? 'sine'];
  const envelope = options.envelope ?? {
    attack: 2,
    hold: 0,
    decay: 0,
    sustain: options.duration,
    release: 3,
    sustainLevel: 1,
    curve: 'cosine',
  };
  return {
    wave,
    frequency: options.frequency ?? 110,
    detune: 5,
    duration: options.duration,
    envelope: options.loop ? fitSustainForLoop(envelope, options.duration) : envelope,
    lowpass: options.lowpass ?? { cutoff: 450, slide: 0 },
    highpass: options.highpass ?? { cutoff: 50 },
    chorus: options.chorus ?? { depth: 3, rate: 0.1, mix: 0.3 },
    reverb: options.reverb ?? { amount: 0.28, decay: 1.5, roomSize: 0.6, damp: 0.5 },
    gain: options.gain ?? 0.85,
    sampleRate: options.sampleRate,
  };
}

/** Bass synth parametreleri üretir. */
export function bassParams(options: ProceduralStemOptions): SynthParams {
  const envelope = options.envelope ?? {
    attack: 0.05,
    hold: 0,
    decay: 0.1,
    sustain: options.duration,
    release: 0.3,
    sustainLevel: 0.7,
    curve: 'cosine',
  };
  return {
    wave: options.wave ?? 'sine',
    frequency: options.frequency ?? 80,
    detune: 4,
    duration: options.duration,
    envelope: options.loop ? fitSustainForLoop(envelope, options.duration) : envelope,
    lowpass: options.lowpass ?? { cutoff: 220, slide: 0 },
    highpass: options.highpass ?? { cutoff: 40 },
    gain: options.gain ?? 0.9,
    sampleRate: options.sampleRate,
  };
}

/** Gürültü tabanlı ambient synth parametreleri üretir.
 *  Koyu atmosfer için tonal sine + yavaş modülasyon kullanır;
 *  cızırtıya neden olan brown/pink gürültü kullanılmaz.
 */
export function ambientNoiseParams(options: Omit<ProceduralStemOptions, 'wave'>): SynthParams {
  const envelope = options.envelope ?? {
    attack: 1,
    hold: 0,
    decay: 0,
    sustain: options.duration,
    release: 2,
    sustainLevel: 1,
    curve: 'cosine',
  };
  return {
    wave: ['sine', 'sine'],
    frequency: options.frequency ?? 100,
    detune: 6,
    duration: options.duration,
    envelope: options.loop ? fitSustainForLoop(envelope, options.duration) : envelope,
    lowpass: options.lowpass ?? { cutoff: 300, slide: 0 },
    highpass: options.highpass ?? { cutoff: 40 },
    reverb: options.reverb ?? { amount: 0.2, decay: 1.0, roomSize: 0.5, damp: 0.5 },
    chorus: { depth: 4, rate: 0.08, mix: 0.3 },
    vibratoDepth: 3,
    vibratoRate: 0.15,
    tremoloDepth: 0.08,
    tremoloRate: 0.2,
    gain: options.gain ?? 0.7,
    sampleRate: options.sampleRate,
  };
}
