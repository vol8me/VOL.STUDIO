import { CHECKS_VERSION, evaluateChecks, type MechanicalCheckV1 } from '../analysis/checks';
import { ONSET_METHOD, PITCH_METHOD } from '../analysis/descriptors';
import { summarizeAudio, type DescriptorSummaryV1 } from '../analysis/summary';
import { analyzeAudio, ANALYZER_VERSION, type AudioAnalysisReportV1 } from '../analysis/report';
import { AudioParamError } from '../guard/errors';
import { checkArray, checkChoice, checkNumber, checkObject } from '../guard/read';
import type { BatchBudget, BatchEstimate } from '../guard/batch';
import { describeRegistry } from '../program/describe';
import type { DimensionValue } from '../program/dimensions';
import { SUBSTREAM_SCHEME } from '../program/random';
import { PROGRAM_RENDERER_VERSION, renderProgram, type ProgramRender } from '../program/render';
import { hashCanonical, hashPcm, HASH_PATTERN, type Sha256 } from '../protocol/canonical';
import {
  CANDIDATE_ID,
  type BudgetVerdictV1,
  type CandidateCostV1,
  type CandidateRejectionV1,
  type PlannedCandidate,
  type SearchPlan,
} from './plan';

export const SEARCH_REPORT_SCHEMA = 'AcousticSearchReportV1';

/**
 * Aşama 2 — yürütme SERİdir (paralellik Dalga 13'ündür): her geçerli aday
 * kendi programıyla (tohum ezilmeden) render edilir, kanonik analizörle
 * ölçülür ve spec filtrelerinden geçirilir. Rapor kanoniktir: zaman damgası,
 * süre ölçümü ya da yol taşımaz; aynı spec + motor aynı baytları verir.
 *
 * Aday durumu MEKANİKTİR: `invalid` (render öncesi), `filtered` (mekanik
 * filtre), `error` (render/analiz hatası), `passed`. İnsan kararı
 * (onay/ret/bekliyor) ayrı `SearchSelectionV1` belgesindedir.
 */
export type SearchCandidateState = 'invalid' | 'filtered' | 'error' | 'passed';

export interface CheckOutcomeV1 {
  readonly filter: number;
  readonly kind: MechanicalCheckV1['kind'];
  readonly pass: boolean;
  readonly measured: number | readonly (number | null)[] | null;
  readonly reason: string | null;
}

export interface SearchCandidateV1 {
  readonly ordinal: number;
  readonly point: readonly number[];
  readonly values: Readonly<Record<string, DimensionValue>>;
  readonly candidateId: string | null;
  readonly programHash: Sha256 | null;
  readonly state: SearchCandidateState;
  readonly rejection: CandidateRejectionV1 | null;
  readonly cost: CandidateCostV1 | null;
  readonly risks: readonly string[];
  readonly render: {
    readonly pcmHash: Sha256;
    readonly sampleRate: number;
    readonly channels: number;
    readonly frames: number;
  } | null;
  readonly descriptors: DescriptorSummaryV1 | null;
  readonly checks: readonly CheckOutcomeV1[] | null;
}

export interface AcousticSearchReportV1 {
  readonly schema: typeof SEARCH_REPORT_SCHEMA;
  readonly searchId: string;
  readonly specHash: Sha256;
  readonly base: { readonly kind: 'archetype' | 'program'; readonly hash: Sha256 };
  readonly strategy: { readonly id: string; readonly version: number };
  readonly seed: number;
  readonly dimensions: readonly string[];
  readonly engine: {
    readonly rendererVersion: number;
    readonly analyzerVersion: number;
    readonly checksVersion: number;
    readonly registryHash: Sha256;
    readonly substreamScheme: string;
    readonly descriptorMethods: { readonly pitch: string; readonly onsets: string };
  };
  readonly preflight: {
    readonly requested: number;
    readonly valid: number;
    readonly invalid: number;
    readonly estimate: BatchEstimate;
    readonly budget: BatchBudget;
    readonly verdict: BudgetVerdictV1;
  };
  readonly candidates: readonly SearchCandidateV1[];
  readonly summary: Readonly<Record<SearchCandidateState, number>>;
}

function base(
  candidate: PlannedCandidate,
): Omit<SearchCandidateV1, 'state' | 'rejection' | 'render' | 'descriptors' | 'checks'> {
  const { ordinal, point, values, candidateId, programHash, cost, risks } = candidate;
  return { ordinal, point, values, candidateId, programHash, cost, risks };
}

function failure(stage: 'render' | 'analysis', error: unknown): CandidateRejectionV1 {
  const e = error instanceof Error ? error : new Error(String(error));
  return {
    stage,
    code: e.name,
    path: error instanceof AudioParamError ? error.path : null,
    message: e.message,
  };
}

export interface ExecuteHooks {
  /** Render başarılı olduğunda (ör. git-dışı dinleme kopyası yazmak için). */
  readonly onRender?: (candidateId: string, render: ProgramRender) => void;
}

