import { AudioParamError } from '../guard/errors';
import {
  checkArray,
  checkChoice,
  checkNumber,
  checkObject,
  checkSampleRate,
  type ParamObject,
} from '../guard/read';
import { hashCanonical, type Sha256 } from '../kernel/canonical';
import { resolveBanks } from '../program/sampleBank';
import { resolveSampleDecls } from '../program/samples';
import { validateGroove } from './groove';
import { MAX_INSTRUMENTS, validateInstrumentDefinition } from './instrumentDefinition';
import { programInstruments } from './instrumentResolve';
import { validateMotif } from './motif';
import {
  checkAdaptive,
  checkAutomation,
  checkDelivery,
  checkMarkers,
  checkMix,
} from './programExtras';
import { laneInstrument, validatePalettes, type PaletteV1 } from './orchestration';
import { MAX_PATTERNS, validatePattern } from './pattern';
import { validateSegments } from './segments';
import { validateTuning } from './tuning';
import { checkInstrumentId, checkLane, checkMeter, checkSection, uniqueIds } from './programParts';
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
  'instruments',
  'samples',
  'banks',
  'palettes',
  'orchestration',
  'patterns',
  'tuning',
  'segments',
];

/**
 * Sampler bildirimleri akustik programla aynı biçimdedir; kullanılmayan
 * banka ya da kayıt reddedilir (bildirim render yüzeyinin parçasıdır).
 */
