import { AudioParamError } from '../guard/errors';
import { checkArray, checkChoice, checkNumber, checkObject } from '../guard/read';
import { midiToHz, noteToMidi, pitchClass } from './tonal';

/**
 * Perde çözücü: MIDI tuşu (+ isteğe bağlı cent sapması) → frekans. Ayar
 * yazılmazsa 12-TET (A4 = 440 Hz) yolu `midiToHz` ile BİREBİR aynıdır;
 * özel ayar yalnız bu tek işlevi değiştirir, score/armoni/analiz tuşlarla
 * çalışmaya devam eder.
 *
 * - `equal`: 12 eşit bölüm, başka referans (ör. A4 = 432 Hz).
 * - `cents`: kökten itibaren 12 kromatik basamağın cent değeri (ilki 0);
 *   kök notası 12-TET frekansında sabitlenir, diğerleri ondan sapar.
 * - `ratios`: aynı yapı, basamaklar tam oran `[pay, payda]` (saf ses aralığı).
 */
export const TUNING_KINDS = ['equal', 'cents', 'ratios'] as const;

export type TuningV1 =
  | { readonly kind: 'equal'; readonly referenceHz: number }
  | { readonly kind: 'cents'; readonly root: string; readonly cents: readonly number[] }
  | {
      readonly kind: 'ratios';
      readonly root: string;
      readonly ratios: readonly (readonly [number, number])[];
    };

const PITCH_CLASS_NOTE = /^([A-G][#b]?)$/;

function checkRoot(value: unknown, path: string): string {
  if (typeof value !== 'string' || !PITCH_CLASS_NOTE.test(value)) {
    throw new AudioParamError(path, 'type', 'perde sınıfı adı (ör. C, F#, Bb)', value);
  }
  return value;
}

function steps(value: unknown, path: string): readonly unknown[] {
  const list = checkArray(value, path);
  if (list.length !== 12)
    throw new AudioParamError(path, 'range', '12 kromatik basamak', list.length);
  return list;
}

export function validateTuning(value: unknown, path = 'tuning'): TuningV1 {
  const head = checkObject(value, path, ['kind', 'referenceHz', 'root', 'cents', 'ratios']);
  const kind = checkChoice(head.kind, `${path}.kind`, TUNING_KINDS);
  if (kind === 'equal') {
    const o = checkObject(value, path, ['kind', 'referenceHz']);
    return {
      kind,
      referenceHz: checkNumber(o.referenceHz, `${path}.referenceHz`, { min: 380, max: 480 }),
    };
  }
  if (kind === 'cents') {
    const o = checkObject(value, path, ['kind', 'root', 'cents']);
    let previous = -Infinity;
    const cents = steps(o.cents, `${path}.cents`).map((c, i) => {
      const value = checkNumber(c, `${path}.cents[${i}]`, { min: 0, max: 1199 });
      if (i === 0 && value !== 0) {
        throw new AudioParamError(`${path}.cents[0]`, 'range', 'kök basamağı 0 cent olmalı', value);
      }
      if (value <= previous) {
        throw new AudioParamError(
          `${path}.cents[${i}]`,
          'combination',
          'basamaklar artan olmalı',
          value,
        );
      }
      previous = value;
      return value;
    });
    return { kind, root: checkRoot(o.root, `${path}.root`), cents };
  }
  const o = checkObject(value, path, ['kind', 'root', 'ratios']);
  let previous = 0;
  const ratios = steps(o.ratios, `${path}.ratios`).map((raw, i) => {
    const pair = checkArray(raw, `${path}.ratios[${i}]`);
    if (pair.length !== 2) {
      throw new AudioParamError(`${path}.ratios[${i}]`, 'type', '[pay, payda]', pair.length);
    }
    const p = checkNumber(pair[0], `${path}.ratios[${i}][0]`, { min: 1, max: 4096, integer: true });
    const q = checkNumber(pair[1], `${path}.ratios[${i}][1]`, { min: 1, max: 4096, integer: true });
    const ratio = p / q;
    if ((i === 0 && ratio !== 1) || ratio <= previous || ratio >= 2) {
      throw new AudioParamError(
        `${path}.ratios[${i}]`,
        'combination',
        'ilk oran 1/1, oranlar artan ve 2/1 altında olmalı',
        pair,
      );
    }
    previous = ratio;
    return [p, q] as const;
  });
  return { kind, root: checkRoot(o.root, `${path}.root`), ratios };
}

/** Kök perde sınıfının `midi` ile aynı ya da altındaki en yakın tuşu. */
function rootBelow(midi: number, rootPc: number): number {
  return midi - ((((pitchClass(midi) - rootPc) % 12) + 12) % 12);
}

/** Tuş (+ cent) → Hz. Ayar ve cent yoksa `midiToHz(midi)` ile aynı sonuç. */
export function frequencyOf(midi: number, cents: number | undefined, tuning?: TuningV1): number {
  let hz: number;
  if (!tuning) hz = midiToHz(midi);
  else if (tuning.kind === 'equal') hz = tuning.referenceHz * Math.pow(2, (midi - 69) / 12);
  else {
    const root = rootBelow(midi, pitchClass(noteToMidi(`${tuning.root}4`)));
    const step = midi - root;
    const ratio =
      tuning.kind === 'cents'
        ? Math.pow(2, tuning.cents[step] / 1200)
        : tuning.ratios[step][0] / tuning.ratios[step][1];
    hz = midiToHz(root) * ratio;
  }
  return cents === undefined || cents === 0 ? hz : hz * Math.pow(2, cents / 1200);
}

const MICROTONAL = /^([A-G][#b]?-?\d)([+-]\d{1,3}(?:\.\d+)?)c$/;

/**
 * Nota adı + isteğe bağlı cent sapması: `C4`, `Eb4-14c`, `A3+50c`. Sapma
 * ±100 cent'le sınırlıdır; daha büyüğü başka bir tuştur.
 */
export function parseNote(note: string, path: string): { midi: number; cents?: number } {
  const match = MICROTONAL.exec(note);
  if (!match) return { midi: noteToMidi(note, path) };
  const cents = Number(match[2]);
  if (Math.abs(cents) > 100) {
    throw new AudioParamError(path, 'range', 'cent sapması ±100 içinde olmalı', note);
  }
  return { midi: noteToMidi(match[1], path), ...(cents === 0 ? {} : { cents }) };
}
