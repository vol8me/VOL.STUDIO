import { AudioParamError } from '../guard/errors';
import { checkArray, checkChoice, checkNumber, checkObject } from '../guard/read';
import { hashCanonical, type Sha256 } from '../protocol/canonical';
import { SEARCH_STRATEGIES, strategyPoints, type SearchStrategyId } from '../search/strategy';
import { analyzeScore, type MusicSymbolicReportV1 } from './analyze';
import type { MusicBriefV1 } from './brief';
import { validateMusicProgram, musicProgramHash, type MusicProgramV1 } from './program';
import { MUSIC_RENDERER_VERSION } from './render';
import { expandProgram } from './score';
import { checkPattern, MUSIC_ID, MUSIC_KEY } from './terms';
import type { ThemeBookV1 } from './themeBook';

/**
 * Hiyerarşik aday arama: aday üretmek UCUZDUR (sembolik genişletme), ses
 * render etmek PAHALIDIR. Bu yüzden bütün adaylar sembolik olarak açılıp
 * süzülür; yalnız finalistler render edilir.
 *
 * Arama BESTE YAPMAZ. Beyan edilmiş bir varyasyon uzayını tarar: kazanç,
 * groove, register, voicing, yoğunluk ve motif ötelemesi. Müzikal fikir
 * temel programdan ve ThemeBook'tan gelir; arama onu keşfetmez, ayarlar.
 */
export const MUSIC_SEARCH_SPEC_SCHEMA = 'MusicSearchSpecV1';
export const MUSIC_SEARCH_REPORT_SCHEMA = 'MusicSearchReportV1';

export const MUSIC_TARGET_KINDS = [
  'lane-gain',
  'groove-swing',
  'groove-velocity',
  'register-shift',
  'voicing-spread',
  'density-thinning',
  'motif-transpose',
] as const;
export type MusicTargetKind = (typeof MUSIC_TARGET_KINDS)[number];

export const MUSIC_OBJECTIVE_METRICS = [
  'notesPerBar',
  'melodicSalience',
  'maxPolyphony',
  'outOfSystemRatio',
] as const;
export type MusicObjectiveMetric = (typeof MUSIC_OBJECTIVE_METRICS)[number];

export type MusicTargetV1 =
  | { readonly kind: 'lane-gain'; readonly lane: string }
  | { readonly kind: 'groove-swing'; readonly groove: string }
  | { readonly kind: 'groove-velocity'; readonly groove: string }
  | { readonly kind: 'register-shift'; readonly lane: string }
  | { readonly kind: 'voicing-spread'; readonly section: string }
  | { readonly kind: 'density-thinning'; readonly lane: string }
  | { readonly kind: 'motif-transpose'; readonly lane: string };

export interface MusicDimensionV1 {
  readonly name: string;
  readonly target: MusicTargetV1;
  readonly range: readonly [number, number];
}

export interface MusicObjectiveV1 {
  readonly metric: MusicObjectiveMetric;
  readonly target: number;
  readonly weight?: number;
}

export interface MusicSearchSpecV1 {
  readonly schema: typeof MUSIC_SEARCH_SPEC_SCHEMA;
  readonly searchId: string;
  readonly musicId: string;
  readonly seed: number;
  readonly strategy: SearchStrategyId;
  readonly candidates: number;
  readonly finalists: number;
  readonly dimensions: readonly MusicDimensionV1[];
  readonly objectives: readonly MusicObjectiveV1[];
}

export const MAX_CANDIDATES = 256;
export const MAX_FINALISTS = 8;
/** Yoğunluk inceltmesi bu oranın altında etkisizdir (nota atlamak için en az 1/k gerekir). */
const MIN_THINNING = 0.1;

export function validateMusicSearchSpec(value: unknown): MusicSearchSpecV1 {
  const o = checkObject(value, '', [
    'schema',
    'searchId',
    'musicId',
    'seed',
    'strategy',
    'candidates',
    'finalists',
    'dimensions',
    'objectives',
  ]);
  if (o.schema !== MUSIC_SEARCH_SPEC_SCHEMA) {
    throw new AudioParamError('schema', 'type', MUSIC_SEARCH_SPEC_SCHEMA, o.schema);
  }
  const strategy = checkChoice(
    o.strategy,
    'strategy',
    Object.keys(SEARCH_STRATEGIES) as SearchStrategyId[],
  );
  const dimensions = checkArray(o.dimensions, 'dimensions').map((raw, i) =>
    checkDimension(raw, `dimensions[${i}]`),
  );
  if (dimensions.length === 0 || dimensions.length > SEARCH_STRATEGIES[strategy].maxDimensions) {
    throw new AudioParamError(
      'dimensions',
      'range',
      `1–${SEARCH_STRATEGIES[strategy].maxDimensions} boyut`,
      dimensions.length,
    );
  }
  const names = dimensions.map((d) => d.name);
  const duplicate = names.find((name, i) => names.indexOf(name) !== i);
  if (duplicate)
    throw new AudioParamError('dimensions', 'combination', 'boyut adı tekrar etti', duplicate);
  const candidates = checkNumber(o.candidates, 'candidates', {
    min: 2,
    max: MAX_CANDIDATES,
    integer: true,
  });
  return {
    schema: MUSIC_SEARCH_SPEC_SCHEMA,
    searchId: checkPattern(o.searchId, 'searchId', MUSIC_ID),
    musicId: checkPattern(o.musicId, 'musicId', MUSIC_ID),
    seed: checkNumber(o.seed, 'seed', { min: 0, max: 0xffff_ffff, integer: true }),
    strategy,
    candidates,
    finalists: checkNumber(o.finalists, 'finalists', {
      min: 1,
      max: Math.min(MAX_FINALISTS, candidates),
      integer: true,
    }),
    dimensions,
    objectives: checkArray(o.objectives, 'objectives').map((raw, i) => {
      const obj = checkObject(raw, `objectives[${i}]`, ['metric', 'target', 'weight']);
      return {
        metric: checkChoice(obj.metric, `objectives[${i}].metric`, MUSIC_OBJECTIVE_METRICS),
        target: checkNumber(obj.target, `objectives[${i}].target`, { min: 0, max: 64 }),
        ...(obj.weight === undefined
          ? {}
          : { weight: checkNumber(obj.weight, `objectives[${i}].weight`, { above: 0, max: 10 }) }),
      };
    }),
  };
}

