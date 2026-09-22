import { AudioParamError } from '../guard/errors';
import { checkArray, checkChoice, checkObject } from '../guard/read';
import { HASH_PATTERN, type Sha256 } from '../protocol/canonical';
import { CANDIDATE_ID } from './plan';
import type { AcousticSearchReportV1 } from './report';

export const SEARCH_SELECTION_SCHEMA = 'SearchSelectionV1';

/**
 * Arama seçimi — production `AudioSelectionV1`den AYRI bir belgedir. Bir
 * aramanın adayları hakkındaki insan/agent kararlarını (onay, ret, etiket,
 * not) taşır; hangi raporun adaylarına dair olduğunu rapor özetiyle bağlar.
 * Rapor değişirse seçim bayatlar ve uygulanmaz. Kaydı olmayan aday
 * `pending`dir. `by` beyandır, kimlik doğrulaması değildir.
 */
export type DecisionState = 'pending' | 'approved' | 'rejected';
export type DecisionAuthor = 'human' | 'agent';

export interface CandidateDecisionV1 {
  readonly state: DecisionState;
  readonly by: DecisionAuthor;
  readonly labels: readonly string[];
  readonly note: string | null;
}

export interface SearchSelectionV1 {
  readonly schema: typeof SEARCH_SELECTION_SCHEMA;
  readonly searchId: string;
  readonly reportHash: Sha256;
  readonly decisions: Readonly<Record<string, CandidateDecisionV1>>;
}

const LABEL = /^[a-z0-9][a-z0-9-]{0,31}$/;
const MAX_LABELS = 8;
export const MAX_NOTE = 1000;

export function validateDecision(value: unknown, path: string): CandidateDecisionV1 {
  const o = checkObject(value, path, ['state', 'by', 'labels', 'note']);
  const labels = checkArray(o.labels, `${path}.labels`).map((label, i) => {
    if (typeof label !== 'string' || !LABEL.test(label)) {
      throw new AudioParamError(
        `${path}.labels[${i}]`,
        'type',
        `${LABEL.source} kalıbına uymalı`,
        label,
      );
    }
    return label;
  });
  if (labels.length > MAX_LABELS)
    throw new AudioParamError(`${path}.labels`, 'range', `en çok ${MAX_LABELS}`, labels.length);
  if (new Set(labels).size !== labels.length)
    throw new AudioParamError(`${path}.labels`, 'combination', 'yinelenen etiket', labels);
  if (o.note !== null && (typeof o.note !== 'string' || o.note.length > MAX_NOTE)) {
    throw new AudioParamError(
      `${path}.note`,
      'type',
      `null ya da en çok ${MAX_NOTE} karakter`,
      o.note,
    );
  }
  return {
    state: checkChoice(o.state, `${path}.state`, ['pending', 'approved', 'rejected'] as const),
    by: checkChoice(o.by, `${path}.by`, ['human', 'agent'] as const),
    labels: [...labels].sort(),
    note: o.note,
  };
}

export function validateSearchSelection(value: unknown): SearchSelectionV1 {
  const o = checkObject(value, 'selection', ['schema', 'searchId', 'reportHash', 'decisions']);
  if (o.schema !== SEARCH_SELECTION_SCHEMA) {
    throw new AudioParamError('schema', 'type', `"${SEARCH_SELECTION_SCHEMA}" olmalı`, o.schema);
  }
  if (typeof o.reportHash !== 'string' || !HASH_PATTERN.test(o.reportHash)) {
    throw new AudioParamError('reportHash', 'type', 'sha256 özeti', o.reportHash);
  }
  const raw = checkObject(o.decisions, 'decisions', Object.keys((o.decisions as object) ?? {}));
  const decisions: Record<string, CandidateDecisionV1> = {};
  for (const id of Object.keys(raw).sort()) {
    if (!CANDIDATE_ID.test(id))
      throw new AudioParamError(`decisions.${id}`, 'type', CANDIDATE_ID.source, id);
    decisions[id] = validateDecision(raw[id], `decisions.${id}`);
  }
  return {
    schema: SEARCH_SELECTION_SCHEMA,
    searchId: o.searchId as string,
    reportHash: o.reportHash as Sha256,
    decisions,
  };
}

/**
 * Kararı uygular. Yalnız raporda `passed` olan adaya karar yazılır: geçersiz,
 * filtrelenmiş ya da hatalı aday render edilmiş sesi temsil etmez veya spec
 * filtresini geçmemiştir — onu onaylamak filtreyi sessizce delmek olurdu.
 */
export function applyDecision(
  report: AcousticSearchReportV1,
  reportHash: Sha256,
  current: SearchSelectionV1 | null,
  candidateId: string,
  decision: CandidateDecisionV1,
): SearchSelectionV1 {
  const candidate = report.candidates.find((c) => c.candidateId === candidateId);
  if (!candidate)
    throw new AudioParamError(
      'candidateId',
      'unknown-id',
      `${report.searchId} aramasında yok`,
      candidateId,
    );
  if (candidate.state !== 'passed') {
    throw new AudioParamError(
      'candidateId',
      'combination',
      `aday ${candidate.state}; yalnız passed adaya karar yazılır`,
      candidateId,
    );
  }
  const kept = current && current.reportHash === reportHash ? current.decisions : {};
  const decisions = { ...kept, [candidateId]: validateDecision(decision, 'decision') };
  const sorted = Object.fromEntries(
    Object.keys(decisions)
      .sort()
      .map((id) => [id, decisions[id]]),
  );
  return {
    schema: SEARCH_SELECTION_SCHEMA,
    searchId: report.searchId,
    reportHash,
    decisions: sorted,
  };
}
