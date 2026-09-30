import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AssetClass } from '../analysis/assetQa';
import {
  CHECK_KINDS,
  CHECKS_VERSION,
  evaluateChecks,
  validateCheck,
  type CheckResult,
  type MechanicalCheckV1,
} from '../analysis/checks';
import { ANALYZER_VERSION, analyzeAudio } from '../analysis/report';
import { checkLoopSeam, checkStemSync } from '../analysis/sync';
import {
  ANALYSIS_WORK_PER_SAMPLE,
  assertBatchBudget,
  DEFAULT_BATCH_BUDGET,
  SECONDS_PER_WORK_UNIT,
  type BatchEstimate,
} from '../guard/batch';
import { AudioParamError } from '../guard/errors';
import { checkArray, checkChoice, checkNumber, checkObject } from '../guard/read';
import { batchWorkers } from '../guard/parallel';
import { instrumentRegistryHash } from '../music/instruments';
import { validateMusicProgram, type MusicProgramV1 } from '../music/program';
import { MUSIC_RENDERER_VERSION } from '../music/render';
import { cueSegments } from '../music/segments';
import { REFERENCE_MIX_ID } from '../music/stem';
import type { MusicBriefV1 } from '../music/brief';
import { validateBrief } from '../program/brief';
import { checkBase, materialize, type ProgramBaseV1 } from '../program/dimensions';
import { estimateProgramCost, PROGRAM_RENDERER_VERSION } from '../program/render';
import { resolveProgram } from '../program/schema';
import { writeOgg } from '../writer';
import { EXPORT_ROOT, writeAuditionCopy } from './audition';
import {
  CANARY_AUDITION_ROOT,
  canaryReviews,
  loadCanaries,
  runCanary,
  type CanaryResultV1,
  type CanaryReviewStatus,
} from './canary';
import { prettyCanonicalJson, type Sha256 } from '../kernel/canonical';
import { encodeQualityOf } from './encodeProfiles';
import { ProtocolError } from './errors';
import { readJsonFile, resolveInside, withLock, writeFileAtomic } from './fs';
import { checkMusic } from './music';
import { runTasks } from './parallel';
import type { BenchmarkPartInput, BenchmarkPartOutput } from './parallelTasks';
import { registryHash } from './publish';
import { asProtocol } from './records';
import { repoSampleResolver } from './samples';
import { decodeWithFfmpeg } from './toolchain';

/**
 * Sürümlü benchmark görev derlemi — canary'nin kardeş şeması (canary V2
 * DEĞİL): canary tek kaynaklı organik yapı taşı görevidir; benchmark görevi
 * birden çok parça (UI onay/hata gibi), yetenek kategorisi, gömülü müzik
 * kaynağı ve kodek-sonrası/QA kriterleri taşır. İki şema ayrı sürümlenir:
 * bir görev eklemek organik derlemi etkilemez, bir canary sürümü görev
 * raporunu değiştirmez.
 *
 * Mekanik kriterlerin geçmesi "iyi ses" kanıtı DEĞİLDİR — yalnız motor
 * davranışının gerilemediğini söyler. Dinleme durumu ayrı `reviews.json`da
 * ve yalnız insan beyanıyla `pending-human` dışına çıkar.
 */
export const BENCHMARK_SCHEMA = 'BenchmarkTaskV1';
export const BENCHMARK_REVIEWS_SCHEMA = 'BenchmarkReviewsV1';
export const BENCHMARK_REPORT_SCHEMA = 'BenchmarkReportV1';
export const BENCHMARKS_ROOT = 'devtools/audio-synth/corpus/benchmarks';
export const BENCHMARK_AUDITION_ROOT = `${EXPORT_ROOT}/benchmarks`;
const REVIEWS_FILE = 'reviews.json';
const ID = /^[a-z][a-z0-9-]{0,47}$/;

