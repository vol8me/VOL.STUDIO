/**
 * Menü müzikleri için ortak, yüksek kaliteli enstrüman presetleri.
 * Spektral denge, stereo hareket ve loop uyumlu sustain kontrolüne odaklanır.
 */

import { synth } from '../src/audio/synth/engine';
import { pluck } from '../src/audio/synth/physical';
import type { SynthesisResult, EnvelopeParams, LfoParams } from '../src/audio/synth/types';
import {
  SAMPLE_RATE,
  FIFTH,
  MINOR_3,
  MAJOR_3,
  type ChordDef,
  emptyBuffer,
  toStereo,
  addToStereo,
} from './music-utils';

export { SAMPLE_RATE, FIFTH, MINOR_3, MAJOR_3 };

export interface MenuNote {
  freq: number;
  beats: number;
  velocity?: number;
  pan?: number;
}

// --- Utility envelopes ---

function adsr(
  attack: number,
  decay: number,
  sustain: number,
  release: number,
  sustainLevel: number,
  curve: 'linear' | 'exponential' | 'cosine' = 'cosine',
): EnvelopeParams {
  return { attack, hold: 0, decay, sustain, release, sustainLevel, curve };
}

function padEnvelope(duration: number): EnvelopeParams {
  const release = 0.5;
  return adsr(0.08, 0, Math.max(0.1, duration - 0.13 - release), release, 0.75, 'cosine');
}

// --- Atmosphere / air layers ---

/** Yüksek frekanslı, geniş, havadar tavan layer'ı.
 *  Menü parçalarına eksik olan 4-12 kHz içeriği katar. */
export function shimmerAir(freq: number, duration: number, gain = 0.18, pan = 0): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    wave: 'triangle',
    frequency: freq,
    detune: 18,
    envelope: padEnvelope(duration),
    lowpass: { cutoff: 6500, resonance: 0.02, poles: 1, type: 'lowpass' },
    highpass: { cutoff: 600, resonance: 0, poles: 1, type: 'highpass' },
    lfos: [
      { target: 'amplitude', rate: 0.12, depth: 0.15, wave: 'sine' },
      { target: 'filter', rate: 0.07, depth: 80, wave: 'sine' },
    ],
    reverb: { amount: 0.55, decay: 5.5, roomSize: 0.9, damp: 0.2 },
    pan,
    stereoWidth: { width: 1.35 },
    gain,
  });
}

/** Çok yüksek frekanslı, neredeyse duyulmayan ama hava katan shimmer.
 *  8-16 kHz aralığını doldurur. */
export function highShimmer(freq: number, duration: number, gain = 0.05, pan = 0): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    wave: 'triangle',
    frequency: freq,
    detune: 25,
    envelope: padEnvelope(duration),
    lowpass: { cutoff: 12000, resonance: 0.02, poles: 1, type: 'lowpass' },
    highpass: { cutoff: 8000, resonance: 0, poles: 1, type: 'highpass' },
    lfos: [
      { target: 'amplitude', rate: 0.18, depth: 0.2, wave: 'sine' },
      { target: 'filter', rate: 0.1, depth: 120, wave: 'sine' },
    ],
    reverb: { amount: 0.6, decay: 5, roomSize: 0.9, damp: 0.15 },
    pan,
    stereoWidth: { width: 1.45 },
    gain,
  });
}

/** Isık, yumuşak, geniş additive pad.
 *  Sawtooth değil, harmonik seri ile daha temiz üst tını. */
export function warmPad(freq: number, duration: number, gain = 0.2, pan = 0): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    harmonics: [
      { ratio: 1, gain: 1.0, phase: 0 },
      { ratio: 2, gain: 0.35, phase: 0.08 },
      { ratio: 1.5, gain: 0.28, phase: 0.15 },
      { ratio: 3, gain: 0.18, phase: 0.22 },
      { ratio: 4, gain: 0.1, phase: 0.3 },
      { ratio: 5, gain: 0.05, phase: 0.38 },
    ],
    frequency: freq,
    detune: 10,
    envelope: padEnvelope(duration),
    lowpass: { cutoff: 1800, resonance: 0.05, poles: 2, type: 'lowpass' },
    lfos: [
      { target: 'filter', rate: 0.09, depth: 120, wave: 'sine' },
      { target: 'amplitude', rate: 0.05, depth: 0.1, wave: 'sine' },
    ],
    chorus: { depth: 5, rate: 0.3, mix: 0.35 },
    reverb: { amount: 0.4, decay: 4.5, roomSize: 0.85, damp: 0.35 },
    pan,
    stereoWidth: { width: 1.2 },
    gain,
  });
}

