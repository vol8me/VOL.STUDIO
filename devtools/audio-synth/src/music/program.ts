import { AudioParamError } from '../guard/errors';
import {
  checkArray,
  checkChoice,
  checkNumber,
  checkObject,
  checkSampleRate,
  type ParamObject,
} from '../guard/read';
import { hashCanonical, type Sha256 } from '../protocol/canonical';
import { validateGroove, type GrooveProfileV1 } from './groove';
import { resolveMusicMix, type MusicMixV1 } from './mix';
import { validateChord, validateVoicing, type ChordV1, type VoicingV1 } from './harmony';
import { INSTRUMENT_PREFIX, instrumentProfile, presetOf } from './instruments';
import { validateMotif, validateTransform, type MotifTransformV1, type MotifV1 } from './motif';
import { isScaleName, noteToMidi, scaleNames } from './tonal';
import {
  ARTICULATIONS,
  METER_UNITS,
  MUSIC_ID,
  MUSIC_KEY,
  PLAYBACK_MODES,
  SECTION_ROLES,
  checkPattern,
  checkText,
  type Articulation,
  type MusicPlayback,
  type SectionRole,
} from './terms';
import { validateOverrides, type ThemeOverrideV1 } from './themeBook';
import { validateTransition, type MusicTransitionV1 } from './transitions';

/**
 * Sembolik score/düzenlemenin kanonik, JSON-serileştirilebilir kaynağı.
 * Beste ad-hoc TypeScript döngülerinde kaybolmaz: tempo, ölçü, tonal sistem,
 * bölümler, armoni, motifler, şeritler, stem'ler, otomasyon ve geçiş
 * işaretleri burada yaşar; belge ses render edilmeden doğrulanabilir.
 *
 * Tek tempo, tek ölçü: hem `Timeline` hem çalışma zamanı zamanlayıcısı tek
 * ızgara varsayar. Tempo/ölçü değişimi sessizce yanlış hizalanmaktansa açık
 * bir sınırlama olarak reddedilir (bkz. `music-single-tempo`).
 */
export const MUSIC_PROGRAM_SCHEMA = 'MusicProgramV1';
export const MUSIC_PROGRAM_VERSION = 1;

export const MAX_BARS = 512;
export const MAX_LANES = 16;
export const MAX_SECTIONS = 32;
export const MAX_EVENTS_PER_PART = 512;

export interface LaneV1 {
  readonly id: string;
  readonly instrument: string;
  readonly stem: string;
  readonly pan?: number;
  readonly gain?: number;
  readonly groove?: string;
  readonly articulation?: Articulation;
  /** Dizi/akor kaynaklı perdeleri oktav kaydırır; açık nota adlarına dokunmaz. */
  readonly octave?: number;
}

export interface StemV1 {
  readonly id: string;
  readonly title?: string;
}

export interface RhythmStepV1 {
  readonly bar: number;
  readonly beat: number;
  readonly beats: number;
  readonly gain?: number;
}

export interface MotifPlacementV1 {
  readonly bar: number;
  readonly beat: number;
  readonly octave?: number;
}

export interface ExplicitNoteV1 {
  readonly bar: number;
  readonly beat: number;
  readonly beats: number;
  readonly note: string;
  readonly gain?: number;
}

export type PartV1 =
  | {
      readonly lane: string;
      readonly source: 'chord';
      readonly rhythm: readonly RhythmStepV1[];
      readonly voices?: readonly number[];
    }
  | {
      readonly lane: string;
      readonly source: 'motif';
      readonly motif: string;
      readonly transforms: readonly MotifTransformV1[];
      readonly placements: readonly MotifPlacementV1[];
      readonly beats: number;
    }
  | { readonly lane: string; readonly source: 'notes'; readonly notes: readonly ExplicitNoteV1[] };

