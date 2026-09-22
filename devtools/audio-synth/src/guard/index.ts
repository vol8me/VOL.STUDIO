/**
 * Render sınırı: parametre doğrulama/çözümleme ve kaynak bütçesi.
 *
 * Buradan geçmeyen veri DSP'ye girmez. Katman yaprak düzeyindedir (yalnız
 * `types`a bağlı); efektler, sentez yapı taşları, motor ve modeller onu
 * import eder, o hiçbirini import etmez.
 */
export { AudioParamError } from './errors';
export type { AudioParamIssue } from './errors';
export { RenderBudgetError, DEFAULT_RENDER_BUDGET } from './budget';
export type { RenderCost, RenderBudget } from './budget';
export {
  ANALYSIS_WORK_PER_SAMPLE,
  assertBatchBudget,
  BatchBudgetError,
  DEFAULT_BATCH_BUDGET,
  estimateBatch,
  SECONDS_PER_WORK_UNIT,
} from './batch';
export type { BatchBudget, BatchEstimate, BatchResource } from './batch';