/** Sürekli karanlık drone — sine/saw karışımı, derin, hareketli. */
export function darkDrone(freq: number, duration: number, gain = 0.15, pan = 0): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    wave: 'sawtooth',
    frequency: freq,
    detune: 8,
    envelope: padEnvelope(duration),
    lowpass: { cutoff: 220, resonance: 0, poles: 2, type: 'lowpass' },
    lfos: [
      { target: 'filter', rate: 0.06, depth: 40, wave: 'sine' },
      { target: 'amplitude', rate: 0.04, depth: 0.12, wave: 'sine' },
    ],
    reverb: { amount: 0.35, decay: 4, roomSize: 0.8, damp: 0.45 },
    pan,
    stereoWidth: { width: 1.2 },
    gain,
  });
}

/** Çok derin sub-bass — sine, hafif filter LFO, dar lowpass. */
export function deepSubBass(freq: number, duration: number, gain = 0.28, pan = 0): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    wave: 'sine',
    frequency: freq,
    detune: 4,
    envelope: padEnvelope(duration),
    lowpass: { cutoff: 120, resonance: 0.05, poles: 1, type: 'lowpass' },
    lfos: [{ target: 'amplitude', rate: 0.08, depth: 0.08, wave: 'sine' }],
    reverb: { amount: 0.18, decay: 2.5, roomSize: 0.7, damp: 0.6 },
    pan,
    gain,
  });
}

// --- Melodik / perküsyon enstrümanları ---

/** Parlak, net FM bell lead.
 *  Düşük frekanslarda ılımlı, yükseklerde air. */
export function bellLead(
  freq: number,
  noteDuration: number,
  velocity = 1,
  pan = 0,
): SynthesisResult {
  const attack = 0.012;
  const decay = 0.22;
  const release = 0.4;
  const sustain = Math.max(0.05, noteDuration - attack - decay);
  const buffer = noteDuration + release + 0.05;

  return synth(buffer, {
    sampleRate: SAMPLE_RATE,
    wave: 'sine',
    frequency: freq,
    detune: 4,
    fm: {
      modulatorWave: 'sine',
      ratio: 3,
      index: 2.0 * velocity,
      modulatorEnvelope: adsr(0.006, 0.35, 0.12, 0.3, 0.08, 'exponential'),
    },
    envelope: adsr(attack, decay, sustain, release, 0.6, 'cosine'),
    lowpass: { cutoff: 6000, resonance: 0.03, poles: 1, type: 'lowpass' },
    reverb: { amount: 0.32, decay: 3.5, roomSize: 0.8, damp: 0.45 },
    pan,
    stereoWidth: { width: 1.2 },
    gain: 0.4 * velocity,
  });
}

/** Geliştirilmiş physical pluck — karanlık telli ses. */
export function pluckString(
  freq: number,
  duration: number,
  velocity = 1,
  pan = 0,
): SynthesisResult {
  const freqRatio = Math.max(0.5, Math.min(2, freq / 220));
  const decay = 0.995 - (freqRatio - 1) * 0.008;

  return pluck({
    frequency: freq,
    duration,
    sampleRate: SAMPLE_RATE,
    decay,
    excitationMix: 0.65,
    excitationHarmonics: 6,
    stereoWidth: 0.45,
    gain: 0.7 * velocity,
    bodyResonance: freq * 2,
    bodyAmount: 0.3,
  });
}

/** Geniş, sinematik additive strings.
 *  Daha yüksek lowpass ile üst tını korunur. */