export interface SectionV1 {
  readonly id: string;
  readonly role: SectionRole;
  /** `[başlangıç, bitiş)` — 0 tabanlı ölçü aralığı. */
  readonly bars: readonly [number, number];
  readonly targetEnergy: number;
  readonly lanes: readonly string[];
  readonly harmony?: { readonly voicing: VoicingV1; readonly chords: readonly ChordV1[] };
  readonly parts: readonly PartV1[];
}

export interface AutomationV1 {
  readonly lane: string;
  /** `[ölçü, dB]` noktaları; aralar doğrusal. */
  readonly points: readonly (readonly [number, number])[];
}

export const MARKER_KINDS = ['loop-start', 'loop-end', 'transition-point'] as const;
export type MarkerKind = (typeof MARKER_KINDS)[number];

export interface MarkerV1 {
  readonly bar: number;
  readonly kind: MarkerKind;
}

export interface MusicDeliveryV1 {
  readonly package: string;
  /** Paket-göreli dizin; stem asset'i `<assetDir>/<stem>.ogg`. */
  readonly assetDir: string;
  readonly runtimeKey?: string;
}

export interface AdaptiveStemV1 {
  readonly stem: string;
  readonly gainMap: {
    readonly intensity: readonly { readonly threshold: number; readonly gain: number }[];
  };
}

export interface MusicProgramV1 {
  readonly schema: typeof MUSIC_PROGRAM_SCHEMA;
  readonly musicId: string;
  readonly version: number;
  readonly title: string;
  readonly description: string;
  readonly seed: number;
  readonly playback: MusicPlayback;
  readonly tempo: { readonly bpm: number };
  readonly meter: readonly [number, number];
  readonly tonal: { readonly system: string; readonly root: string };
  readonly bars: number;
  readonly sampleRate: number;
  readonly themeBook?: { readonly id: string; readonly hash: Sha256 };
  readonly themeOverrides?: readonly ThemeOverrideV1[];
  readonly grooves: readonly GrooveProfileV1[];
  readonly motifs: readonly MotifV1[];
  readonly lanes: readonly LaneV1[];
  readonly stems: readonly StemV1[];
  readonly sections: readonly SectionV1[];
  readonly delivery: MusicDeliveryV1;
  readonly automation?: readonly AutomationV1[];
  readonly markers?: readonly MarkerV1[];
  readonly transitions?: readonly MusicTransitionV1[];
  readonly adaptive?: {
    readonly states: readonly { readonly id: string; readonly intensity: number }[];
    readonly stems: readonly AdaptiveStemV1[];
  };
  readonly mastering?: { readonly integratedLufs: number };
  /** Şerit → bus → send/return grafiği (akustik SoundGraph ile aynı çözücü; stem paritesi kurallı). */
  readonly mix?: MusicMixV1;
  /** Program bir arama adayından türediyse onun kimliği (bilgi; program bağlayıcıdır). */
  readonly provenance?: {
    readonly searchId: string;
    readonly candidateId: string;
    readonly reportHash: Sha256;
  };
}

const KEYS = [
  'schema',
  'musicId',
  'version',
  'title',
  'description',
  'seed',
  'playback',
  'tempo',
  'meter',
  'tonal',
  'bars',
  'sampleRate',
  'themeBook',
  'themeOverrides',
  'grooves',
  'motifs',
  'lanes',
  'stems',
  'sections',
  'delivery',
  'automation',
  'markers',
  'transitions',
  'adaptive',
  'mastering',
  'provenance',
  'mix',
];

function checkMix(
  value: unknown,
  lanes: readonly LaneV1[],
  playback: MusicPlayback,
  rate: unknown,
) {
  const sampleRate = rate === undefined ? 44100 : checkSampleRate(rate, 'sampleRate');
  resolveMusicMix(value, 'mix', lanes, playback, sampleRate);
  return value as MusicMixV1;
}

function uniqueIds(ids: readonly string[], path: string): void {
  const seen = new Set<string>();
  for (const [i, id] of ids.entries()) {
    if (seen.has(id))
      throw new AudioParamError(`${path}[${i}]`, 'combination', 'kimlik tekrar etti', id);
    seen.add(id);
  }
}