function checkDimension(value: unknown, path: string): MusicDimensionV1 {
  const o = checkObject(value, path, ['name', 'target', 'range']);
  const target = checkObject(o.target, `${path}.target`, ['kind', 'lane', 'groove', 'section']);
  const kind = checkChoice(target.kind, `${path}.target.kind`, MUSIC_TARGET_KINDS);
  const reference =
    kind === 'groove-swing' || kind === 'groove-velocity'
      ? { groove: checkPattern(target.groove, `${path}.target.groove`, MUSIC_KEY) }
      : kind === 'voicing-spread'
      ? { section: checkPattern(target.section, `${path}.target.section`, MUSIC_KEY) }
      : { lane: checkPattern(target.lane, `${path}.target.lane`, MUSIC_KEY) };
  const range = checkArray(o.range, `${path}.range`);
  if (range.length !== 2)
    throw new AudioParamError(`${path}.range`, 'type', '[min, max]', range.length);
  const min = checkNumber(range[0], `${path}.range[0]`, { min: -4, max: 8 });
  return {
    name: checkPattern(o.name, `${path}.name`, MUSIC_KEY),
    target: { kind, ...reference } as MusicTargetV1,
    range: [min, checkNumber(range[1], `${path}.range[1]`, { min, max: 8 })],
  };
}

