import { AudioParamError } from '../guard/errors';
import { checkArray, checkChoice, checkNumber, checkObject } from '../guard/read';
import { validateChord, validateVoicing } from './harmony';
import { presetOf } from './instruments';
import { validateTransform } from './motif';
import {
  MAX_BARS,
  MAX_EVENTS_PER_PART,
  type LaneV1,
  type PartV1,
  type RhythmStepV1,
  type SectionV1,
} from './programTypes';
import { noteToMidi } from './tonal';
import {
  ARTICULATIONS,
  METER_UNITS,
  MUSIC_KEY,
  SECTION_ROLES,
  checkPattern,
  checkText,
} from './terms';

/**
 * `MusicProgramV1`in şerit, ritim, part ve bölüm doğrulayıcıları. Her biri
 * yalnız kendi alanını okur; kimlik bütünlüğü (tanımlı stem/groove/motif/
 * şerit) çağıranın verdiği listelere karşı sınanır.
 */
export function uniqueIds(ids: readonly string[], path: string): void {
  const seen = new Set<string>();
  for (const [i, id] of ids.entries()) {
    if (seen.has(id))
      throw new AudioParamError(`${path}[${i}]`, 'combination', 'kimlik tekrar etti', id);
    seen.add(id);
  }
}

export function checkMeter(value: unknown, path: string): [number, number] {
  const meter = checkArray(value, path);
  if (meter.length !== 2) throw new AudioParamError(path, 'type', '[vuruş, birim]', meter.length);
  const unit = checkNumber(meter[1], `${path}[1]`, { min: 2, max: 16, integer: true });
  if (!(METER_UNITS as readonly number[]).includes(unit)) {
    throw new AudioParamError(`${path}[1]`, 'range', `${METER_UNITS.join(', ')} olmalı`, unit);
  }
  return [checkNumber(meter[0], `${path}[0]`, { min: 1, max: 32, integer: true }), unit];
}

export function checkLane(
  value: unknown,
  path: string,
  stems: readonly string[],
  grooves: readonly string[],
): LaneV1 {
  const o = checkObject(value, path, [
    'id',
    'instrument',
    'stem',
    'pan',
    'gain',
    'groove',
    'articulation',
    'octave',
  ]);
  const instrument = checkText(o.instrument, `${path}.instrument`, 80);
  presetOf(instrument, `${path}.instrument`);
  const stem = checkPattern(o.stem, `${path}.stem`, MUSIC_KEY);
  if (!stems.includes(stem)) {
    throw new AudioParamError(`${path}.stem`, 'unknown-id', 'tanımlı bir stem olmalı', stem);
  }
  const groove =
    o.groove === undefined ? undefined : checkPattern(o.groove, `${path}.groove`, MUSIC_KEY);
  if (groove !== undefined && !grooves.includes(groove)) {
    throw new AudioParamError(`${path}.groove`, 'unknown-id', 'tanımlı bir groove olmalı', groove);
  }
  const articulation =
    o.articulation === undefined
      ? undefined
      : checkChoice(o.articulation, `${path}.articulation`, ARTICULATIONS);
  return {
    id: checkPattern(o.id, `${path}.id`, MUSIC_KEY),
    instrument,
    stem,
    ...(o.pan === undefined ? {} : { pan: checkNumber(o.pan, `${path}.pan`, { min: -1, max: 1 }) }),
    ...(o.gain === undefined
      ? {}
      : { gain: checkNumber(o.gain, `${path}.gain`, { min: 0, max: 4 }) }),
    ...(groove === undefined ? {} : { groove }),
    ...(articulation === undefined ? {} : { articulation }),
    ...(o.octave === undefined
      ? {}
      : { octave: checkNumber(o.octave, `${path}.octave`, { min: -3, max: 3, integer: true }) }),
  };
}

