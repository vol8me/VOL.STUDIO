/**
 * Deterministik aday arama laboratuvarı (Dalga 4): sürümlü spec, uzay
 * doldurma stratejisi, plan/ön-denetim, aday değerlendirmesi, seri yürütme,
 * rapor ve arama seçimi. Kalıcılık, terfi, paralel yürütme ve dinleme
 * sunucusu `src/protocol/` altındadır.
 */
export { CANDIDATE_ID, candidateIdOf, planSearch, assertPlanWithinBudget } from './plan';
export type {
  BudgetVerdictV1,
  CandidateCostV1,
  CandidateRejectionV1,
  PlannedCandidate,
  RejectionStage,
  SearchPlan,
} from './plan';
export {
  buildSearchReport,
  evaluateCandidate,
  executeSearch,
  SEARCH_REPORT_SCHEMA,
  validateSearchReport,
} from './report';
export type {
  AcousticSearchReportV1,
  CheckOutcomeV1,
  SearchCandidateState,
  SearchCandidateV1,
} from './report';
export { applyDecision, SEARCH_SELECTION_SCHEMA, validateSearchSelection } from './selection';
export type { CandidateDecisionV1, DecisionState, SearchSelectionV1 } from './selection';
export { effectiveBudget, SEARCH_ID, SEARCH_SPEC_SCHEMA, validateSearchSpec } from './spec';
export type { AcousticSearchSpecV1, ExcludeRuleV1 } from './spec';
export { SEARCH_STRATEGIES, strategyPoints } from './strategy';
export type { SearchStrategyId } from './strategy';
export {
  buildFitReport,
  descriptorDelta,
  descriptorDistance,
  fitBox,
  FIT_DESCRIPTOR_NAMES,
  FIT_DESCRIPTOR_SCALES,
  FIT_MANIFEST_FIELDS,
  FIT_REPORT_SCHEMA,
  FIT_SPEC_SCHEMA,
  MAX_FIT_CANDIDATES,
  MAX_FIT_ROUNDS,
  validateFitReport,
  validateFitSpec,
} from './fit';
export type {
  AcousticFitReportV1,
  AcousticFitSpecV1,
  FitDescriptorName,
  FitRoundV1,
  FitTargetEntryV1,
  FitVerdict,
} from './fit';
export {
  buildSemanticDocument,
  checkSemanticTerms,
  MAX_SEMANTIC_TERM_CHARS,
  MAX_SEMANTIC_TERMS,
  rankedOrder,
  SEMANTIC_REQUEST_SCHEMA,
  SEMANTIC_RESPONSE_SCHEMA,
  SEMANTIC_SCHEMA,
  SEMANTIC_SCORER_ENV,
  semanticRequest,
  validateSemanticResponse,
} from './semantic';
export type {
  SearchSemanticV1,
  SemanticRequestItem,
  SemanticScoreEntryV1,
  SemanticScoreRequestV1,
  SemanticTermsV1,
} from './semantic';
