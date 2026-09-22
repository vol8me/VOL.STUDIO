import {
  ANALYSIS_WORK_PER_SAMPLE,
  assertBatchBudget,
  BatchBudgetError,
  estimateBatch,
  type BatchBudget,
  type BatchEstimate,
  type BatchResource,
} from '../guard/batch';
import { assertRenderBudget, RenderBudgetError } from '../guard/budget';
import { AudioParamError } from '../guard/errors';
import {
  baseDocument,
  isIntegerDimension,
  materialize,
  valueAt,
  type DimensionValue,
} from '../program/dimensions';
import { limitationRisks } from '../program/limitations';
import { estimateProgramCost, PROGRAM_RENDERER_VERSION } from '../program/render';
import { resolveProgram, type AcousticProgramV1 } from '../program/schema';
import { hashCanonical, type Sha256 } from '../protocol/canonical';
import { effectiveBudget, excludedBy, SEARCH_SPEC_SCHEMA, type AcousticSearchSpecV1 } from './spec';
import { strategyPoints } from './strategy';

/**
 * Aşama 1 — plan/ön-denetim. Hiçbir aday render EDİLMEZ: noktalar üretilir,
 * programlar oluşturulup doğrulanır, geçersizler sınıflanır, her geçerli
 * adayın maliyeti Dalga 0 modeliyle tahmin edilir ve toplu bütçe bütün
 * plan üzerinden bir kez sınanır. Bütçe aşımı yürütmeden önce adıyla
 * reddedilir; plan hiçbir dosya yazmaz.
 */
export type RejectionStage =
  | 'constraint'
  | 'materialize'
  | 'render-budget'
  | 'duplicate'
  | 'render'
  | 'analysis'
  | 'filter';

export interface CandidateRejectionV1 {
  readonly stage: RejectionStage;
  readonly code: string;
  readonly path: string | null;
  readonly message: string;
}

export interface CandidateCostV1 {
  readonly renderWorkUnits: number;
  readonly analysisWorkUnits: number;
  readonly peakBytes: number;
  readonly samples: number;
}

export interface PlannedCandidate {
  readonly ordinal: number;
  /** Birim küp koordinatları, boyut adı sırasıyla. */
  readonly point: readonly number[];
  readonly values: Readonly<Record<string, DimensionValue>>;
  readonly program: AcousticProgramV1 | null;
  readonly programHash: Sha256 | null;
  readonly candidateId: string | null;
  readonly cost: CandidateCostV1 | null;
  readonly risks: readonly string[];
  readonly invalid: CandidateRejectionV1 | null;
}

export interface BudgetVerdictV1 {
  readonly withinBudget: boolean;
  readonly resource: BatchResource | null;
  readonly estimate: number | null;
  readonly limit: number | null;
}

export interface SearchPlan {
  readonly spec: AcousticSearchSpecV1;
  readonly specHash: Sha256;
  readonly baseHash: Sha256;
  readonly candidates: readonly PlannedCandidate[];
  readonly estimate: BatchEstimate;
  readonly budget: BatchBudget;
  readonly verdict: BudgetVerdictV1;
}

export const CANDIDATE_ID = /^c-[0-9a-f]{16}$/;

/**
 * Aday kimliği: program özeti + arama tohumu + strateji kimliği/sürümü +
 * render motoru sürümü + arama şeması. Zaman, yol, sıra ya da süre GİRMEZ.
 * Düğüm sürümleri program özetinin içindedir.
 */
export function candidateIdOf(
  programHash: Sha256,
  spec: Pick<AcousticSearchSpecV1, 'seed' | 'strategy'>,
): string {
  const identity = hashCanonical({
    schema: SEARCH_SPEC_SCHEMA,
    programHash,
    searchSeed: spec.seed,
    strategy: spec.strategy,
    rendererVersion: PROGRAM_RENDERER_VERSION,
  });
  return `c-${identity.slice('sha256:'.length, 'sha256:'.length + 16)}`;
}

function rejection(stage: RejectionStage, error: unknown): CandidateRejectionV1 {
  if (error instanceof AudioParamError)
    return { stage, code: error.issue, path: error.path, message: error.message };
  if (error instanceof RenderBudgetError)
    return { stage, code: error.resource, path: null, message: error.message };
  return {
    stage,
    code: error instanceof Error ? error.name : 'error',
    path: null,
    message: String((error as Error)?.message ?? error),
  };
}

