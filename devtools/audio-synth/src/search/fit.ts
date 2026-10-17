import type { DescriptorSummaryV1 } from '../analysis/summary';
import { AudioParamError } from '../guard/errors';
import { checkArray, checkChoice, checkNumber, checkObject } from '../guard/read';
import type { BatchBudget } from '../guard/batch';
import {
  checkBase,
  checkDimensions,
  type DimensionV1,
  type DimensionValue,
  type ProgramBaseV1,
} from '../program/dimensions';
import { hashCanonical, HASH_PATTERN, type Sha256 } from '../kernel/canonical';
import { PROGRAM_RENDERER_VERSION } from '../program/render';
import { ANALYZER_VERSION } from '../analysis/report';
import { registryRenderHash } from '../program/surface';
import { SUBSTREAM_SCHEME } from '../program/random';
import { ONSET_METHOD, PITCH_METHOD } from '../analysis/descriptors';
import { validateCheck, CHECKS_VERSION, type MechanicalCheckV1 } from '../analysis/checks';
import { checkBudget, SEARCH_ID } from './spec';

export const FIT_SPEC_SCHEMA = 'AcousticFitSpecV1';
export const FIT_REPORT_SCHEMA = 'AcousticFitReportV1';
export const MAX_FIT_CANDIDATES = 64;
export const MAX_FIT_ROUNDS = 8;

/**
 * Referans-uydurma (inverse synthesis) deneyi — ARAŞTIRMA KAPISI.
 *
 * Hedef, bir sesin mekanik betimleyici vektörüdür (`DescriptorSummaryV1`
 * alanları): pitch/zarf/spektral/zamansal ölçüler. Eniyileme bu vektöre
 * ağırlıklı, ölçekli RMS uzaklığını küçültür; estetik yargı içermez ve
 * hiçbir production kararını tek başına vermez.
 *
 * Algoritma deterministik "zoom" taramasıdır: tur 0 tam birim küpü
 * karışık Halton ile tarar; sonraki her tur en iyi nokta etrafında
 * `shrink` oranında daralan kutuyu tarar. Görev sahibi nokta her tura
 * elit olarak taşınır, dolayısıyla en iyi uzaklık asla kötüleşmez.
 * Sinirsel bağımlılık YOKTUR.
 */
export interface FitTargetEntryV1 {
  readonly value: number | null;
  readonly weight: number;
}

export interface AcousticFitSpecV1 {
  readonly schema: typeof FIT_SPEC_SCHEMA;
  readonly fitId: string;
  readonly description?: string;
  readonly base: ProgramBaseV1;
  readonly seed: number;
  readonly dimensions: readonly DimensionV1[];
  readonly target: {
    /** Repo-göreli manifest yolu; verilince alan değerleri ondan okunur. */
    readonly manifest?: string;
    readonly descriptors: Readonly<Record<string, FitTargetEntryV1>>;
  };
  readonly search: {
    /** Tur başına yeni nokta (görev sahibi nokta ekstradır). */
    readonly candidates: number;
    readonly rounds: number;
    /** Turda arama kutusunun daralma oranı (0,1). */
    readonly shrink: number;
  };
  /** Yakınsama eşiği: normalize RMS uzaklığı bunun altına inerse 'converged'. */
  readonly tolerance: number;
  readonly filters?: readonly MechanicalCheckV1[];
  readonly budget?: Partial<BatchBudget>;
}

/** Hedef olarak kullanılabilir betimleyici alanları ve normalize genişlikleri. */
export const FIT_DESCRIPTOR_SCALES = {
  durationSeconds: { kind: 'log2', width: 1 },
  activeSeconds: { kind: 'log2', width: 1 },
  attackSeconds: { kind: 'log2', width: 1 },
  decay40Seconds: { kind: 'log2', width: 1 },
  maxMomentaryLufs: { kind: 'linear', width: 6 },
  integratedLufs: { kind: 'linear', width: 6 },
  truePeakDbtp: { kind: 'linear', width: 3 },
  crestFactorDb: { kind: 'linear', width: 6 },
  centroidHz: { kind: 'log2', width: 0.5 },
  rolloff85Hz: { kind: 'log2', width: 0.5 },
  spectralPeakHz: { kind: 'log2', width: 0.5 },
  pitchHz: { kind: 'log2', width: 0.25 },
  flatness: { kind: 'linear', width: 0.25 },
  pitchConfidence: { kind: 'linear', width: 0.25 },
  onsetsPerSecond: { kind: 'log2', width: 1 },
  clicks: { kind: 'linear', width: 8 },
  clippedSamples: { kind: 'linear', width: 4800 },
} as const;