/** Aday kimliği: uygulanmış programın özeti + arama tohumu + strateji + render sürümü. */
export function musicCandidateIdOf(programHash: Sha256, spec: MusicSearchSpecV1): string {
  const identity = hashCanonical({
    schema: MUSIC_SEARCH_SPEC_SCHEMA,
    programHash,
    searchSeed: spec.seed,
    strategy: spec.strategy,
    rendererVersion: MUSIC_RENDERER_VERSION,
  });
  return `c-${identity.slice('sha256:'.length, 'sha256:'.length + 16)}`;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function thin<T>(items: readonly T[], ratio: number): T[] {
  if (ratio < MIN_THINNING) return [...items];
  const step = Math.max(2, Math.round(1 / ratio));
  return items.filter((_, index) => (index + 1) % step !== 0);
}

/** Boyut değerlerini temel programa uygular; saf ve deterministik. */
export function applyDimensions(
  program: MusicProgramV1,
  spec: MusicSearchSpecV1,
  values: readonly number[],
): MusicProgramV1 {
  const draft = JSON.parse(JSON.stringify(program)) as Mutable<MusicProgramV1> & {
    lanes: Mutable<MusicProgramV1['lanes'][number]>[];
    grooves: Mutable<MusicProgramV1['grooves'][number]>[];
    sections: MusicProgramV1['sections'][number][];
  };
  for (const [index, dimension] of spec.dimensions.entries()) {
    const [min, max] = dimension.range;
    const value = min + (max - min) * values[index];
    apply(draft, dimension.target, value);
  }
  return validateMusicProgram(draft);
}

function apply(draft: Record<string, unknown>, target: MusicTargetV1, value: number): void {
  const program = draft as unknown as MusicProgramV1;
  switch (target.kind) {
    case 'lane-gain': {
      const lane = program.lanes.find((l) => l.id === target.lane) as Mutable<
        MusicProgramV1['lanes'][number]
      >;
      if (lane) lane.gain = Number(value.toFixed(4));
      return;
    }
    case 'register-shift': {
      const lane = program.lanes.find((l) => l.id === target.lane) as Mutable<
        MusicProgramV1['lanes'][number]
      >;
      if (lane) lane.octave = Math.round(value);
      return;
    }
    case 'groove-swing': {
      const groove = program.grooves.find((g) => g.id === target.groove) as Mutable<
        MusicProgramV1['grooves'][number]
      >;
      if (groove) groove.swing = Number(Math.min(0.5, Math.max(0, value)).toFixed(4));
      return;
    }
    case 'groove-velocity': {
      const groove = program.grooves.find((g) => g.id === target.groove) as Mutable<
        MusicProgramV1['grooves'][number]
      >;
      if (groove) groove.velocityJitter = Number(Math.min(1, Math.max(0, value)).toFixed(4));
      return;
    }
    case 'voicing-spread': {
      const section = program.sections.find((s) => s.id === target.section);
      if (section?.harmony) {
        const harmony = section.harmony as { voicing: { spread: string } };
        harmony.voicing = { ...harmony.voicing, spread: value < 0.5 ? 'close' : 'open' };
      }
      return;
    }
    case 'density-thinning': {
      for (const section of program.sections) {
        for (const part of section.parts) {
          if (part.lane !== target.lane) continue;
          if (part.source === 'notes') {
            (part as unknown as { notes: unknown[] }).notes = thin(part.notes, value);
          } else if (part.source === 'chord') {
            (part as unknown as { rhythm: unknown[] }).rhythm = thin(part.rhythm, value);
          }
        }
      }
      return;
    }
    case 'motif-transpose': {
      for (const section of program.sections) {
        for (const part of section.parts) {
          if (part.lane !== target.lane || part.source !== 'motif') continue;
          (part as unknown as { transforms: unknown[] }).transforms = [
            ...part.transforms,
            { op: 'transpose', degrees: Math.round(value) },
          ];
        }
      }
    }
  }
}

export interface MusicCandidateV1 {
  readonly candidateId: string;
  readonly index: number;
  readonly values: Readonly<Record<string, number>>;
  readonly programHash: Sha256;
  readonly symbolic: {
    readonly notesPerBar: number;
    readonly melodicSalience: number;
    readonly maxPolyphony: number;
    readonly outOfSystemRatio: number;
  } | null;
  readonly pass: boolean;
  readonly distance: number | null;
  readonly rejection: { readonly stage: string; readonly message: string } | null;
}

export interface MusicSearchOutcomeV1 {
  readonly candidates: readonly MusicCandidateV1[];
  readonly ranked: readonly string[];
  readonly programs: ReadonlyMap<string, MusicProgramV1>;
  readonly reports: ReadonlyMap<string, MusicSymbolicReportV1>;
}

function distanceOf(spec: MusicSearchSpecV1, report: MusicSymbolicReportV1): number {
  let total = 0;
  for (const objective of spec.objectives) {
    const measured = report.totals[objective.metric];
    total += (objective.weight ?? 1) * Math.abs(measured - objective.target);
  }
  return Number(total.toFixed(6));
}

/**
 * Birinci aşama: bütün adayları SEMBOLİK açar, süzer ve sıralar. Ses render
 * edilmez; sıra yalnız tohum ve stratejiden türer, çağrı sırasından değil.
 */
export function searchSymbolic(
  spec: MusicSearchSpecV1,
  base: MusicProgramV1,
  context: { readonly brief?: MusicBriefV1; readonly themeBook?: ThemeBookV1 },
): MusicSearchOutcomeV1 {
  const points = strategyPoints(
    spec.seed,
    spec.dimensions.map((d) => d.name),
    spec.candidates,
  );
  const candidates: MusicCandidateV1[] = [];
  const programs = new Map<string, MusicProgramV1>();
  const reports = new Map<string, MusicSymbolicReportV1>();
  for (const [index, point] of points.entries()) {
    const values = Object.fromEntries(
      spec.dimensions.map((dimension, i) => {
        const [min, max] = dimension.range;
        return [dimension.name, Number((min + (max - min) * point[i]).toFixed(4))];
      }),
    );
    try {
      const program = applyDimensions(base, spec, point);
      const programHash = musicProgramHash(program);
      const candidateId = musicCandidateIdOf(programHash, spec);
      if (programs.has(candidateId)) continue;
      const report = analyzeScore({
        program,
        score: expandProgram(program),
        ...(context.brief ? { brief: context.brief } : {}),
        ...(context.themeBook ? { themeBook: context.themeBook } : {}),
      });
      programs.set(candidateId, program);
      reports.set(candidateId, report);
      candidates.push({
        candidateId,
        index,
        values,
        programHash,
        symbolic: {
          notesPerBar: report.totals.notesPerBar,
          melodicSalience: report.totals.melodicSalience,
          maxPolyphony: report.totals.maxPolyphony,
          outOfSystemRatio: report.totals.outOfSystemRatio,
        },
        pass: report.verdict.pass,
        distance: distanceOf(spec, report),
        rejection: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      candidates.push({
        candidateId: `c-${index.toString(16).padStart(16, '0')}`,
        index,
        values,
        programHash: hashCanonical(values),
        symbolic: null,
        pass: false,
        distance: null,
        rejection: { stage: 'expand', message },
      });
    }
  }
  const ranked = candidates
    .filter((candidate) => candidate.pass && candidate.distance !== null)
    .sort(
      (a, b) =>
        (a.distance as number) - (b.distance as number) || (a.candidateId < b.candidateId ? -1 : 1),
    )
    .map((candidate) => candidate.candidateId);
  return { candidates, ranked, programs, reports };
}