const EXTENDED_KINDS = ['codec-loop-seam', 'codec-stem-sync', 'music-qa', 'bar-align'] as const;
const MUSIC_ONLY_KINDS = ['music-qa', 'bar-align'] as const;

type ExtendedCheckV1 = { readonly kind: (typeof EXTENDED_KINDS)[number] };
export type BenchmarkCheckV1 = MechanicalCheckV1 | ExtendedCheckV1;
export type BenchmarkReviewStatus = CanaryReviewStatus;

export type BenchmarkSourceV1 =
  | ProgramBaseV1
  | { readonly kind: 'music'; readonly brief: MusicBriefV1; readonly program: MusicProgramV1 };

export interface BenchmarkPartV1 {
  readonly id: string;
  readonly source: BenchmarkSourceV1;
  readonly expectations: readonly BenchmarkCheckV1[];
}

export interface BenchmarkTaskV1 {
  readonly schema: typeof BENCHMARK_SCHEMA;
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly purpose: string;
  /** Yetenek ailesi (`audio:capabilities` bu anahtarla gruplar). */
  readonly category: string;
  readonly parts: readonly BenchmarkPartV1[];
  readonly listeningGuide: readonly string[];
}

export interface BenchmarkReviewV1 {
  readonly status: BenchmarkReviewStatus;
  readonly version: number;
  readonly note: string | null;
}

export interface BenchmarkReviewsV1 {
  readonly schema: typeof BENCHMARK_REVIEWS_SCHEMA;
  readonly reviews: Readonly<Record<string, BenchmarkReviewV1>>;
}

function text(value: unknown, path: string, max: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
    throw new AudioParamError(path, 'type', `boş olmayan, en çok ${max} karakter`, value);
  }
  return value;
}

function checkSource(value: unknown, path: string): BenchmarkSourceV1 {
  const head = checkObject(value, path, ['kind', 'request', 'program', 'brief']);
  const kind = checkChoice(head.kind, `${path}.kind`, ['program', 'archetype', 'music'] as const);
  if (kind === 'music') {
    const o = checkObject(value, path, ['kind', 'brief', 'program']);
    const brief = validateBrief(o.brief);
    if (brief.kind !== 'music') {
      throw new AudioParamError(`${path}.brief`, 'type', 'müzik brief’i bekleniyor', brief.kind);
    }
    const program = validateMusicProgram(o.program);
    if (program.themeBook) {
      throw new AudioParamError(
        `${path}.program.themeBook`,
        'combination',
        'benchmark müziği gömülü olmalı; repo ThemeBook başvurusu taşıyamaz',
        program.themeBook.id,
      );
    }
    return { kind: 'music', brief, program };
  }
  return checkBase(value, path);
}

function checkExpectation(value: unknown, path: string, music: boolean): BenchmarkCheckV1 {
  const head = checkObject(value, path, Object.keys((value as object) ?? {}));
  if ((CHECK_KINDS as readonly string[]).includes(head.kind as string)) {
    const check = validateCheck(value, path);
    return check;
  }
  const kind = checkChoice(head.kind, `${path}.kind`, EXTENDED_KINDS);
  checkObject(value, path, ['kind']);
  if (!music && (MUSIC_ONLY_KINDS as readonly string[]).includes(kind)) {
    throw new AudioParamError(
      `${path}.kind`,
      'combination',
      `${kind} yalnız müzik parçasında`,
      kind,
    );
  }
  return { kind };
}

/** Sınıf politikasını parçanın tek `asset-policy` bildiriminden okur. */
function assetClassOf(part: BenchmarkPartV1, path: string): AssetClass {
  const policies = part.expectations.filter((e) => e.kind === 'asset-policy');
  if (policies.length !== 1) {
    throw new AudioParamError(
      `${path}.expectations`,
      'required',
      'tam bir asset-policy kriteri gerekir',
      policies.length,
    );
  }
  return (policies[0] as MechanicalCheckV1 & { kind: 'asset-policy' }).assetClass;
}

