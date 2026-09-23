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
import { validateGroove } from './groove';
import { instrumentProfile } from './instruments';
import { validateMotif } from './motif';
import {
  checkAdaptive,
  checkAutomation,
  checkDelivery,
  checkMarkers,
  checkMix,
} from './programExtras';
import { checkLane, checkMeter, checkSection, uniqueIds } from './programParts';
import {
  MAX_BARS,
  MAX_LANES,
  MAX_SECTIONS,
  MUSIC_PROGRAM_SCHEMA,
  type LaneV1,
  type MusicProgramV1,
  type SectionV1,
  type StemV1,
} from './programTypes';
import { isScaleName, noteToMidi, scaleNames } from './tonal';
import { MUSIC_ID, MUSIC_KEY, PLAYBACK_MODES, checkPattern, checkText } from './terms';
import { validateOverrides } from './themeBook';
import { validateTransition } from './transitions';

export * from './programTypes';

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

export function musicProgramHash(program: MusicProgramV1): Sha256 {
  return hashCanonical(program);
}

export function lanesOfStem(program: MusicProgramV1, stem: string): LaneV1[] {
  return program.lanes.filter((lane) => lane.stem === stem);
}
