/**
 * Deterministik aday arama laboratuvarı (Dalga 4): sürümlü spec, uzay
 * doldurma stratejisi, plan/ön-denetim, seri yürütme, rapor ve arama seçimi.
 * Kalıcılık, terfi ve dinleme sunucusu `src/protocol/` altındadır.
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