function checkMeter(value: unknown, path: string): [number, number] {
  const meter = checkArray(value, path);
  if (meter.length !== 2) throw new AudioParamError(path, 'type', '[vuruş, birim]', meter.length);
  const unit = checkNumber(meter[1], `${path}[1]`, { min: 2, max: 16, integer: true });
  if (!(METER_UNITS as readonly number[]).includes(unit)) {
    throw new AudioParamError(`${path}[1]`, 'range', `${METER_UNITS.join(', ')} olmalı`, unit);
  }
  return [checkNumber(meter[0], `${path}[0]`, { min: 1, max: 32, integer: true }), unit];
}

function checkLane(
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

function checkSection(
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

function checkAdaptive(value: unknown, path: string, stems: readonly string[]) {
  const o = checkObject(value, path, ['states', 'stems']);
  const states = checkArray(o.states, `${path}.states`).map((raw, i) => {
    const s = checkObject(raw, `${path}.states[${i}]`, ['id', 'intensity']);
    return {
      id: checkPattern(s.id, `${path}.states[${i}].id`, MUSIC_KEY),
      intensity: checkNumber(s.intensity, `${path}.states[${i}].intensity`, { min: 0, max: 1 }),
    };
  });
  if (states.length < 2)
    throw new AudioParamError(`${path}.states`, 'range', 'en az iki state', states.length);
  const mapped = checkArray(o.stems, `${path}.stems`).map((raw, i): AdaptiveStemV1 => {
    const s = checkObject(raw, `${path}.stems[${i}]`, ['stem', 'gainMap']);
    const stem = checkPattern(s.stem, `${path}.stems[${i}].stem`, MUSIC_KEY);
    if (!stems.includes(stem)) {
      throw new AudioParamError(
        `${path}.stems[${i}].stem`,
        'unknown-id',
        'tanımlı bir stem olmalı',
        stem,
      );
    }
    const map = checkObject(s.gainMap, `${path}.stems[${i}].gainMap`, ['intensity']);
    const points = checkArray(map.intensity, `${path}.stems[${i}].gainMap.intensity`);
    if (points.length < 2) {
      throw new AudioParamError(
        `${path}.stems[${i}].gainMap.intensity`,
        'range',
        'en az iki eşik',
        points.length,
      );
    }
    let previous = -1;
    return {
      stem,
      gainMap: {
        intensity: points.map((raw2, j) => {
          const p = checkObject(raw2, `${path}.stems[${i}].gainMap.intensity[${j}]`, [
            'threshold',
            'gain',
          ]);
          const threshold = checkNumber(
            p.threshold,
            `${path}.stems[${i}].gainMap.intensity[${j}].threshold`,
            {
              min: 0,
              max: 1,
            },
          );
          if (threshold <= previous) {
            throw new AudioParamError(
              `${path}.stems[${i}].gainMap.intensity[${j}].threshold`,
              'combination',
              'eşikler artan olmalı',
              threshold,
            );
          }
          previous = threshold;
          return {
            threshold,
            gain: checkNumber(p.gain, `${path}.stems[${i}].gainMap.intensity[${j}].gain`, {
              min: 0,
              max: 2,
            }),
          };
        }),
      },
    };
  });
  const missing = stems.filter((stem) => !mapped.some((m) => m.stem === stem));
  if (missing.length > 0) {
    throw new AudioParamError(
      `${path}.stems`,
      'required',
      'her stem bir gain haritası ister',
      missing.join(', '),
    );
  }
  return { states, stems: mapped };
}

/** Şemayı, kimlik bütünlüğünü ve enstrüman sözleşmesini doğrular; render ETMEZ. */
export function validateMusicProgram(value: unknown): MusicProgramV1 {
  const o = checkObject(value, '', KEYS);
  if (o.schema !== MUSIC_PROGRAM_SCHEMA) {
    throw new AudioParamError('schema', 'type', MUSIC_PROGRAM_SCHEMA, o.schema);
  }
  const system = checkText(
    checkObject(o.tonal, 'tonal', ['system', 'root']).system,
    'tonal.system',
    40,
  );
  if (!isScaleName(system)) {
    throw new AudioParamError(
      'tonal.system',
      'unknown-id',
      `bilinen dizi: ${scaleNames().join(', ')}`,
      system,
    );
  }
  const root = checkText((o.tonal as ParamObject).root, 'tonal.root', 8);
  noteToMidi(root, 'tonal.root');
  const bars = checkNumber(o.bars, 'bars', { min: 1, max: MAX_BARS, integer: true });
  const grooves = checkArray(o.grooves, 'grooves').map((g, i) =>
    validateGroove(g, `grooves[${i}]`),
  );
  uniqueIds(
    grooves.map((g) => g.id),
    'grooves',
  );
  const motifs = checkArray(o.motifs, 'motifs').map((m, i) => validateMotif(m, `motifs[${i}]`));
  uniqueIds(
    motifs.map((m) => m.id),
    'motifs',
  );
  const stems = checkArray(o.stems, 'stems').map((raw, i): StemV1 => {
    const s = checkObject(raw, `stems[${i}]`, ['id', 'title']);
    return {
      id: checkPattern(s.id, `stems[${i}].id`, MUSIC_KEY),
      ...(s.title === undefined ? {} : { title: checkText(s.title, `stems[${i}].title`, 120) }),
    };
  });
  if (stems.length === 0 || stems.length > MAX_LANES) {
    throw new AudioParamError('stems', 'range', `1–${MAX_LANES} stem`, stems.length);
  }
  uniqueIds(
    stems.map((s) => s.id),
    'stems',
  );
  const stemIds = stems.map((s) => s.id);
  const lanes = checkArray(o.lanes, 'lanes').map((l, i) =>
    checkLane(
      l,
      `lanes[${i}]`,
      stemIds,
      grooves.map((g) => g.id),
    ),
  );
  if (lanes.length === 0 || lanes.length > MAX_LANES) {
    throw new AudioParamError('lanes', 'range', `1–${MAX_LANES} şerit`, lanes.length);
  }
  uniqueIds(
    lanes.map((l) => l.id),
    'lanes',
  );
  const laneIds = lanes.map((l) => l.id);
  const sections = checkArray(o.sections, 'sections').map((s, i) =>
    checkSection(s, `sections[${i}]`, { lanes: laneIds, motifs: motifs.map((m) => m.id), bars }),
  );
  if (sections.length === 0 || sections.length > MAX_SECTIONS) {
    throw new AudioParamError('sections', 'range', `1–${MAX_SECTIONS} bölüm`, sections.length);
  }
  uniqueIds(
    sections.map((s) => s.id),
    'sections',
  );
  assertSectionCoverage(sections, bars);
  const playback = checkChoice(o.playback, 'playback', PLAYBACK_MODES);
  const program: MusicProgramV1 = {
    schema: MUSIC_PROGRAM_SCHEMA,
    musicId: checkPattern(o.musicId, 'musicId', MUSIC_ID),
    version: checkNumber(o.version, 'version', { min: 1, integer: true }),
    title: checkText(o.title, 'title', 120),
    description: checkText(o.description, 'description', 2000),
    seed: checkNumber(o.seed, 'seed', { min: 0, max: 0xffff_ffff, integer: true }),
    playback,
    tempo: {
      bpm: checkNumber(checkObject(o.tempo, 'tempo', ['bpm']).bpm, 'tempo.bpm', {
        min: 20,
        max: 300,
      }),
    },
    meter: checkMeter(o.meter, 'meter'),
    tonal: { system, root },
    bars,
    sampleRate: o.sampleRate === undefined ? 44100 : checkSampleRate(o.sampleRate, 'sampleRate'),
    ...(o.themeBook === undefined
      ? {}
      : {
          themeBook: {
            id: checkPattern(
              checkObject(o.themeBook, 'themeBook', ['id', 'hash']).id,
              'themeBook.id',
              MUSIC_ID,
            ),
            hash: checkText((o.themeBook as ParamObject).hash, 'themeBook.hash', 80) as Sha256,
          },
        }),
    ...(o.themeOverrides === undefined
      ? {}
      : { themeOverrides: validateOverrides(o.themeOverrides, 'themeOverrides') }),
    grooves,
    motifs,
    lanes,
    stems,
    sections,
    delivery: checkDelivery(o.delivery, 'delivery'),
    ...(o.automation === undefined
      ? {}
      : { automation: checkAutomation(o.automation, 'automation', laneIds, bars) }),
    ...(o.markers === undefined ? {} : { markers: checkMarkers(o.markers, 'markers', bars) }),
    ...(o.transitions === undefined
      ? {}
      : {
          transitions: checkArray(o.transitions, 'transitions').map((t, i) =>
            validateTransition(t, `transitions[${i}]`),
          ),
        }),
    ...(o.adaptive === undefined
      ? {}
      : { adaptive: checkAdaptive(o.adaptive, 'adaptive', stemIds) }),
    ...(o.mix === undefined ? {} : { mix: checkMix(o.mix, lanes, playback, o.sampleRate) }),
    ...(o.provenance === undefined
      ? {}
      : {
          provenance: (() => {
            const p = checkObject(o.provenance, 'provenance', [
              'searchId',
              'candidateId',
              'reportHash',
            ]);
            return {
              searchId: checkPattern(p.searchId, 'provenance.searchId', MUSIC_ID),
              candidateId: checkText(p.candidateId, 'provenance.candidateId', 40),
              reportHash: checkText(p.reportHash, 'provenance.reportHash', 80) as Sha256,
            };
          })(),
        }),
    ...(o.mastering === undefined
      ? {}
      : {
          mastering: {
            integratedLufs: checkNumber(
              checkObject(o.mastering, 'mastering', ['integratedLufs']).integratedLufs,
              'mastering.integratedLufs',
              { min: -40, max: -6 },
            ),
          },
        }),
  };
  assertPlaybackShape(program);
  assertLaneContracts(program);
  return program;
}

function assertSectionCoverage(sections: readonly SectionV1[], bars: number): void {
  const ordered = [...sections].sort((a, b) => a.bars[0] - b.bars[0]);
  let cursor = 0;
  for (const section of ordered) {
    if (section.bars[0] !== cursor) {
      throw new AudioParamError(
        `sections.${section.id}.bars`,
        'combination',
        `bölümler boşluksuz ve örtüşmesiz olmalı; ${cursor}. ölçüden başlamalı`,
        section.bars[0],
      );
    }
    cursor = section.bars[1];
  }
  if (cursor !== bars) {
    throw new AudioParamError(
      'sections',
      'combination',
      `bölümler ${bars} ölçüyü kaplamalı`,
      cursor,
    );
  }
}

function assertPlaybackShape(program: MusicProgramV1): void {
  if (program.playback === 'adaptiveLoop') {
    if (!program.adaptive) {
      throw new AudioParamError(
        'adaptive',
        'required',
        'adaptiveLoop state ister',
        program.playback,
      );
    }
    if (program.stems.length < 3) {
      throw new AudioParamError(
        'stems',
        'range',
        'adaptiveLoop en az 3 stem ister',
        program.stems.length,
      );
    }
    return;
  }
  if (program.adaptive) {
    throw new AudioParamError(
      'adaptive',
      'combination',
      'yalnız adaptiveLoop state taşır',
      program.playback,
    );
  }
  if (program.stems.length !== 1) {
    throw new AudioParamError(
      'stems',
      'combination',
      'stem ayrımı yalnız adaptiveLoop içindir',
      program.stems.length,
    );
  }
}

/** Şeridin enstrümanı istenen artikülasyonu ve register'ı gerçekten taşıyor mu. */
function assertLaneContracts(program: MusicProgramV1): void {
  for (const lane of program.lanes) {
    const profile = instrumentProfile(lane.instrument);
    if (lane.articulation) {
      if (!profile.articulations.includes(lane.articulation)) {
        throw new AudioParamError(
          `lanes.${lane.id}.articulation`,
          'unsupported',
          `${lane.instrument} yalnız ${profile.articulations.join(', ')} taşır`,
          lane.articulation,
        );
      }
    }
  }
}

function checkDelivery(value: unknown, path: string): MusicDeliveryV1 {
  const o = checkObject(value, path, ['package', 'assetDir', 'runtimeKey']);
  const pkg = checkText(o.package, `${path}.package`, 80);
  if (!/^@[a-z0-9-]+\/[a-z0-9.-]+$/.test(pkg)) {
    throw new AudioParamError(`${path}.package`, 'type', 'paket adı olmalı', pkg);
  }
  const assetDir = checkText(o.assetDir, `${path}.assetDir`, 200);
  if (!assetDir.split('/').includes('music')) {
    throw new AudioParamError(
      `${path}.assetDir`,
      'combination',
      "müzik asset'i yol sınıfı için 'music' klasörü altında olmalı",
      assetDir,
    );
  }
  return {
    package: pkg,
    assetDir,
    ...(o.runtimeKey === undefined
      ? {}
      : { runtimeKey: checkText(o.runtimeKey, `${path}.runtimeKey`, 96) }),
  };
}

function checkAutomation(
  value: unknown,
  path: string,
  lanes: readonly string[],
  bars: number,
): AutomationV1[] {
  return checkArray(value, path).map((raw, i): AutomationV1 => {
    const a = checkObject(raw, `${path}[${i}]`, ['lane', 'points']);
    const lane = checkPattern(a.lane, `${path}[${i}].lane`, MUSIC_KEY);
    if (!lanes.includes(lane)) {
      throw new AudioParamError(
        `${path}[${i}].lane`,
        'unknown-id',
        'tanımlı bir şerit olmalı',
        lane,
      );
    }
    const points = checkArray(a.points, `${path}[${i}].points`);
    if (points.length < 2) {
      throw new AudioParamError(`${path}[${i}].points`, 'range', 'en az iki nokta', points.length);
    }
    let previous = -1;
    return {
      lane,
      points: points.map((raw2, j) => {
        const pair = checkArray(raw2, `${path}[${i}].points[${j}]`);
        if (pair.length !== 2) {
          throw new AudioParamError(
            `${path}[${i}].points[${j}]`,
            'type',
            '[ölçü, dB]',
            pair.length,
          );
        }
        const bar = checkNumber(pair[0], `${path}[${i}].points[${j}][0]`, { min: 0, max: bars });
        if (bar <= previous) {
          throw new AudioParamError(
            `${path}[${i}].points[${j}][0]`,
            'combination',
            'ölçüler artan olmalı',
            bar,
          );
        }
        previous = bar;
        return [
          bar,
          checkNumber(pair[1], `${path}[${i}].points[${j}][1]`, { min: -60, max: 12 }),
        ] as const;
      }),
    };
  });
}

function checkMarkers(value: unknown, path: string, bars: number): MarkerV1[] {
  return checkArray(value, path).map((raw, i): MarkerV1 => {
    const m = checkObject(raw, `${path}[${i}]`, ['bar', 'kind']);
    return {
      bar: checkNumber(m.bar, `${path}[${i}].bar`, { min: 0, max: bars, integer: true }),
      kind: checkChoice(m.kind, `${path}[${i}].kind`, MARKER_KINDS),
    };
  });
}

export function musicProgramHash(program: MusicProgramV1): Sha256 {
  return hashCanonical(program);
}

export function lanesOfStem(program: MusicProgramV1, stem: string): LaneV1[] {
  return program.lanes.filter((lane) => lane.stem === stem);
}

export { INSTRUMENT_PREFIX };