/** Planın geçerli adaylarını sırayla render eder, ölçer ve filtreler. */
export function executeSearch(plan: SearchPlan, hooks: ExecuteHooks = {}): SearchCandidateV1[] {
  const filters = plan.spec.filters ?? [];
  return plan.candidates.map((candidate): SearchCandidateV1 => {
    const head = base(candidate);
    const none = { render: null, descriptors: null, checks: null };
    if (candidate.invalid || !candidate.program || !candidate.candidateId) {
      return { ...head, ...none, state: 'invalid', rejection: candidate.invalid };
    }
    let rendered: ProgramRender;
    try {
      rendered = renderProgram(candidate.program);
    } catch (error) {
      return { ...head, ...none, state: 'error', rejection: failure('render', error) };
    }
    const render = {
      pcmHash: hashPcm(rendered.channels, rendered.sampleRate),
      sampleRate: rendered.sampleRate,
      channels: rendered.channels.length,
      frames: rendered.channels[0].length,
    };
    hooks.onRender?.(candidate.candidateId, rendered);
    let report: AudioAnalysisReportV1;
    let descriptors: DescriptorSummaryV1;
    try {
      report = analyzeAudio(rendered.channels, rendered.sampleRate, 'source-pcm');
      descriptors = summarizeAudio(rendered.channels, rendered.sampleRate, report);
    } catch (error) {
      return { ...head, ...none, render, state: 'error', rejection: failure('analysis', error) };
    }
    const results = evaluateChecks(filters, rendered, report);
    const checks = results.map((r, i) => ({
      filter: i,
      kind: r.check.kind,
      pass: r.pass,
      measured: r.measured,
      reason: r.reason,
    }));
    const failed = checks.find((c) => !c.pass);
    return {
      ...head,
      render,
      descriptors,
      checks,
      state: failed ? 'filtered' : 'passed',
      rejection: failed
        ? {
            stage: 'filter',
            code: failed.kind,
            path: `filters[${failed.filter}]`,
            message: failed.reason ?? failed.kind,
          }
        : null,
    };
  });
}

export function buildSearchReport(
  plan: SearchPlan,
  candidates: readonly SearchCandidateV1[],
): AcousticSearchReportV1 {
  const count = (state: SearchCandidateState) => candidates.filter((c) => c.state === state).length;
  const invalid = plan.candidates.filter((c) => c.invalid !== null).length;
  return {
    schema: SEARCH_REPORT_SCHEMA,
    searchId: plan.spec.searchId,
    specHash: plan.specHash,
    base: { kind: plan.spec.base.kind, hash: plan.baseHash },
    strategy: plan.spec.strategy,
    seed: plan.spec.seed,
    dimensions: plan.spec.dimensions.map((d) => d.name),
    engine: {
      rendererVersion: PROGRAM_RENDERER_VERSION,
      analyzerVersion: ANALYZER_VERSION,
      checksVersion: CHECKS_VERSION,
      registryHash: hashCanonical(describeRegistry()),
      substreamScheme: SUBSTREAM_SCHEME,
      descriptorMethods: { pitch: PITCH_METHOD, onsets: ONSET_METHOD },
    },
    preflight: {
      requested: plan.spec.candidates,
      valid: plan.candidates.length - invalid,
      invalid,
      estimate: plan.estimate,
      budget: plan.budget,
      verdict: plan.verdict,
    },
    candidates,
    summary: {
      passed: count('passed'),
      filtered: count('filtered'),
      error: count('error'),
      invalid: count('invalid'),
    },
  };
}

function checkHashValue(value: unknown, path: string): Sha256 {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value))
    throw new AudioParamError(path, 'type', 'sha256 özeti', value);
  return value as Sha256;
}

/**
 * Diskten okunan raporun yapısal denetimi. Bütünlük (spec özeti, program
 * dosyaları, yeniden planlama) protokol katmanında ayrıca sınanır; burada
 * aşağı akışın okuduğu alanların tipi garanti edilir.
 */
export function validateSearchReport(value: unknown): AcousticSearchReportV1 {
  const o = checkObject(value, 'report', [
    'schema',
    'searchId',
    'specHash',
    'base',
    'strategy',
    'seed',
    'dimensions',
    'engine',
    'preflight',
    'candidates',
    'summary',
  ]);
  if (o.schema !== SEARCH_REPORT_SCHEMA)
    throw new AudioParamError('schema', 'type', `"${SEARCH_REPORT_SCHEMA}" olmalı`, o.schema);
  checkHashValue(o.specHash, 'specHash');
  checkArray(o.candidates, 'candidates').forEach((c, i) => {
    const at = `candidates[${i}]`;
    const co = checkObject(c, at, [
      'ordinal',
      'point',
      'values',
      'candidateId',
      'programHash',
      'state',
      'rejection',
      'cost',
      'risks',
      'render',
      'descriptors',
      'checks',
    ]);
    checkNumber(co.ordinal, `${at}.ordinal`, { min: 0, integer: true });
    const state = checkChoice(co.state, `${at}.state`, [
      'invalid',
      'filtered',
      'error',
      'passed',
    ] as const);
    if (
      co.candidateId !== null &&
      (typeof co.candidateId !== 'string' || !CANDIDATE_ID.test(co.candidateId))
    ) {
      throw new AudioParamError(`${at}.candidateId`, 'type', CANDIDATE_ID.source, co.candidateId);
    }
    if (co.programHash !== null) checkHashValue(co.programHash, `${at}.programHash`);
    if (state !== 'invalid' && co.candidateId === null)
      throw new AudioParamError(
        `${at}.candidateId`,
        'required',
        'render edilen adayın kimliği',
        null,
      );
    if (co.render !== null) {
      checkHashValue(
        checkObject(co.render, `${at}.render`, ['pcmHash', 'sampleRate', 'channels', 'frames'])
          .pcmHash,
        `${at}.render.pcmHash`,
      );
    }
  });
  return value as AcousticSearchReportV1;
}