export function cinematicStrings2(
  freq: number,
  duration: number,
  gain = 0.24,
  pan = 0,
): SynthesisResult {
  const attack = 0.35;
  const release = 0.6;
  const sustain = Math.max(0.1, duration - attack - release);
  const buffer = duration + release + 0.1;

  return synth(buffer, {
    sampleRate: SAMPLE_RATE,
    harmonics: [
      { ratio: 1, gain: 1.0, phase: 0 },
      { ratio: 2, gain: 0.45, phase: 0.1 },
      { ratio: 1.5, gain: 0.32, phase: 0.18 },
      { ratio: 3, gain: 0.2, phase: 0.25 },
      { ratio: 4, gain: 0.12, phase: 0.32 },
      { ratio: 5, gain: 0.06, phase: 0.4 },
    ],
    frequency: freq,
    detune: 8,
    envelope: adsr(attack, 0, sustain, release, 0.8, 'cosine'),
    lowpass: { cutoff: 2800, resonance: 0.03, poles: 2, type: 'lowpass' },
    chorus: { depth: 5, rate: 0.28, mix: 0.4 },
    reverb: { amount: 0.38, decay: 5, roomSize: 0.9, damp: 0.35 },
    pan,
    stereoWidth: { width: 1.3 },
    gain,
  });
}

/** Bass pulse — sawtooth, filter envelope, tok ama açık. */
export function bassPulse2(freq: number, duration: number, gain = 0.55, pan = 0): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    wave: 'sawtooth',
    frequency: freq,
    detune: 4,
    envelope: adsr(0.008, 0.12, 0.25, 0.12, 0.5, 'exponential'),
    lowpass: {
      cutoff: 500,
      resonance: 0.08,
      poles: 2,
      type: 'lowpass',
      envelope: adsr(0.002, 0.15, 0.1, 0.2, 0.15, 'exponential'),
      envAmount: 0.55,
    },
    reverb: { amount: 0.12, decay: 1.2, roomSize: 0.6, damp: 0.55 },
    pan,
    gain,
  });
}

/** Arp notası — saw + hafif FM, açık filtre. */
export function arpSaw(freq: number, duration: number, velocity = 1, pan = 0): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    wave: 'sawtooth',
    frequency: freq,
    detune: 5,
    fm: { modulatorWave: 'sine', ratio: 1, index: 0.18 * velocity },
    envelope: adsr(0.004, 0.12, 0.15, 0.2, 0.18, 'exponential'),
    lowpass: {
      cutoff: 2200,
      resonance: 0.1,
      poles: 2,
      type: 'lowpass',
      envelope: adsr(0.002, 0.12, 0.12, 0.18, 0.18, 'exponential'),
      envAmount: 0.45,
    },
    reverb: { amount: 0.22, decay: 2, roomSize: 0.65, damp: 0.5 },
    pan,
    stereoWidth: { width: 1.2 },
    gain: 0.24 * velocity,
  });
}

/** Cinematic kick — sine slide, punchy, derin. */
export function cinematicKick(
  freq: number,
  duration: number,
  gain = 0.65,
  pan = 0,
): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    wave: 'sine',
    frequency: freq,
    slide: -freq * 0.65,
    slideCurve: 'exponential',
    envelope: adsr(0.001, 0.16, 0, 0.05, 0, 'exponential'),
    lowpass: { cutoff: 500, resonance: 0.2, poles: 1, type: 'lowpass' },
    pan,
    gain,
  });
}

/** Koyu snare — noise + dar band, reverb. */
export function darkSnare2(duration: number, gain = 0.32, pan = 0): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    wave: 'noise',
    frequency: 400,
    envelope: adsr(0.001, 0.08, 0, 0.04, 0, 'exponential'),
    highpass: { cutoff: 900, resonance: 0.12, poles: 2, type: 'highpass' },
    reverb: { amount: 0.1, decay: 0.9, roomSize: 0.55, damp: 0.65 },
    pan,
    gain,
  });
}

/** Açık hi-hat — yüksek frekans, kısa. */
export function openHiHat(duration: number, gain = 0.22, pan = 0): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    wave: 'noise',
    frequency: 800,
    envelope: adsr(0.0005, 0.025, 0, 0.015, 0, 'exponential'),
    highpass: { cutoff: 6000, resonance: 0.1, poles: 2, type: 'highpass' },
    pan,
    gain,
  });
}