export function planSearch(spec: AcousticSearchSpecV1): SearchPlan {
  const integer = spec.dimensions.map((dim) => isIntegerDimension(dim, spec.base));
  const seen = new Map<Sha256, string>();
  const names = spec.dimensions.map((d) => d.name);
  const candidates = strategyPoints(spec.seed, names, spec.candidates).map(
    (point, ordinal): PlannedCandidate => {
      const values = Object.fromEntries(
        spec.dimensions.map((dim, d) => [dim.name, valueAt(dim, point[d], integer[d])]),
      );
      const empty = {
        ordinal,
        point,
        values,
        program: null,
        programHash: null,
        candidateId: null,
        cost: null,
        risks: [],
      };
      const rule = excludedBy(spec, values);
      if (rule !== null) {
        const reason = spec.constraints?.[rule].reason ?? '';
        return {
          ...empty,
          invalid: {
            stage: 'constraint',
            code: 'exclude',
            path: `constraints[${rule}]`,
            message: reason,
          },
        };
      }
      let program: AcousticProgramV1;
      try {
        program = materialize(spec.base, spec.dimensions, values);
      } catch (error) {
        if (!(error instanceof AudioParamError)) throw error;
        return { ...empty, invalid: rejection('materialize', error) };
      }
      const programHash = hashCanonical(program);
      const resolved = resolveProgram(program);
      const cost = estimateProgramCost(resolved);
      const samples = resolved.frames * resolved.channels;
      const planned = {
        ...empty,
        program,
        programHash,
        cost: {
          renderWorkUnits: cost.workUnits,
          analysisWorkUnits: samples * ANALYSIS_WORK_PER_SAMPLE,
          peakBytes: cost.peakBytes,
          samples,
        },
        risks: limitationRisks(resolved),
      };
      const twin = seen.get(programHash);
      if (twin !== undefined) {
        return {
          ...planned,
          invalid: {
            stage: 'duplicate',
            code: 'duplicate-program',
            path: null,
            message: `${twin} ile aynı program`,
          },
        };
      }
      try {
        assertRenderBudget(cost, `aday ${ordinal}`);
      } catch (error) {
        if (!(error instanceof RenderBudgetError)) throw error;
        return { ...planned, invalid: rejection('render-budget', error) };
      }
      const candidateId = candidateIdOf(programHash, spec);
      seen.set(programHash, candidateId);
      return { ...planned, candidateId, invalid: null };
    },
  );
  const valid = candidates.filter((c) => c.invalid === null && c.cost !== null);
  const estimate = estimateBatch(
    valid.map((c) => ({
      cost: { workUnits: c.cost?.renderWorkUnits ?? 0, peakBytes: c.cost?.peakBytes ?? 0 },
      samples: c.cost?.samples ?? 0,
    })),
  );
  const budget = effectiveBudget(spec);
  let verdict: BudgetVerdictV1 = {
    withinBudget: true,
    resource: null,
    estimate: null,
    limit: null,
  };
  try {
    assertBatchBudget({ ...estimate, items: spec.candidates }, budget, `arama ${spec.searchId}`);
  } catch (error) {
    if (!(error instanceof BatchBudgetError)) throw error;
    verdict = {
      withinBudget: false,
      resource: error.resource,
      estimate: error.estimate,
      limit: error.limit,
    };
  }
  return {
    spec,
    specHash: hashCanonical(spec),
    baseHash: hashCanonical(baseDocument(spec.base)),
    candidates,
    estimate,
    budget,
    verdict,
  };
}

/** Yürütme kapısı: bütçe dışı plan HİÇBİR aday render edilmeden adıyla reddedilir. */
export function assertPlanWithinBudget(plan: SearchPlan): void {
  const v = plan.verdict;
  if (!v.withinBudget && v.resource !== null) {
    throw new BatchBudgetError(
      `arama ${plan.spec.searchId}`,
      v.resource,
      v.estimate ?? 0,
      v.limit ?? 0,
    );
  }
}