function checkPart(value: unknown, path: string): BenchmarkPartV1 {
  const o = checkObject(value, path, ['id', 'source', 'expectations']);
  if (typeof o.id !== 'string' || !ID.test(o.id)) {
    throw new AudioParamError(`${path}.id`, 'type', ID.source, o.id);
  }
  const source = checkSource(o.source, `${path}.source`);
  const music = source.kind === 'music';
  const expectations = checkArray(o.expectations, `${path}.expectations`).map((e, i) =>
    checkExpectation(e, `${path}.expectations[${i}]`, music),
  );
  const part = { id: o.id, source, expectations } as BenchmarkPartV1;
  const count = (kind: string) => expectations.filter((e) => e.kind === kind).length;
  for (const required of ['asset-policy', 'clipping', 'clicks']) {
    if (count(required) !== 1) {
      throw new AudioParamError(
        `${path}.expectations`,
        'required',
        `her parça tam bir ${required} kriteri taşır`,
        count(required),
      );
    }
  }
  assetClassOf(part, path);
  return part;
}

export function validateBenchmarkTask(value: unknown): BenchmarkTaskV1 {
  const o = checkObject(value, '', [
    'schema',
    'id',
    'version',
    'title',
    'purpose',
    'category',
    'parts',
    'listeningGuide',
  ]);
  if (o.schema !== BENCHMARK_SCHEMA)
    throw new AudioParamError('schema', 'type', `"${BENCHMARK_SCHEMA}" olmalı`, o.schema);
  if (typeof o.id !== 'string' || !ID.test(o.id))
    throw new AudioParamError('id', 'type', ID.source, o.id);
  if (typeof o.category !== 'string' || !ID.test(o.category))
    throw new AudioParamError('category', 'type', `yetenek ailesi ${ID.source}`, o.category);
  const parts = checkArray(o.parts, 'parts').map((p, i) => checkPart(p, `parts[${i}]`));
  if (parts.length < 1) throw new AudioParamError('parts', 'range', 'en az bir parça', 0);
  if (parts.length > 4)
    throw new AudioParamError('parts', 'range', 'en çok dört parça', parts.length);
  const ids = new Set(parts.map((p) => p.id));
  if (ids.size !== parts.length) {
    throw new AudioParamError(
      'parts',
      'combination',
      'parça kimlikleri tekil olmalı',
      parts.length,
    );
  }
  const guide = checkArray(o.listeningGuide, 'listeningGuide');
  if (guide.length < 1)
    throw new AudioParamError('listeningGuide', 'range', 'en az bir dinleme notu', 0);
  return {
    schema: BENCHMARK_SCHEMA,
    id: o.id,
    version: checkNumber(o.version, 'version', { min: 1, integer: true }),
    title: text(o.title, 'title', 80),
    purpose: text(o.purpose, 'purpose', 400),
    category: o.category,
    parts,
    listeningGuide: guide.map((g, i) => text(g, `listeningGuide[${i}]`, 400)),
  };
}

function benchmarkFile(repoRoot: string, name: string): string {
  return resolveInside(repoRoot, `${BENCHMARKS_ROOT}/${name}`, name);
}

/** Görevler ada göre sıralı; dosya adı `<id>.json` olmak zorunda. */
export function loadBenchmarkTasks(repoRoot: string): BenchmarkTaskV1[] {
  const dir = resolveInside(repoRoot, BENCHMARKS_ROOT, 'benchmarks');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json') && name !== REVIEWS_FILE)
    .sort()
    .map((name) => {
      const task = asProtocol(name, () =>
        validateBenchmarkTask(readJsonFile(benchmarkFile(repoRoot, name), name)),
      );
      if (`${task.id}.json` !== name)
        throw new ProtocolError('identity', `dosya adı ${task.id}.json olmalı`, name);
      return task;
    });
}

