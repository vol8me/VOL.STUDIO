import { AudioParamError } from '../guard/errors';
import { checkArray, checkChoice, checkNumber, checkObject } from '../guard/read';
import { degreeToMidi, MIDI_MAX, MIDI_MIN } from './tonal';

/**
 * Armoni ve voicing: aynı akor ilerlemesi farklı register/yayılımla
 * deterministik üretilebilsin diye. Kromatik ya da ödünç ses YASAK DEĞİLDİR;
 * `alter` ile açıkça istenir. Sessizce bozuk score üretilmez: aralık,
 * ses sayısı ya da hareket sınırı karşılanamıyorsa akorun indeksiyle hata.
 */
export const CHORD_QUALITIES = ['triad', 'seventh', 'sus2', 'sus4', 'fifth'] as const;
export type ChordQuality = (typeof CHORD_QUALITIES)[number];

export const VOICING_SPREADS = ['close', 'open'] as const;
export type VoicingSpread = (typeof VOICING_SPREADS)[number];

export interface ChordAlterationV1 {
  readonly voice: number;
  readonly semitones: number;
}

export interface ChordV1 {
  /** Bölüm başına göre ölçü (0 tabanlı). */
  readonly bar: number;
  readonly beat: number;
  readonly beats: number;
  /** Dizi derecesi (1 = kök akor). */
  readonly degree: number;
  readonly quality: ChordQuality;
  readonly inversion?: number;
  readonly alter?: readonly ChordAlterationV1[];
}

export interface VoicingV1 {
  readonly voices: number;
  readonly spread: VoicingSpread;
  readonly register: readonly [number, number];
  readonly maxMovement: number;
}

export const MAX_VOICES = 8;

/** Akor niteliğinin dizi derecesi adımları (kökten itibaren). */
const QUALITY_STEPS: Readonly<Record<ChordQuality, readonly number[]>> = {
  triad: [0, 2, 4],
  seventh: [0, 2, 4, 6],
  sus2: [0, 1, 4],
  sus4: [0, 3, 4],
  fifth: [0, 4],
};

export function validateChord(value: unknown, path: string): ChordV1 {
  const o = checkObject(value, path, [
    'bar',
    'beat',
    'beats',
    'degree',
    'quality',
    'inversion',
    'alter',
  ]);
  return {
    bar: checkNumber(o.bar, `${path}.bar`, { min: 0, max: 512, integer: true }),
    beat: checkNumber(o.beat, `${path}.beat`, { min: 0, max: 64 }),
    beats: checkNumber(o.beats, `${path}.beats`, { above: 0, max: 128 }),
    degree: checkNumber(o.degree, `${path}.degree`, { min: 1, max: 14, integer: true }),
    quality: checkChoice(o.quality, `${path}.quality`, CHORD_QUALITIES),
    ...(o.inversion === undefined
      ? {}
      : {
          inversion: checkNumber(o.inversion, `${path}.inversion`, {
            min: 0,
            max: 3,
            integer: true,
          }),
        }),
    ...(o.alter === undefined
      ? {}
      : {
          alter: checkArray(o.alter, `${path}.alter`).map((raw, i) => {
            const a = checkObject(raw, `${path}.alter[${i}]`, ['voice', 'semitones']);
            return {
              voice: checkNumber(a.voice, `${path}.alter[${i}].voice`, {
                min: 0,
                max: MAX_VOICES - 1,
                integer: true,
              }),
              semitones: checkNumber(a.semitones, `${path}.alter[${i}].semitones`, {
                min: -11,
                max: 11,
                integer: true,
              }),
            };
          }),
        }),
  };
}

export function validateVoicing(value: unknown, path: string): VoicingV1 {
  const o = checkObject(value, path, ['voices', 'spread', 'register', 'maxMovement']);
  const register = checkArray(o.register, `${path}.register`);
  if (register.length !== 2) {
    throw new AudioParamError(`${path}.register`, 'type', '[altMidi, üstMidi]', register.length);
  }
  const low = checkNumber(register[0], `${path}.register[0]`, {
    min: MIDI_MIN,
    max: MIDI_MAX,
    integer: true,
  });
  return {
    voices: checkNumber(o.voices, `${path}.voices`, { min: 1, max: MAX_VOICES, integer: true }),
    spread: checkChoice(o.spread, `${path}.spread`, VOICING_SPREADS),
    register: [
      low,
      checkNumber(register[1], `${path}.register[1]`, { min: low, max: MIDI_MAX, integer: true }),
    ],
    maxMovement: checkNumber(o.maxMovement, `${path}.maxMovement`, {
      min: 0,
      max: 48,
      integer: true,
    }),
  };
}