function checkRhythm(value: unknown, path: string): RhythmStepV1[] {
  const steps = checkArray(value, path);
  if (steps.length === 0 || steps.length > MAX_EVENTS_PER_PART) {
    throw new AudioParamError(path, 'range', `1–${MAX_EVENTS_PER_PART} adım`, steps.length);
  }
  return steps.map((raw, i) => {
    const s = checkObject(raw, `${path}[${i}]`, ['bar', 'beat', 'beats', 'gain']);
    return {
      bar: checkNumber(s.bar, `${path}[${i}].bar`, { min: 0, max: MAX_BARS, integer: true }),
      beat: checkNumber(s.beat, `${path}[${i}].beat`, { min: 0, max: 64 }),
      beats: checkNumber(s.beats, `${path}[${i}].beats`, { above: 0, max: 128 }),
      ...(s.gain === undefined
        ? {}
        : { gain: checkNumber(s.gain, `${path}[${i}].gain`, { above: 0, max: 4 }) }),
    };
  });
}

function checkPart(
  value: unknown,
  path: string,
  lanes: readonly string[],
  motifs: readonly string[],
): PartV1 {
  const head = checkObject(value, path, [
    'lane',
    'source',
    'rhythm',
    'voices',
    'motif',
    'transforms',
    'placements',
    'beats',
    'notes',
  ]);
  const lane = checkPattern(head.lane, `${path}.lane`, MUSIC_KEY);
  if (!lanes.includes(lane)) {
    throw new AudioParamError(`${path}.lane`, 'unknown-id', 'tanımlı bir şerit olmalı', lane);
  }
  const source = checkChoice(head.source, `${path}.source`, ['chord', 'motif', 'notes'] as const);
  if (source === 'chord') {
    const o = checkObject(value, path, ['lane', 'source', 'rhythm', 'voices']);
    return {
      lane,
      source,
      rhythm: checkRhythm(o.rhythm, `${path}.rhythm`),
      ...(o.voices === undefined
        ? {}
        : {
            voices: checkArray(o.voices, `${path}.voices`).map((v, i) =>
              checkNumber(v, `${path}.voices[${i}]`, { min: 0, max: 7, integer: true }),
            ),
          }),
    };
  }
  if (source === 'motif') {
    const o = checkObject(value, path, [
      'lane',
      'source',
      'motif',
      'transforms',
      'placements',
      'beats',
    ]);
    const motif = checkPattern(o.motif, `${path}.motif`, MUSIC_KEY);
    if (!motifs.includes(motif)) {
      throw new AudioParamError(`${path}.motif`, 'unknown-id', 'tanımlı bir motif olmalı', motif);
    }
    const placements = checkArray(o.placements, `${path}.placements`);
    if (placements.length === 0 || placements.length > 64) {
      throw new AudioParamError(`${path}.placements`, 'range', '1–64 yerleşim', placements.length);
    }
    return {
      lane,
      source,
      motif,
      transforms: checkArray(o.transforms, `${path}.transforms`).map((t, i) =>
        validateTransform(t, `${path}.transforms[${i}]`),
      ),
      placements: placements.map((raw, i) => {
        const p = checkObject(raw, `${path}.placements[${i}]`, ['bar', 'beat', 'octave']);
        return {
          bar: checkNumber(p.bar, `${path}.placements[${i}].bar`, {
            min: 0,
            max: MAX_BARS,
            integer: true,
          }),
          beat: checkNumber(p.beat, `${path}.placements[${i}].beat`, { min: 0, max: 64 }),
          ...(p.octave === undefined
            ? {}
            : {
                octave: checkNumber(p.octave, `${path}.placements[${i}].octave`, {
                  min: -3,
                  max: 3,
                  integer: true,
                }),
              }),
        };
      }),
      beats: checkNumber(o.beats, `${path}.beats`, { above: 0, max: 16 }),
    };
  }
  const o = checkObject(value, path, ['lane', 'source', 'notes']);
  const notes = checkArray(o.notes, `${path}.notes`);
  if (notes.length === 0 || notes.length > MAX_EVENTS_PER_PART) {
    throw new AudioParamError(
      `${path}.notes`,
      'range',
      `1–${MAX_EVENTS_PER_PART} nota`,
      notes.length,
    );
  }
  return {
    lane,
    source,
    notes: notes.map((raw, i) => {
      const n = checkObject(raw, `${path}.notes[${i}]`, ['bar', 'beat', 'beats', 'note', 'gain']);
      const note = checkText(n.note, `${path}.notes[${i}].note`, 8);
      noteToMidi(note, `${path}.notes[${i}].note`);
      return {
        bar: checkNumber(n.bar, `${path}.notes[${i}].bar`, {
          min: 0,
          max: MAX_BARS,
          integer: true,
        }),
        beat: checkNumber(n.beat, `${path}.notes[${i}].beat`, { min: 0, max: 64 }),
        beats: checkNumber(n.beats, `${path}.notes[${i}].beats`, { above: 0, max: 128 }),
        note,
        ...(n.gain === undefined
          ? {}
          : { gain: checkNumber(n.gain, `${path}.notes[${i}].gain`, { above: 0, max: 4 }) }),
      };
    }),
  };
}