export interface CheckOutcomeV1 {
  readonly kind: string;
  readonly pass: boolean;
  readonly measured: unknown;
  readonly reason: string | null;
}

export interface BenchmarkPartResultV1 {
  readonly id: string;
  readonly source: 'acoustic' | 'music';
  readonly programHash: Sha256;
  readonly pcmHash: Sha256;
  readonly checks: readonly CheckOutcomeV1[];
}

export interface BenchmarkTaskResultV1 {
  readonly id: string;
  readonly version: number;
  readonly category: string;
  readonly pass: boolean;
  readonly parts: readonly BenchmarkPartResultV1[];
  readonly review: BenchmarkReviewStatus;
}

export interface BenchmarkCanaryEntryV1 extends CanaryResultV1 {
  readonly review: BenchmarkReviewStatus;
}

export interface BenchmarkReportV1 {
  readonly schema: typeof BENCHMARK_REPORT_SCHEMA;
  readonly engine: {
    readonly programRenderer: number;
    readonly musicRenderer: number;
    readonly analyzer: number;
    readonly checks: number;
    readonly registryHash: Sha256;
    readonly instrumentRegistryHash: Sha256;
  };
  readonly canaries: readonly BenchmarkCanaryEntryV1[];
  readonly tasks: readonly BenchmarkTaskResultV1[];
}

const outcomeOf = (r: CheckResult): CheckOutcomeV1 => ({
  kind: r.check.kind,
  pass: r.pass,
  measured: r.measured,
  reason: r.reason,
});

const isMechanical = (e: BenchmarkCheckV1): e is MechanicalCheckV1 =>
  (CHECK_KINDS as readonly string[]).includes(e.kind);

function codecChecks(
  dir: string,
  part: BenchmarkPartV1,
  channels: Float32Array[],
  sampleRate: number,
): CheckOutcomeV1[] {
  const out: CheckOutcomeV1[] = [];
  const quality = encodeQualityOf(assetClassOf(part, `part ${part.id}`));
  const file = join(dir, `${part.id}.ogg`);
  writeOgg(file, { channels, sampleRate, duration: channels[0].length / sampleRate }, { quality });
  const decoded = decodeWithFfmpeg(file, part.id);
  for (const e of part.expectations) {
    if (e.kind === 'codec-loop-seam') {
      const r = checkLoopSeam(part.id, decoded.channels);
      out.push({
        kind: e.kind,
        pass: r.ok,
        measured: { jump: r.jump, typicalStep: r.typicalStep },
        reason: r.ok ? null : r.detail,
      });
    } else if (e.kind === 'codec-stem-sync') {
      const r = checkStemSync(part.id, channels[0], decoded.channels[0], channels[0].length);
      out.push({
        kind: e.kind,
        pass: r.ok,
        measured: { lag: r.lagSamples, frameDelta: r.frameDelta },
        reason: r.ok ? null : r.detail,
      });
    }
  }
  return out;
}

interface AcousticWork {
  readonly task: BenchmarkTaskV1;
  readonly part: BenchmarkPartV1;
  readonly input: BenchmarkPartInput;
}

