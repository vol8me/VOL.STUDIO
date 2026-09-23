import { existsSync, readdirSync } from 'node:fs';
import { evaluateChecks, validateCheck, type MechanicalCheckV1 } from '../analysis/checks';
import { analyzeAudio } from '../analysis/report';
import { AudioParamError } from '../guard/errors';
import { checkArray, checkChoice, checkNumber, checkObject } from '../guard/read';
import { checkBase, materialize, type ProgramBaseV1 } from '../program/dimensions';
import { renderProgram, type ProgramRender } from '../program/render';
import { writeAuditionCopy, EXPORT_ROOT } from './audition';
import { hashCanonical, hashPcm, prettyCanonicalJson, type Sha256 } from './canonical';
import { ProtocolError } from './errors';
import { readJsonFile, resolveInside, withLock, writeFileAtomic } from './fs';
import { asProtocol } from './records';
import { repoSampleResolver } from './samples';
import type { SampleResolver } from '../program/samples';

/**
 * Organik canary derlemi — motorun organik yapı taşları için küçük, sürümlü
 * GÖREVLER. Bir canary asset kütüphanesi değildir: deterministik bir kaynak
 * (program ya da archetype isteği), ucuz mekanik beklentiler ve insan için
 * dinleme rehberi taşır. Mekanik beklentiler geçmesi sesin "organik"
 * olduğunu KANITLAMAZ; yalnız motorun ölçülebilir davranışının
 * gerilemediğini söyler. İnsan dinleme durumu ayrı `reviews.json`dadır ve
 * yalnız bir insan beyanıyla `pending-human` dışına çıkar.
 */
export const CANARY_SCHEMA = 'OrganicCanaryV1';
export const CANARY_REVIEWS_SCHEMA = 'CanaryReviewsV1';
export const CANARIES_ROOT = 'devtools/audio-synth/canaries';
export const CANARY_AUDITION_ROOT = `${EXPORT_ROOT}/canaries`;
const REVIEWS_FILE = 'reviews.json';
const ID = /^[a-z][a-z0-9-]{0,47}$/;

export interface OrganicCanaryV1 {
  readonly schema: typeof CANARY_SCHEMA;
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly purpose: string;
  readonly source: ProgramBaseV1;
  readonly expectations: readonly MechanicalCheckV1[];
  readonly listeningGuide: readonly string[];
}

export type CanaryReviewStatus = 'pending-human' | 'heard-acceptable' | 'heard-problem';

export interface CanaryReviewV1 {
  readonly status: CanaryReviewStatus;
  /** Değerlendirilen canary sürümü; sürüm artınca inceleme bayatlar. */
  readonly version: number;
  readonly note: string | null;
}

export interface CanaryReviewsV1 {
  readonly schema: typeof CANARY_REVIEWS_SCHEMA;
  readonly reviews: Readonly<Record<string, CanaryReviewV1>>;
}

function text(value: unknown, path: string, max: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
    throw new AudioParamError(path, 'type', `boş olmayan, en çok ${max} karakter`, value);
  }
  return value;
}

export function validateCanary(value: unknown): OrganicCanaryV1 {
  const o = checkObject(value, '', [
    'schema',
    'id',
    'version',
    'title',
    'purpose',
    'source',
    'expectations',
    'listeningGuide',
  ]);
  if (o.schema !== CANARY_SCHEMA)
    throw new AudioParamError('schema', 'type', `"${CANARY_SCHEMA}" olmalı`, o.schema);
  if (typeof o.id !== 'string' || !ID.test(o.id))
    throw new AudioParamError('id', 'type', ID.source, o.id);
  const expectations = checkArray(o.expectations, 'expectations');
  if (expectations.length < 1)
    throw new AudioParamError('expectations', 'range', 'en az bir mekanik beklenti', 0);
  const guide = checkArray(o.listeningGuide, 'listeningGuide');
  if (guide.length < 1)
    throw new AudioParamError('listeningGuide', 'range', 'en az bir dinleme notu', 0);
  return {
    schema: CANARY_SCHEMA,
    id: o.id,
    version: checkNumber(o.version, 'version', { min: 1, integer: true }),
    title: text(o.title, 'title', 80),
    purpose: text(o.purpose, 'purpose', 400),
    source: checkBase(o.source, 'source'),
    expectations: expectations.map((e, i) => validateCheck(e, `expectations[${i}]`)),
    listeningGuide: guide.map((g, i) => text(g, `listeningGuide[${i}]`, 400)),
  };
}

function canaryFile(repoRoot: string, name: string): string {
  return resolveInside(repoRoot, `${CANARIES_ROOT}/${name}`, name);
}

