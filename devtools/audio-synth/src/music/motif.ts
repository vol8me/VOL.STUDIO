import { AudioParamError } from '../guard/errors';
import { checkArray, checkChoice, checkNumber, checkObject } from '../guard/read';
import { hashCanonical } from '../protocol/canonical';
import { checkPattern, MUSIC_KEY } from './terms';

/**
 * Motif birinci sınıf malzemedir: dönüşümleri veri olarak yazılır ve her
 * üretilen nota hangi motiften hangi zincirle çıktığını taşır. Sekiz
 * dönüşüm, geleneksel geliştirme işlemlerinin kapalı kümesidir; yeni bir
 * işlem eklemek şema değişikliğidir, serbest kod değil.
 */
export const MOTIF_TRANSFORMS = [
  'transpose',
  'register-shift',
  'rotate',
  'fragment',
  'sequence',
  'augment',
  'diminish',
  'invert',
] as const;
export type MotifTransformOp = (typeof MOTIF_TRANSFORMS)[number];

export interface MotifNoteV1 {
  /** Dizi derecesi (0 = kök); oktav taşması serbesttir. */
  readonly degree: number;
  /** Motif başına göre vuruş. */
  readonly beat: number;
  readonly beats: number;
  readonly gain?: number;
}

export interface MotifV1 {
  readonly id: string;
  readonly notes: readonly MotifNoteV1[];
}

export type MotifTransformV1 =
  | { readonly op: 'transpose'; readonly degrees: number }
  | { readonly op: 'register-shift'; readonly octaves: number }
  | { readonly op: 'rotate'; readonly steps: number }
  | { readonly op: 'fragment'; readonly from: number; readonly count: number }
  | { readonly op: 'sequence'; readonly steps: number; readonly times: number }
  | { readonly op: 'augment'; readonly factor: number }
  | { readonly op: 'diminish'; readonly factor: number }
  | { readonly op: 'invert'; readonly axisDegree: number };

export const MAX_MOTIF_NOTES = 64;
const MAX_DEGREE = 48;
const MAX_BEATS = 128;

export function validateMotif(value: unknown, path: string): MotifV1 {
  const o = checkObject(value, path, ['id', 'notes']);
  const notes = checkArray(o.notes, `${path}.notes`);
  if (notes.length === 0 || notes.length > MAX_MOTIF_NOTES) {
    throw new AudioParamError(`${path}.notes`, 'range', `1–${MAX_MOTIF_NOTES} nota`, notes.length);
  }
  return {
    id: checkPattern(o.id, `${path}.id`, MUSIC_KEY),
    notes: notes.map((raw, i) => {
      const n = checkObject(raw, `${path}.notes[${i}]`, ['degree', 'beat', 'beats', 'gain']);
      return {
        degree: checkNumber(n.degree, `${path}.notes[${i}].degree`, {
          min: -MAX_DEGREE,
          max: MAX_DEGREE,
          integer: true,
        }),
        beat: checkNumber(n.beat, `${path}.notes[${i}].beat`, { min: 0, max: MAX_BEATS }),
        beats: checkNumber(n.beats, `${path}.notes[${i}].beats`, { above: 0, max: MAX_BEATS }),
        ...(n.gain === undefined
          ? {}
          : { gain: checkNumber(n.gain, `${path}.notes[${i}].gain`, { above: 0, max: 4 }) }),
      };
    }),
  };
}

export function validateTransform(value: unknown, path: string): MotifTransformV1 {
  const head = checkObject(value, path, [
    'op',
    'degrees',
    'octaves',
    'steps',
    'from',
    'count',
    'times',
    'factor',
    'axisDegree',
  ]);
  const op = checkChoice(head.op, `${path}.op`, MOTIF_TRANSFORMS);
  const read = (key: string, rule: Parameters<typeof checkNumber>[2]) =>
    checkNumber(head[key], `${path}.${key}`, rule);
  switch (op) {
    case 'transpose':
      return { op, degrees: read('degrees', { min: -MAX_DEGREE, max: MAX_DEGREE, integer: true }) };
    case 'register-shift':
      return { op, octaves: read('octaves', { min: -4, max: 4, integer: true }) };
    case 'rotate':
      return {
        op,
        steps: read('steps', { min: -MAX_MOTIF_NOTES, max: MAX_MOTIF_NOTES, integer: true }),
      };
    case 'fragment':
      return {
        op,
        from: read('from', { min: 0, max: MAX_MOTIF_NOTES - 1, integer: true }),
        count: read('count', { min: 1, max: MAX_MOTIF_NOTES, integer: true }),
      };
    case 'sequence':
      return {
        op,
        steps: read('steps', { min: -MAX_DEGREE, max: MAX_DEGREE, integer: true }),
        times: read('times', { min: 2, max: 8, integer: true }),
      };
    case 'augment':
    case 'diminish':
      return { op, factor: read('factor', { above: 1, max: 4 }) };
    case 'invert':
      return {
        op,
        axisDegree: read('axisDegree', { min: -MAX_DEGREE, max: MAX_DEGREE, integer: true }),
      };
  }
}