function runMusicPart(
  repoRoot: string,
  dir: string,
  task: BenchmarkTaskV1,
  part: BenchmarkPartV1,
): { result: BenchmarkPartResultV1; pcm: Float32Array[]; sampleRate: number } {
  const source = part.source as Extract<BenchmarkSourceV1, { kind: 'music' }>;
  const check = checkMusic(repoRoot, {
    brief: source.brief,
    program: source.program,
    themeBook: null,
  });
  const rate = source.program.sampleRate;
  const mix = check.rendered.find((r) => r.stem === REFERENCE_MIX_ID);
  if (!mix) throw new ProtocolError('invalid', 'müzik renderında referans mix yok', task.id);
  const checks: CheckOutcomeV1[] = [];
  const mechanical = part.expectations.filter(isMechanical);
  if (mechanical.length) {
    const report = analyzeAudio(mix.channels, rate, 'source-pcm');
    checks.push(
      ...evaluateChecks(mechanical, { channels: mix.channels, sampleRate: rate }, report).map(
        outcomeOf,
      ),
    );
  }
  const cueIds = new Set(cueSegments(source.program).map((s) => s.id));
  const loopId = (id: string) => source.program.playback !== 'playlistOneShot' && !cueIds.has(id);
  const expected = new Map<string, number>([[REFERENCE_MIX_ID, check.spec.frames]]);
  for (const stem of check.spec.stems) expected.set(stem.id, stem.frames);
  for (const cue of check.spec.cues ?? []) expected.set(cue.id, cue.frames);
  for (const e of part.expectations) {
    if (e.kind === 'music-qa') {
      checks.push({
        kind: e.kind,
        pass: check.qa.verdict.pass,
        measured: check.qa.verdict.failures,
        reason: check.qa.verdict.pass ? null : check.qa.verdict.failures.join('; '),
      });
    } else if (e.kind === 'bar-align') {
      const off = check.rendered
        .filter((a) => expected.get(a.stem) !== a.frames)
        .map((a) => a.stem);
      checks.push({
        kind: e.kind,
        pass: off.length === 0,
        measured: off,
        reason: off.length === 0 ? null : `kare sayıları spec dışı: ${off.join(', ')}`,
      });
    }
  }
  const codec = part.expectations.filter(
    (e) => e.kind === 'codec-loop-seam' || e.kind === 'codec-stem-sync',
  );
  if (codec.length) {
    const quality = encodeQualityOf('music');
    for (const asset of check.rendered) {
      const file = join(dir, `${task.id}-${part.id}-${asset.stem}.ogg`);
      writeOgg(
        file,
        { channels: asset.channels, sampleRate: rate, duration: asset.frames / rate },
        { quality },
      );
      const decoded = decodeWithFfmpeg(file, `${task.id}/${asset.stem}`);
      for (const e of codec) {
        if (e.kind === 'codec-loop-seam' && loopId(asset.stem)) {
          const r = checkLoopSeam(asset.stem, decoded.channels);
          checks.push({
            kind: e.kind,
            pass: r.ok,
            measured: { asset: asset.stem, jump: r.jump, typicalStep: r.typicalStep },
            reason: r.ok ? null : `${asset.stem}: ${r.detail}`,
          });
        } else if (e.kind === 'codec-stem-sync') {
          const r = checkStemSync(asset.stem, asset.channels[0], decoded.channels[0], asset.frames);
          checks.push({
            kind: e.kind,
            pass: r.ok,
            measured: { asset: asset.stem, lag: r.lagSamples, frameDelta: r.frameDelta },
            reason: r.ok ? null : `${asset.stem}: ${r.detail}`,
          });
        }
      }
    }
  }
  return {
    result: {
      id: part.id,
      source: 'music',
      programHash: check.programHash,
      pcmHash: mix.pcmHash,
      checks,
    },
    pcm: mix.channels,
    sampleRate: rate,
  };
}

export interface BenchmarkRunOptions {
  /** Parça PCM'leri dinleme kopyası olarak export/ altına yazılsın mı. */
  readonly audition?: boolean;
  /** Worker sayısı; verilmezse toplu tahminden. Sonuç aynıdır. */
  readonly workers?: number;
}

/**
 * 19 organik canary + bütün benchmark görevleri TEK raporda koşar. Akustik
 * parçalar `benchmark-part` göreviyle worker'larda; müzik parçaları ana iş
 * parçacığında `checkMusic` ile (içeriden zaten paralel) koşar.
 */