export type FitDescriptorName = keyof typeof FIT_DESCRIPTOR_SCALES;
export const FIT_DESCRIPTOR_NAMES = Object.keys(FIT_DESCRIPTOR_SCALES) as FitDescriptorName[];

/** Manifest `analysis.encoded` raporundan betimleyici alanı okuma haritası. */
export const FIT_MANIFEST_FIELDS: Record<string, readonly string[]> = {
  durationSeconds: ['format', 'durationSeconds'],
  activeSeconds: ['temporal', 'activeSeconds'],
  attackSeconds: ['temporal', 'attackSeconds'],
  decay40Seconds: ['temporal', 'decay40Seconds'],
  maxMomentaryLufs: ['level', 'maxMomentaryLufs'],
  integratedLufs: ['level', 'integratedLufs'],
  truePeakDbtp: ['level', 'truePeakDbtp'],
  crestFactorDb: ['level', 'crestFactorDb'],
  centroidHz: ['spectral', 'centroidHz'],
  rolloff85Hz: ['spectral', 'rolloff85Hz'],
  flatness: ['spectral', 'flatness'],
  spectralPeakHz: ['spectral', 'peakHz'],
  clicks: ['defects', 'clicks', 'count'],
  clippedSamples: ['defects', 'clips', 'channelSamples'],
};

const EPSILON = 1e-9;

/** Tek betimleyicide normalize uzaklık: genişlik farkı başına 1.0. */
export function descriptorDelta(
  name: FitDescriptorName,
  measured: number | null,
  target: number | null,
): number {
  if (target === null || measured === null) return target === measured ? 0 : 1;
  const scale = FIT_DESCRIPTOR_SCALES[name];
  const diff =
    scale.kind === 'log2'
      ? Math.abs(Math.log2((measured + EPSILON) / (target + EPSILON)))
      : Math.abs(measured - target);
  const delta = diff / scale.width;
  return Number.isFinite(delta) ? delta : 16;
}

/**
 * Ağırlıklı, normalize RMS uzaklığı ve betimleyici başına delta tablosu.
 * `null`↔`number` uyuşmazlığı (ör. hedef perdeli, aday perdesiz) o alanda
 * 1 birim cezadır.
 */
export function descriptorDistance(
  measured: DescriptorSummaryV1,
  target: Readonly<Record<string, FitTargetEntryV1>>,
): { distance: number; deltas: Record<string, number> } {
  let sumW = 0;
  let sum = 0;
  const deltas: Record<string, number> = {};
  for (const [name, entry] of Object.entries(target)) {
    const delta = descriptorDelta(
      name as FitDescriptorName,
      (measured as unknown as Record<string, number | null>)[name],
      entry.value,
    );
    deltas[name] = delta;
    sumW += entry.weight;
    sum += entry.weight * delta * delta;
  }
  return { distance: Math.sqrt(sum / sumW), deltas };
}

/** Görev sahibi nokta etrafında `factor^round` genişliğinde kutu (birim küpte kalır). */
export function fitBox(
  center: readonly number[],
  spans: readonly number[],
): { lo: number[]; hi: number[] } {
  const lo: number[] = [];
  const hi: number[] = [];
  for (let d = 0; d < center.length; d++) {
    const half = spans[d] / 2;
    lo.push(Math.max(0, center[d] - half));
    hi.push(Math.min(1, center[d] + half));
    if (lo[d] >= hi[d]) lo[d] = Math.max(0, hi[d] - 1e-9);
  }
  return { lo, hi };
}

export type FitVerdict = 'converged' | 'exhausted' | 'no-evaluable';

export interface FitRoundV1 {
  readonly round: number;
  readonly span: number;
  readonly evaluated: number;
  readonly bestDistance: number | null;
  readonly bestPoint: readonly number[];
}

/** Raporun en iyi satırı için gereken aday kimliği/verisi. */
export interface FitScoredEntry {
  readonly candidateId: string | null;
  readonly programHash: Sha256 | null;
  readonly point: readonly number[];
  readonly values: Readonly<Record<string, DimensionValue>>;
}