export interface TonalContext {
  readonly rootMidi: number;
  readonly scale: readonly number[];
}

/** Akorun ham ses yığını: dizi derecelerinden, sonra `alter`, sonra çevrim. */
function chordTones(chord: ChordV1, tonal: TonalContext, voices: number): number[] {
  const steps = QUALITY_STEPS[chord.quality];
  const base = chord.degree - 1;
  const tones: number[] = [];
  for (let i = 0; i < voices; i++) {
    const step = steps[i % steps.length] + Math.floor(i / steps.length) * tonal.scale.length;
    tones.push(degreeToMidi(tonal.rootMidi, tonal.scale, base + step));
  }
  for (const alteration of chord.alter ?? []) {
    if (alteration.voice < tones.length) tones[alteration.voice] += alteration.semitones;
  }
  const inversion = chord.inversion ?? 0;
  for (let i = 0; i < inversion && tones.length > 0; i++)
    tones.push((tones.shift() as number) + 12);
  return tones;
}

/** Sesleri register'a yerleştirir; `open` her ikinci sesi bir oktav yukarı iter. */
function placeInRegister(tones: readonly number[], voicing: VoicingV1, path: string): number[] {
  const [low, high] = voicing.register;
  const out: number[] = [];
  let floor = low;
  for (const [index, tone] of tones.entries()) {
    const gap = voicing.spread === 'open' && index > 0 ? 7 : 1;
    let value = tone;
    while (value < floor) value += 12;
    while (value - 12 >= floor) value -= 12;
    if (value > high) {
      throw new AudioParamError(
        path,
        'range',
        `${voicing.voices} ses register [${low}, ${high}] içine sığmıyor (${voicing.spread})`,
        value,
      );
    }
    out.push(value);
    floor = value + gap;
  }
  return out;
}

export interface VoicedChordV1 {
  readonly chord: ChordV1;
  readonly midis: readonly number[];
  readonly movement: number;
}

/**
 * Akoru seslendirir. Önceki akor verilirse yığın bir oktav aşağı/yukarı
 * kaydırılarak EN AZ hareket seçilir; eşitlikte pes olan kazanır (kararlı
 * tie-break). Sonuçtaki en büyük ses hareketi `maxMovement`i aşarsa hata.
 */
export function voiceChord(
  chord: ChordV1,
  tonal: TonalContext,
  voicing: VoicingV1,
  previous: readonly number[] | null,
  path: string,
): VoicedChordV1 {
  const tones = chordTones(chord, tonal, voicing.voices);
  const placed = placeInRegister(tones, voicing, path);
  const [low, high] = voicing.register;
  let best = placed;
  let bestMovement = movementOf(placed, previous);
  for (const shift of [-12, 12]) {
    const shifted = placed.map((v) => v + shift);
    if (shifted.some((v) => v < low || v > high)) continue;
    const movement = movementOf(shifted, previous);
    if (movement < bestMovement || (movement === bestMovement && shift < 0)) {
      best = shifted;
      bestMovement = movement;
    }
  }
  if (previous && bestMovement > voicing.maxMovement) {
    throw new AudioParamError(
      path,
      'combination',
      `ses hareketi ${bestMovement} yarım ton, sınır ${voicing.maxMovement}`,
      chord.degree,
    );
  }
  return { chord, midis: best, movement: previous ? bestMovement : 0 };
}

function movementOf(midis: readonly number[], previous: readonly number[] | null): number {
  if (!previous) return 0;
  let worst = 0;
  for (let i = 0; i < Math.min(midis.length, previous.length); i++) {
    worst = Math.max(worst, Math.abs(midis[i] - previous[i]));
  }
  return worst;
}