function motifLength(notes: readonly MotifNoteV1[]): number {
  return notes.reduce((end, n) => Math.max(end, n.beat + n.beats), 0);
}

function applyOne(
  notes: readonly MotifNoteV1[],
  transform: MotifTransformV1,
  scaleLength: number,
): MotifNoteV1[] {
  switch (transform.op) {
    case 'transpose':
      return notes.map((n) => ({ ...n, degree: n.degree + transform.degrees }));
    case 'register-shift':
      return notes.map((n) => ({ ...n, degree: n.degree + transform.octaves * scaleLength }));
    case 'rotate': {
      const size = notes.length;
      const shift = ((transform.steps % size) + size) % size;
      return notes.map((n, i) => ({ ...n, degree: notes[(i + shift) % size].degree }));
    }
    case 'fragment': {
      const slice = notes.slice(transform.from, transform.from + transform.count);
      if (slice.length === 0) {
        throw new AudioParamError(
          'fragment',
          'range',
          'parça en az bir nota içermeli',
          transform.from,
        );
      }
      const origin = slice[0].beat;
      return slice.map((n) => ({ ...n, beat: n.beat - origin }));
    }
    case 'sequence': {
      const span = motifLength(notes);
      const out: MotifNoteV1[] = [];
      for (let step = 0; step < transform.times; step++) {
        for (const n of notes) {
          out.push({ ...n, degree: n.degree + step * transform.steps, beat: n.beat + step * span });
        }
      }
      return out;
    }
    case 'augment':
      return notes.map((n) => ({
        ...n,
        beat: n.beat * transform.factor,
        beats: n.beats * transform.factor,
      }));
    case 'diminish':
      return notes.map((n) => ({
        ...n,
        beat: n.beat / transform.factor,
        beats: n.beats / transform.factor,
      }));
    case 'invert':
      return notes.map((n) => ({ ...n, degree: 2 * transform.axisDegree - n.degree }));
  }
}

export interface MotifInstanceV1 {
  readonly motif: string;
  readonly chain: readonly MotifTransformV1[];
  /** Kaynağı + zinciri özetleyen kararlı kimlik; analiz motif tekrarını bununla sayar. */
  readonly variationId: string;
  readonly notes: readonly MotifNoteV1[];
}

/**
 * Zinciri sırayla uygular. Sıra anlamlıdır: önce parçalama sonra dizileme,
 * parçanın dizilenmesi demektir; tersi bütünün dizilenip kırpılmasıdır.
 */
export function applyTransforms(
  motif: MotifV1,
  chain: readonly MotifTransformV1[],
  scaleLength: number,
): MotifInstanceV1 {
  let notes: readonly MotifNoteV1[] = motif.notes;
  for (const transform of chain) notes = applyOne(notes, transform, scaleLength);
  if (notes.length > MAX_MOTIF_NOTES) {
    throw new AudioParamError('motif', 'range', `en çok ${MAX_MOTIF_NOTES} nota`, notes.length);
  }
  const identity = hashCanonical({ motif: motif.id, chain, scaleLength });
  return {
    motif: motif.id,
    chain,
    variationId: `m-${identity.slice('sha256:'.length, 'sha256:'.length + 12)}`,
    notes: [...notes].sort((a, b) => a.beat - b.beat || a.degree - b.degree),
  };
}

export function describeChain(chain: readonly MotifTransformV1[]): string {
  return chain.length === 0 ? 'kaynak' : chain.map((t) => t.op).join(' → ');
}