export function checkSection(
  value: unknown,
  path: string,
  context: { lanes: readonly string[]; motifs: readonly string[]; bars: number },
): SectionV1 {
  const o = checkObject(value, path, [
    'id',
    'role',
    'bars',
    'targetEnergy',
    'lanes',
    'harmony',
    'parts',
  ]);
  const range = checkArray(o.bars, `${path}.bars`);
  if (range.length !== 2)
    throw new AudioParamError(`${path}.bars`, 'type', '[başlangıç, bitiş)', range.length);
  const from = checkNumber(range[0], `${path}.bars[0]`, {
    min: 0,
    max: context.bars - 1,
    integer: true,
  });
  const to = checkNumber(range[1], `${path}.bars[1]`, {
    min: from + 1,
    max: context.bars,
    integer: true,
  });
  const lanes = checkArray(o.lanes, `${path}.lanes`).map((l, i) => {
    const id = checkPattern(l, `${path}.lanes[${i}]`, MUSIC_KEY);
    if (!context.lanes.includes(id)) {
      throw new AudioParamError(
        `${path}.lanes[${i}]`,
        'unknown-id',
        'tanımlı bir şerit olmalı',
        id,
      );
    }
    return id;
  });
  if (lanes.length === 0)
    throw new AudioParamError(`${path}.lanes`, 'range', 'en az bir aktif şerit', 0);
  const parts = checkArray(o.parts, `${path}.parts`).map((p, i) =>
    checkPart(p, `${path}.parts[${i}]`, lanes, context.motifs),
  );
  const harmony =
    o.harmony === undefined
      ? undefined
      : (() => {
          const h = checkObject(o.harmony, `${path}.harmony`, ['voicing', 'chords']);
          const chords = checkArray(h.chords, `${path}.harmony.chords`);
          if (chords.length === 0) {
            throw new AudioParamError(`${path}.harmony.chords`, 'range', 'en az bir akor', 0);
          }
          return {
            voicing: validateVoicing(h.voicing, `${path}.harmony.voicing`),
            chords: chords.map((c, i) => validateChord(c, `${path}.harmony.chords[${i}]`)),
          };
        })();
  if (!harmony && parts.some((p) => p.source === 'chord')) {
    throw new AudioParamError(
      `${path}.harmony`,
      'required',
      'chord kaynaklı part armoni ister',
      undefined,
    );
  }
  return {
    id: checkPattern(o.id, `${path}.id`, MUSIC_KEY),
    role: checkChoice(o.role, `${path}.role`, SECTION_ROLES),
    bars: [from, to],
    targetEnergy: checkNumber(o.targetEnergy, `${path}.targetEnergy`, { min: 0, max: 1 }),
    lanes,
    ...(harmony ? { harmony } : {}),
    parts,
  };
}