export interface AcousticFitReportV1 {
  readonly schema: typeof FIT_REPORT_SCHEMA;
  readonly fitId: string;
  readonly specHash: Sha256;
  readonly base: { readonly kind: 'archetype' | 'program'; readonly hash: Sha256 };
  readonly seed: number;
  readonly dimensions: readonly string[];
  readonly target: {
    readonly source: 'descriptors' | 'manifest';
    readonly hash: Sha256;
    readonly descriptors: Readonly<Record<string, FitTargetEntryV1>>;
  };
  readonly engine: {
    readonly rendererVersion: number;
    readonly analyzerVersion: number;
    readonly checksVersion: number;
    readonly registryHash: Sha256;
    readonly substreamScheme: string;
    readonly descriptorMethods: { readonly pitch: string; readonly onsets: string };
  };
  readonly tolerance: number;
  readonly rounds: readonly FitRoundV1[];
  readonly evaluated: number;
  readonly best: {
    readonly candidateId: string | null;
    readonly programHash: Sha256 | null;
    readonly point: readonly number[] | null;
    readonly values: Readonly<Record<string, unknown>> | null;
    readonly distance: number | null;
    readonly deltas: Record<string, number> | null;
  };
  readonly verdict: FitVerdict;
}

export function buildFitReport(
  spec: AcousticFitSpecV1,
  specHash: Sha256,
  baseHash: Sha256,
  resolved: Readonly<Record<string, FitTargetEntryV1>>,
  source: 'descriptors' | 'manifest',
  rounds: readonly FitRoundV1[],
  scored: readonly { entry: FitScoredEntry; distance: number; deltas: Record<string, number> }[],
): AcousticFitReportV1 {
  const best = scored.length ? scored.reduce((a, b) => (b.distance < a.distance ? b : a)) : null;
  const verdict: FitVerdict =
    scored.length === 0
      ? 'no-evaluable'
      : best!.distance <= spec.tolerance
        ? 'converged'
        : 'exhausted';
  return {
    schema: FIT_REPORT_SCHEMA,
    fitId: spec.fitId,
    specHash,
    base: { kind: spec.base.kind, hash: baseHash },
    seed: spec.seed,
    dimensions: spec.dimensions.map((d) => d.name),
    target: {
      source,
      hash: hashCanonical(resolved),
      descriptors: resolved,
    },
    engine: {
      rendererVersion: PROGRAM_RENDERER_VERSION,
      analyzerVersion: ANALYZER_VERSION,
      checksVersion: CHECKS_VERSION,
      registryHash: registryRenderHash(),
      substreamScheme: SUBSTREAM_SCHEME,
      descriptorMethods: { pitch: PITCH_METHOD, onsets: ONSET_METHOD },
    },
    tolerance: spec.tolerance,
    rounds,
    evaluated: scored.length,
    best: {
      candidateId: best?.entry.candidateId ?? null,
      programHash: best?.entry.programHash ?? null,
      point: best?.entry.point ?? null,
      values: best ? { ...best.entry.values } : null,
      distance: best?.distance ?? null,
      deltas: best?.deltas ?? null,
    },
    verdict,
  };
}

const MAX_TARGET_FIELDS = FIT_DESCRIPTOR_NAMES.length;
const MAX_FILTERS = 32;

function checkTarget(value: unknown, path: string): AcousticFitSpecV1['target'] {
  const o = checkObject(value, path, ['manifest', 'descriptors']);
  const manifest =
    o.manifest === undefined
      ? undefined
      : (() => {
          if (
            typeof o.manifest !== 'string' ||
            o.manifest.length === 0 ||
            o.manifest.length > 400
          ) {
            throw new AudioParamError(`${path}.manifest`, 'type', 'repo-göreli yol', o.manifest);
          }
          return o.manifest;
        })();
  const raw =
    typeof o.descriptors === 'object' && o.descriptors !== null && !Array.isArray(o.descriptors)
      ? (o.descriptors as Record<string, unknown>)
      : (() => {
          throw new AudioParamError(`${path}.descriptors`, 'type', 'nesne olmalı', o.descriptors);
        })();
  const names = Object.keys(raw);
  if (names.length < 1 || names.length > MAX_TARGET_FIELDS) {
    throw new AudioParamError(
      `${path}.descriptors`,
      'range',
      `1…${MAX_TARGET_FIELDS} betimleyici`,
      names.length,
    );
  }
  const descriptors: Record<string, FitTargetEntryV1> = {};
  for (const name of names) {
    const at = `${path}.descriptors.${name}`;
    if (!FIT_DESCRIPTOR_NAMES.includes(name as FitDescriptorName)) {
      throw new AudioParamError(at, 'unknown-id', 'betimleyici alanı değil', name);
    }
    const entry = raw[name];
    const eo =
      typeof entry === 'number'
        ? { value: entry, weight: undefined }
        : checkObject(entry, at, ['value', 'weight']);
    if (manifest === undefined && typeof eo.value !== 'number') {
      throw new AudioParamError(
        `${at}.value`,
        'required',
        'manifestsiz hedef değer ister',
        eo.value,
      );
    }
    if (eo.value !== undefined && eo.value !== null && typeof eo.value !== 'number') {
      throw new AudioParamError(`${at}.value`, 'type', 'sayı ya da null', eo.value);
    }
    const weight =
      eo.weight === undefined ? 1 : checkNumber(eo.weight, `${at}.weight`, { above: 0, max: 100 });
    if (manifest !== undefined && !FIT_MANIFEST_FIELDS[name]) {
      throw new AudioParamError(
        at,
        'combination',
        'manifest raporu bu betimleyiciyi taşımaz (pitchHz/onsetsPerSecond dahil değil)',
        name,
      );
    }
    descriptors[name] = {
      value: eo.value ?? null,
      weight,
    };
  }
  return {
    ...(manifest === undefined ? {} : { manifest }),
    descriptors,
  };
}