/** Tanımlar ada göre sıralı; dosya adı `<id>.json` olmak zorunda. */
export function loadCanaries(repoRoot: string): OrganicCanaryV1[] {
  const dir = resolveInside(repoRoot, CANARIES_ROOT, 'canaries');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json') && name !== REVIEWS_FILE)
    .sort()
    .map((name) => {
      const canary = asProtocol(name, () =>
        validateCanary(readJsonFile(canaryFile(repoRoot, name), name)),
      );
      if (`${canary.id}.json` !== name)
        throw new ProtocolError('identity', `dosya adı ${canary.id}.json olmalı`, name);
      return canary;
    });
}

export interface CanaryResultV1 {
  readonly id: string;
  readonly version: number;
  readonly programHash: Sha256;
  readonly pcmHash: Sha256;
  readonly pass: boolean;
  readonly checks: readonly {
    readonly kind: string;
    readonly pass: boolean;
    readonly measured: unknown;
    readonly reason: string | null;
  }[];
}

export function runCanary(
  canary: OrganicCanaryV1,
  samples?: SampleResolver,
): {
  result: CanaryResultV1;
  render: ProgramRender;
} {
  const program = materialize(canary.source, [], {});
  const render = renderProgram(program, { samples });
  const report = analyzeAudio(render.channels, render.sampleRate, 'source-pcm');
  const checks = evaluateChecks(canary.expectations, render, report).map((r) => ({
    kind: r.check.kind,
    pass: r.pass,
    measured: r.measured,
    reason: r.reason,
  }));
  return {
    result: {
      id: canary.id,
      version: canary.version,
      programHash: hashCanonical(program),
      pcmHash: hashPcm(render.channels, render.sampleRate),
      pass: checks.every((c) => c.pass),
      checks,
    },
    render,
  };
}

/** Bütün canary'leri koşturur; `audition` ile dinleme kopyaları export/ altına. */
export function runCanaries(
  repoRoot: string,
  options: { audition?: boolean } = {},
): CanaryResultV1[] {
  const samples = repoSampleResolver(repoRoot);
  return loadCanaries(repoRoot).map((canary) => {
    const { result, render } = runCanary(canary, samples);
    if (options.audition)
      writeAuditionCopy(repoRoot, `${CANARY_AUDITION_ROOT}/${canary.id}.wav`, render);
    return result;
  });
}

export function validateReviews(value: unknown): CanaryReviewsV1 {
  const o = checkObject(value, 'reviews', ['schema', 'reviews']);
  if (o.schema !== CANARY_REVIEWS_SCHEMA)
    throw new AudioParamError('schema', 'type', `"${CANARY_REVIEWS_SCHEMA}" olmalı`, o.schema);
  const raw = checkObject(o.reviews, 'reviews', Object.keys((o.reviews as object) ?? {}));
  const reviews: Record<string, CanaryReviewV1> = {};
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
  return { schema: CANARY_REVIEWS_SCHEMA, reviews };
}

export interface CanaryReviewState extends CanaryReviewV1 {
  readonly id: string;
  /** İnceleme canary'nin güncel sürümüne ait değilse `pending-human` sayılır. */
  readonly stale: boolean;
}

export function canaryReviews(repoRoot: string): CanaryReviewState[] {
  const file = canaryFile(repoRoot, REVIEWS_FILE);
  const stored = existsSync(file) ? validateReviews(readJsonFile(file, REVIEWS_FILE)).reviews : {};
  return loadCanaries(repoRoot).map((c) => {
    const r = stored[c.id];
    if (!r)
      return { id: c.id, status: 'pending-human', version: c.version, note: null, stale: false };
    const stale = r.version !== c.version;
    return { id: c.id, ...r, status: stale ? 'pending-human' : r.status, stale };
  });
}

/** İnsan dinleme beyanını kaydeder (yalnız bu komutla; agent kendi dinlemesini yazamaz). */
export function recordCanaryReview(
  repoRoot: string,
  id: string,
  status: CanaryReviewStatus,
  note: string | null,
): CanaryReviewsV1 {
  const canary = loadCanaries(repoRoot).find((c) => c.id === id);
  if (!canary) throw new ProtocolError('not-found', `canary yok: ${id}`, CANARIES_ROOT);
  const dir = resolveInside(repoRoot, CANARIES_ROOT, 'canaries');
  return withLock(dir, CANARIES_ROOT, () => {
    const file = canaryFile(repoRoot, REVIEWS_FILE);
    const current = existsSync(file)
      ? validateReviews(readJsonFile(file, REVIEWS_FILE)).reviews
      : {};
    const next = asProtocol('review', () =>
      validateReviews({
        schema: CANARY_REVIEWS_SCHEMA,
        reviews: { ...current, [id]: { status, version: canary.version, note } },
      }),
    );
    writeFileAtomic(file, prettyCanonicalJson(next));
    return next;
  });
}