function checkSampling(o: ParamObject) {
  const samples = resolveSampleDecls(o.samples);
  const used = new Set<string>();
  const banks = resolveBanks(o.banks, samples, used);
  const instruments =
    o.instruments === undefined
      ? []
      : checkArray(o.instruments, 'instruments').map((raw, i) =>
          validateInstrumentDefinition(raw, `instruments[${i}]`),
        );
  if (instruments.length > MAX_INSTRUMENTS) {
    throw new AudioParamError(
      'instruments',
      'range',
      `en çok ${MAX_INSTRUMENTS} enstrüman`,
      instruments.length,
    );
  }
  uniqueIds(
    instruments.map((d) => d.id),
    'instruments',
  );
  const banked = new Set(
    instruments.flatMap((d) =>
      d.source.kind === 'sampler'
        ? [d.source.bank]
        : d.source.kind === 'layer'
        ? d.source.layers.flatMap((l) => (l.source.kind === 'sampler' ? [l.source.bank] : []))
        : [],
    ),
  );
  for (const name of banks.keys()) {
    if (!banked.has(name)) {
      throw new AudioParamError(
        `banks.${name}`,
        'combination',
        'hiçbir sampler enstrümanı kullanmıyor',
        name,
      );
    }
  }
  for (const name of samples.keys()) {
    if (!used.has(name)) {
      throw new AudioParamError(
        `samples.${name}`,
        'combination',
        'hiçbir bankada kullanılmıyor',
        name,
      );
    }
  }
  return { instruments, samples, banks };
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
  const sampling = checkSampling(o);
  const localIds = sampling.instruments.map((d) => d.id);
  const palettes =
    o.palettes === undefined
      ? undefined
      : validatePalettes(o.palettes, (id, path) => checkInstrumentId(id, path, localIds));
  const orchestration = checkActivePalette(o.orchestration, palettes);
  const lanes = checkArray(o.lanes, 'lanes').map((l, i) =>
    checkLane(
      l,
      `lanes[${i}]`,
      stemIds,
      grooves.map((g) => g.id),
      localIds,
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
  const patterns =
    o.patterns === undefined
      ? undefined
      : checkArray(o.patterns, 'patterns').map((p, i) => validatePattern(p, `patterns[${i}]`));
  if (patterns && (patterns.length === 0 || patterns.length > MAX_PATTERNS)) {
    throw new AudioParamError('patterns', 'range', `1–${MAX_PATTERNS} desen`, patterns.length);
  }
  if (patterns) {
    uniqueIds(
      patterns.map((p) => p.id),
      'patterns',
    );
  }
  const sections = checkArray(o.sections, 'sections').map((s, i) =>
    checkSection(s, `sections[${i}]`, {
      lanes: laneIds,
      motifs: motifs.map((m) => m.id),
      bars,
      ...(patterns ? { patterns } : {}),
    }),
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
    ...(o.tuning === undefined ? {} : { tuning: validateTuning(o.tuning) }),
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
    ...(patterns === undefined ? {} : { patterns }),
    lanes,
    stems,
    sections,
    delivery: checkDelivery(o.delivery, 'delivery'),
    ...(sampling.instruments.length > 0 ? { instruments: sampling.instruments } : {}),
    ...(palettes === undefined ? {} : { palettes }),
    ...(orchestration === undefined ? {} : { orchestration }),
    ...(o.samples === undefined ? {} : { samples: o.samples as MusicProgramV1['samples'] }),
    ...(o.banks === undefined ? {} : { banks: o.banks as MusicProgramV1['banks'] }),
    ...(o.automation === undefined
      ? {}
      : { automation: checkAutomation(o.automation, 'automation', laneIds, bars) }),
    ...(o.markers === undefined ? {} : { markers: checkMarkers(o.markers, 'markers', bars) }),
    ...(o.segments === undefined
      ? {}
      : {
          segments: validateSegments(o.segments, {
            bars,
            playback,
            stems: stemIds,
            ...(o.markers === undefined
              ? {}
              : { markers: checkMarkers(o.markers, 'markers', bars) }),
          }),
        }),
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
  const delivered =
    program.playback === 'adaptiveLoop'
      ? [...program.stems.map((stem) => stem.id), 'mix']
      : ['mix'];
  delivered.push(
    ...(program.segments ?? [])
      .filter((segment) => segment.kind !== 'loop')
      .map((segment) => segment.id),
  );
  const files = program.delivery.files ?? {};
  if (Object.keys(files).some((key) => !delivered.includes(key)))
    throw new AudioParamError(
      'delivery.files',
      'combination',
      'yalnız yayımlanan stem ve cue adları',
      files,
    );
  const paths = delivered.map((key) => files[key] ?? `${program.delivery.assetDir}/${key}.ogg`);
  if (new Set(paths).size !== paths.length)
    throw new AudioParamError(
      'delivery.files',
      'combination',
      'her asset farklı dosyaya teslim edilir',
      files,
    );
  assertPlaybackShape(program);
  assertTransitionCues(program);
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

/** `stinger` geçişinin cue'su programın stinger ya da geçiş segmentidir. */
function assertTransitionCues(program: MusicProgramV1): void {
  for (const [i, transition] of (program.transitions ?? []).entries()) {
    if (transition.cue === undefined) continue;
    const segment = program.segments?.find((s) => s.id === transition.cue);
    if (!segment || (segment.kind !== 'stinger' && segment.kind !== 'transition')) {
      throw new AudioParamError(
        `transitions[${i}].cue`,
        'unknown-id',
        'stinger ya da geçiş segmenti olmalı',
        transition.cue,
      );
    }
  }
}

function checkActivePalette(
  value: unknown,
  palettes: readonly PaletteV1[] | undefined,
): { palette: string } | undefined {
  if (value === undefined) return undefined;
  const palette = checkPattern(
    checkObject(value, 'orchestration', ['palette']).palette,
    'orchestration.palette',
    MUSIC_KEY,
  );
  if (!palettes?.some((p) => p.id === palette)) {
    throw new AudioParamError(
      'orchestration.palette',
      'unknown-id',
      'tanımlı bir palet olmalı',
      palette,
    );
  }
  return { palette };
}

/** Her şerit bir enstrümana çözülür ve istenen varsayılan artikülasyonu gerçekten taşır. */
function assertLaneContracts(program: MusicProgramV1): void {
  const table = programInstruments(program);
  for (const lane of program.lanes) {
    const id = laneInstrument(program, lane);
    const instrument = table.get(id, `lanes.${lane.id}.instrument`);
    if (lane.articulation && !instrument.articulations.includes(lane.articulation)) {
      throw new AudioParamError(
        `lanes.${lane.id}.articulation`,
        'unsupported',
        `${id} yalnız ${instrument.articulations.join(', ')} taşır`,
        lane.articulation,
      );
    }
  }
}

export function musicProgramHash(program: MusicProgramV1): Sha256 {
  return hashCanonical(program);
}

export function lanesOfStem(program: MusicProgramV1, stem: string): LaneV1[] {
  return program.lanes.filter((lane) => lane.stem === stem);
}