export function validateFitSpec(value: unknown): AcousticFitSpecV1 {
  const o = checkObject(value, '', [
    'schema',
    'fitId',
    'description',
    'base',
    'seed',
    'dimensions',
    'target',
    'search',
    'tolerance',
    'filters',
    'budget',
  ]);
  if (o.schema !== FIT_SPEC_SCHEMA) {
    throw new AudioParamError('schema', 'type', `"${FIT_SPEC_SCHEMA}" olmalı`, o.schema);
  }
  if (typeof o.fitId !== 'string' || !SEARCH_ID.test(o.fitId)) {
    throw new AudioParamError('fitId', 'type', `${SEARCH_ID.source} kalıbına uymalı`, o.fitId);
  }
  if (
    o.description !== undefined &&
    (typeof o.description !== 'string' || o.description.length > 2000)
  ) {
    throw new AudioParamError('description', 'type', 'en çok 2000 karakter', o.description);
  }
  const base = checkBase(o.base, 'base');
  const dimensions = checkDimensions(o.dimensions, 'dimensions', base);
  const target = checkTarget(o.target, 'target');
  const s = checkObject(o.search, 'search', ['candidates', 'rounds', 'shrink']);
  const filters = o.filters === undefined ? undefined : checkArray(o.filters, 'filters');
  if (filters && filters.length > MAX_FILTERS)
    throw new AudioParamError('filters', 'range', `en çok ${MAX_FILTERS}`, filters.length);
  return {
    schema: FIT_SPEC_SCHEMA,
    fitId: o.fitId,
    ...(o.description === undefined ? {} : { description: o.description }),
    base,
    seed: checkNumber(o.seed, 'seed', { min: 0, max: 0xffff_ffff, integer: true }),
    dimensions,
    target,
    search: {
      candidates: checkNumber(s.candidates, 'search.candidates', {
        min: 1,
        max: MAX_FIT_CANDIDATES,
        integer: true,
      }),
      rounds: checkNumber(s.rounds, 'search.rounds', {
        min: 1,
        max: MAX_FIT_ROUNDS,
        integer: true,
      }),
      shrink: checkNumber(s.shrink, 'search.shrink', { above: 0, max: 1 }),
    },
    tolerance: checkNumber(o.tolerance, 'tolerance', { above: 0, max: 16 }),
    ...(filters ? { filters: filters.map((f, i) => validateCheck(f, `filters[${i}]`)) } : {}),
    ...(o.budget === undefined ? {} : { budget: checkBudget(o.budget) }),
  };
}

/** Raporun yapısal denetimi — bütünlük protokol katmanında sınanır. */
export function validateFitReport(value: unknown): AcousticFitReportV1 {
  const o = checkObject(value, 'report', [
    'schema',
    'fitId',
    'specHash',
    'base',
    'seed',
    'dimensions',
    'target',
    'engine',
    'tolerance',
    'rounds',
    'evaluated',
    'best',
    'verdict',
  ]);
  if (o.schema !== FIT_REPORT_SCHEMA)
    throw new AudioParamError('schema', 'type', `"${FIT_REPORT_SCHEMA}" olmalı`, o.schema);
  checkHash(o.specHash, 'specHash');
  checkHash(
    o.target === undefined ? '' : ((o.target as { hash?: string }).hash ?? ''),
    'target.hash',
  );
  checkChoice(o.verdict, 'verdict', ['converged', 'exhausted', 'no-evaluable'] as const);
  return value as AcousticFitReportV1;
}

function checkHash(value: unknown, path: string): void {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    throw new AudioParamError(path, 'type', 'sha256 özeti', value);
  }
}