/** Brass swell — saw + FM, açılan filtre, basınç. */
export function brassStab(freq: number, duration: number, gain = 0.32, pan = 0): SynthesisResult {
  const attack = 0.08;
  const release = 0.7;
  const sustain = Math.max(0.1, duration - attack - 0.3 - release);
  const buffer = duration + release + 0.1;

  return synth(buffer, {
    sampleRate: SAMPLE_RATE,
    wave: 'sawtooth',
    frequency: freq,
    detune: 6,
    fm: {
      modulatorWave: 'sine',
      ratio: 1,
      index: 1.2,
      modulatorEnvelope: adsr(0.05, 0.3, 0.2, 0.4, 0.25, 'cosine'),
    },
    envelope: adsr(attack, 0.3, sustain, release, 0.65, 'cosine'),
    lowpass: {
      cutoff: 900,
      resonance: 0.12,
      poles: 2,
      type: 'lowpass',
      envelope: adsr(0.05, 0.4, 0.3, 0.5, 0.35, 'cosine'),
      envAmount: 0.55,
    },
    reverb: { amount: 0.35, decay: 3.5, roomSize: 0.8, damp: 0.4 },
    pan,
    stereoWidth: { width: 1.2 },
    gain,
  });
}

// --- Helpers ---

/** Akor frekanslarını döndürür. */
export function chordTones(
  chord: ChordDef,
  baseOctave = 1,
): { root: number; third: number; fifth: number; octave: number } {
  const root = chord.root * baseOctave;
  const third = root * (chord.type === 'minor' ? MINOR_3 : MAJOR_3);
  const fifth = root * FIFTH;
  const octave = root * 2;
  return { root, third, fifth, octave };
}

/** Verilen beat'te çalan akoru döndürür — akor uzunluğu opsiyonel. */
export function chordAtBeat(chords: ChordDef[], beat: number, chordBeats = 8): ChordDef {
  return chords[Math.floor(beat / chordBeats) % chords.length]!;
}

/** Tek notalı bir melodi track'ini render eder.
 *  Her notaya pan jitter eklenir. */
export function renderMelodyTrack(
  notes: MenuNote[],
  startBeat: number,
  beatDuration: number,
  fileDuration: number,
  noteFn: (freq: number, noteDuration: number, velocity: number, pan: number) => SynthesisResult,
  fadeInBeats: [number, number] = [0, 0],
  fadeOutBeats: [number, number] = [0, 0],
): SynthesisResult {
  const left = emptyBuffer(fileDuration);
  const right = emptyBuffer(fileDuration);
  const beatToSample = (b: number) => Math.floor(b * beatDuration * SAMPLE_RATE);

  let beatCounter = startBeat;
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i]!;
    const offset = beatToSample(beatCounter);
    if (offset >= left.length) break;
    const noteDur = note.beats * beatDuration;
    const pan = note.pan ?? Math.sin(i * 1.7) * 0.35; // mild panning
    const voice = noteFn(note.freq, noteDur, note.velocity ?? 1, pan);
    addToStereo(left, right, voice, offset);
    beatCounter += note.beats;
  }

  // simple cosine fades if requested
  const [fiS, fiE] = fadeInBeats;
  const [foS, foE] = fadeOutBeats;
  const applyFade = (startBeatF: number, endBeatF: number, isIn: boolean) => {
    if (startBeatF >= endBeatF) return;
    const s = beatToSample(startBeatF);
    const e = Math.min(left.length, beatToSample(endBeatF));
    for (let i = s; i < e; i++) {
      const t = (i - s) / Math.max(1, e - s);
      const gain = isIn ? 0.5 - 0.5 * Math.cos(Math.PI * t) : 0.5 + 0.5 * Math.cos(Math.PI * t);
      left[i]! *= gain;
      right[i]! *= gain;
    }
    if (!isIn) {
      for (let i = e; i < left.length; i++) {
        left[i] = 0;
        right[i] = 0;
      }
    }
  };
  applyFade(fiS, fiE, true);
  applyFade(foS, foE, false);

  return toStereo(left, right, fileDuration);
}