export function runBenchmarks(
  repoRoot: string,
  options: BenchmarkRunOptions = {},
): BenchmarkReportV1 {
  const tasks = loadBenchmarkTasks(repoRoot);
  const reviews = benchmarkReviews(repoRoot);
  const dir = mkdtempSync(join(tmpdir(), 'benchmark-'));
  try {
    const acoustic: AcousticWork[] = [];
    let work = 0;
    let peak = 0;
    for (const task of tasks) {
      for (const part of task.parts) {
        if (part.source.kind === 'music') continue;
        const program = materialize(part.source, [], {});
        const cost = estimateProgramCost(resolveProgram(program));
        work += cost.workUnits + resolveProgram(program).frames * ANALYSIS_WORK_PER_SAMPLE;
        peak = Math.max(peak, cost.peakBytes);
        acoustic.push({
          task,
          part,
          input: {
            key: `${task.id}/${part.id}`,
            program,
            checks: part.expectations.filter(isMechanical),
            withPcm:
              options.audition === true ||
              part.expectations.some(
                (e) => e.kind === 'codec-loop-seam' || e.kind === 'codec-stem-sync',
              ),
          },
        });
      }
    }
    const estimate: BatchEstimate = {
      items: acoustic.length,
      totalWorkUnits: work,
      maxItemPeakBytes: peak,
      estimatedSeconds: work * SECONDS_PER_WORK_UNIT,
    };
    assertBatchBudget(estimate, DEFAULT_BATCH_BUDGET, 'benchmark korpusu');
    const outputs = runTasks<BenchmarkPartOutput>(
      repoRoot,
      'benchmark-part',
      acoustic.map((a) => a.input),
      batchWorkers(estimate, options.workers),
    );
    const byKey = new Map(outputs.map((o) => [o.key, o]));
    const results: BenchmarkTaskResultV1[] = [];
    for (const task of tasks) {
      const parts: BenchmarkPartResultV1[] = [];
      for (const part of task.parts) {
        if (part.source.kind === 'music') {
          const music = runMusicPart(repoRoot, dir, task, part);
          parts.push(music.result);
          if (options.audition) {
            writeAuditionCopy(repoRoot, `${BENCHMARK_AUDITION_ROOT}/${task.id}--${part.id}.wav`, {
              channels: music.pcm,
              sampleRate: music.sampleRate,
              duration: music.pcm[0].length / music.sampleRate,
              seed: 0,
              cost: { peakBytes: 0, workUnits: 0 },
            });
          }
          continue;
        }
        const out = byKey.get(`${task.id}/${part.id}`) as BenchmarkPartOutput;
        const checks = [...out.checks];
        if (out.channels && out.sampleRate) {
          checks.push(...codecChecks(dir, part, out.channels, out.sampleRate));
        }
        parts.push({
          id: part.id,
          source: 'acoustic',
          programHash: out.programHash,
          pcmHash: out.pcmHash,
          checks,
        });
        if (options.audition && out.channels && out.sampleRate) {
          writeAuditionCopy(repoRoot, `${BENCHMARK_AUDITION_ROOT}/${task.id}--${part.id}.wav`, {
            channels: out.channels,
            sampleRate: out.sampleRate,
            duration: out.channels[0].length / out.sampleRate,
            seed: 0,
            cost: { peakBytes: 0, workUnits: 0 },
          });
        }
      }
      const review = reviews.find((r) => r.id === task.id)?.status ?? 'pending-human';
      results.push({
        id: task.id,
        version: task.version,
        category: task.category,
        pass: parts.every((p) => p.checks.every((c) => c.pass)),
        parts,
        review,
      });
    }
    const canaryStates = canaryReviews(repoRoot);
    const samples = repoSampleResolver(repoRoot);
    const canaries = loadCanaries(repoRoot).map((canary) => {
      const { result, render } = runCanary(canary, samples);
      if (options.audition) {
        writeAuditionCopy(repoRoot, `${CANARY_AUDITION_ROOT}/${canary.id}.wav`, render);
      }
      return {
        ...result,
        review: canaryStates.find((r) => r.id === canary.id)?.status ?? 'pending-human',
      };
    });
    return {
      schema: BENCHMARK_REPORT_SCHEMA,
      engine: {
        programRenderer: PROGRAM_RENDERER_VERSION,
        musicRenderer: MUSIC_RENDERER_VERSION,
        analyzer: ANALYZER_VERSION,
        checks: CHECKS_VERSION,
        registryHash: registryHash(),
        instrumentRegistryHash: instrumentRegistryHash(),
      },
      canaries,
      tasks: results,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function validateBenchmarkReviews(value: unknown): BenchmarkReviewsV1 {
  const o = checkObject(value, 'reviews', ['schema', 'reviews']);
  if (o.schema !== BENCHMARK_REVIEWS_SCHEMA)
    throw new AudioParamError('schema', 'type', `"${BENCHMARK_REVIEWS_SCHEMA}" olmalı`, o.schema);
  const raw = checkObject(o.reviews, 'reviews', Object.keys((o.reviews as object) ?? {}));
  const reviews: Record<string, BenchmarkReviewV1> = {};
  for (const id of Object.keys(raw).sort()) {
    const r = checkObject(raw[id], `reviews.${id}`, ['status', 'version', 'note']);
    const status = checkChoice(r.status, `reviews.${id}.status`, [
      'pending-human',
      'heard-acceptable',
      'heard-problem',
    ] as const);
    if (status !== 'pending-human' && r.note === null) {
      throw new AudioParamError(`reviews.${id}.note`, 'required', 'dinleme beyanı not ister', null);
    }
    reviews[id] = {
      status,
      version: checkNumber(r.version, `reviews.${id}.version`, { min: 1, integer: true }),
      note: r.note === null ? null : text(r.note, `reviews.${id}.note`, 1000),
    };
  }
  return { schema: BENCHMARK_REVIEWS_SCHEMA, reviews };
}

export interface BenchmarkReviewState extends BenchmarkReviewV1 {
  readonly id: string;
  readonly stale: boolean;
}

export function benchmarkReviews(repoRoot: string): BenchmarkReviewState[] {
  const file = benchmarkFile(repoRoot, REVIEWS_FILE);
  const stored = existsSync(file)
    ? validateBenchmarkReviews(readJsonFile(file, REVIEWS_FILE)).reviews
    : {};
  return loadBenchmarkTasks(repoRoot).map((t) => {
    const r = stored[t.id];
    if (!r)
      return { id: t.id, status: 'pending-human', version: t.version, note: null, stale: false };
    const stale = r.version !== t.version;
    return { id: t.id, ...r, status: stale ? 'pending-human' : r.status, stale };
  });
}

/** İnsan dinleme beyanını kaydeder (yalnız bu komutla; agent kendi dinlemesini yazamaz). */
export function recordBenchmarkReview(
  repoRoot: string,
  id: string,
  status: BenchmarkReviewStatus,
  note: string | null,
): BenchmarkReviewsV1 {
  const task = loadBenchmarkTasks(repoRoot).find((t) => t.id === id);
  if (!task) throw new ProtocolError('not-found', `benchmark görevi yok: ${id}`, BENCHMARKS_ROOT);
  const dir = resolveInside(repoRoot, BENCHMARKS_ROOT, 'benchmarks');
  return withLock(dir, BENCHMARKS_ROOT, () => {
    const file = benchmarkFile(repoRoot, REVIEWS_FILE);
    const current = existsSync(file)
      ? validateBenchmarkReviews(readJsonFile(file, REVIEWS_FILE)).reviews
      : {};
    const next = asProtocol('review', () =>
      validateBenchmarkReviews({
        schema: BENCHMARK_REVIEWS_SCHEMA,
        reviews: { ...current, [id]: { status, version: task.version, note } },
      }),
    );
    writeFileAtomic(file, prettyCanonicalJson(next));
    return next;
  });
}
