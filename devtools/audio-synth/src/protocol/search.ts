import { existsSync, readdirSync } from 'node:fs';
import { renderProgram } from '../program/render';
import { assertPlanWithinBudget, CANDIDATE_ID, planSearch, type SearchPlan } from '../search/plan';
import {
  buildSearchReport,
  executeSearch,
  validateSearchReport,
  type AcousticSearchReportV1,
  type SearchCandidateV1,
} from '../search/report';
import {
  applyDecision,
  validateSearchSelection,
  type CandidateDecisionV1,
  type SearchSelectionV1,
} from '../search/selection';
import { SEARCH_ID, validateSearchSpec, type AcousticSearchSpecV1 } from '../search/spec';
import { writeAuditionCopy, EXPORT_ROOT } from './audition';
import { hashCanonical, hashPcm, prettyCanonicalJson, type Sha256 } from './canonical';
import { ProtocolError } from './errors';
import { readJsonFile, resolveInside, withLock, writeFileAtomic } from './fs';
import { storeProgram } from './job';
import type { JobLocation } from './location';
import { PROGRAM_ORIGIN_SCHEMA, type ProgramOriginV1 } from './origin';
import { asProtocol } from './records';

/**
 * Arama ağacı: `<searchesRoot>/<searchId>/` altında `spec.json` (normalize),
 * `candidates/<candidateId>.json` (aday programları), `report.json` ve
 * isteğe bağlı `selection.json`. Adaylar production kaydı DEĞİLDİR: job
 * ağacına, render kaydına ya da manifest'e hiçbir şey yazılmaz. Bir aday
 * yalnız `promote` ile bir job'un programı olur ve oradan kanonik akıştan
 * (render → analyze → select → publish) geçer.
 *
 * `report.json` en son yazılır: raporu olmayan dizin yarım kalmış bir
 * koşudur ve aynı spec ile yeniden koşulabilir (çıktılar deterministiktir).
 */
export const DEFAULT_SEARCHES_ROOT = 'devtools/audio-synth/audio-searches';
export const SEARCH_AUDITION_ROOT = `${EXPORT_ROOT}/audio-searches`;
export const SEARCH_STATUS_SCHEMA = 'AcousticSearchStatusV1';

export interface SearchLocation {
  readonly repoRoot: string;
  readonly searchesRoot: string;
  readonly searchId: string;
}

export function searchLabel(loc: SearchLocation): string {
  if (!SEARCH_ID.test(loc.searchId))
    throw new ProtocolError('path', `searchId ${SEARCH_ID.source} kalıbına uymalı`, loc.searchId);
  return `${loc.searchesRoot}/${loc.searchId}`;
}

function searchFile(loc: SearchLocation, relative: string): string {
  return resolveInside(loc.repoRoot, `${searchLabel(loc)}/${relative}`, relative);
}

const candidateFile = (id: string) => `candidates/${id}.json`;

export function auditionPath(searchId: string, candidateId: string): string {
  return `${SEARCH_AUDITION_ROOT}/${searchId}/${candidateId}.wav`;
}

/** Yalnız doğrulama + plan: HİÇBİR dosya yazılmaz, hiçbir aday render edilmez. */
export function previewSearch(document: unknown): SearchPlan {
  return planSearch(asProtocol('spec', () => validateSearchSpec(document)));
}

export interface SearchRunOutcome {
  readonly location: string;
  readonly report: AcousticSearchReportV1;
  readonly reportHash: Sha256;
  readonly auditions: readonly string[];
}

export interface SearchRunOptions {
  readonly audition?: boolean;
}

/**
 * Plan → bütçe kapısı → seri yürütme → kalıcı yazım. Bütçe aşımı dizin
 * AÇILMADAN `BatchBudgetError` verir. Tamamlanmış bir arama üzerine
 * yazılmaz (kararlar ona bağlıdır); yeni tanım yeni `searchId` ister.
 */
export function runSearch(
  repoRoot: string,
  searchesRoot: string,
  document: unknown,
  options: SearchRunOptions = {},
): SearchRunOutcome {
  const plan = previewSearch(document);
  assertPlanWithinBudget(plan);
  const loc: SearchLocation = { repoRoot, searchesRoot, searchId: plan.spec.searchId };
  const dir = resolveInside(repoRoot, searchLabel(loc), 'search');
  return withLock(dir, searchLabel(loc), () => {
    if (existsSync(searchFile(loc, 'report.json'))) {
      throw new ProtocolError(
        'overwrite',
        'arama zaten tamamlanmış; kararlar bu rapora bağlı — yeni tanım yeni searchId ister',
        searchLabel(loc),
      );
    }
    const auditions: string[] = [];
    const candidates = executeSearch(plan, {
      onRender: options.audition
        ? (id, render) =>
            auditions.push(writeAuditionCopy(repoRoot, auditionPath(loc.searchId, id), render))
        : undefined,
    });
    writeFileAtomic(searchFile(loc, 'spec.json'), prettyCanonicalJson(plan.spec));
    for (const candidate of plan.candidates) {
      if (candidate.candidateId && candidate.program) {
        writeFileAtomic(
          searchFile(loc, candidateFile(candidate.candidateId)),
          prettyCanonicalJson(candidate.program),
        );
      }
    }
    const report = buildSearchReport(plan, candidates);
    writeFileAtomic(searchFile(loc, 'report.json'), prettyCanonicalJson(report));
    return { location: searchLabel(loc), report, reportHash: hashCanonical(report), auditions };
  });
}

export interface LoadedSearch {
  readonly spec: AcousticSearchSpecV1;
  readonly report: AcousticSearchReportV1;
  readonly reportHash: Sha256;
}

/** Spec + rapor okunur ve birbirine özetle bağlandığı doğrulanır. */
export function loadSearch(loc: SearchLocation): LoadedSearch {
  const label = searchLabel(loc);
  const reportFile = searchFile(loc, 'report.json');
  if (!existsSync(reportFile))
    throw new ProtocolError('not-found', 'tamamlanmış arama yok (search run)', label);
  const specDoc = readJsonFile(searchFile(loc, 'spec.json'), `${label}/spec.json`);
  const spec = asProtocol(`${label}/spec.json`, () => validateSearchSpec(specDoc));
  const reportDoc = readJsonFile(reportFile, `${label}/report.json`);
  const report = asProtocol(`${label}/report.json`, () => validateSearchReport(reportDoc));
  if (report.searchId !== loc.searchId)
    throw new ProtocolError('identity', `rapor ${report.searchId} aramasına ait`, label);
  if (hashCanonical(spec) !== report.specHash)
    throw new ProtocolError('identity', 'spec.json raporun spec özetiyle uyuşmuyor', label);
  return { spec, report, reportHash: hashCanonical(reportDoc) };
}

function readProgramFile(
  loc: SearchLocation,
  candidateId: string,
): { program: unknown; hash: Sha256 } | null {
  const file = searchFile(loc, candidateFile(candidateId));
  if (!existsSync(file)) return null;
  const program = readJsonFile(file, candidateFile(candidateId));
  return { program, hash: hashCanonical(program) };
}

type SelectionStateName = 'missing' | 'valid' | 'stale' | 'corrupt';

function readSelection(
  loc: SearchLocation,
  reportHash: Sha256,
): { state: SelectionStateName; selection: SearchSelectionV1 | null; reason: string | null } {
  const file = searchFile(loc, 'selection.json');
  if (!existsSync(file)) return { state: 'missing', selection: null, reason: null };
  try {
    const selection = validateSearchSelection(readJsonFile(file, 'selection.json'));
    if (selection.reportHash !== reportHash)
      return { state: 'stale', selection, reason: 'seçim başka bir rapora ait' };
    return { state: 'valid', selection, reason: null };
  } catch (error) {
    return { state: 'corrupt', selection: null, reason: (error as Error).message };
  }
}

export interface SearchCandidateStatus {
  readonly ordinal: number;
  readonly candidateId: string | null;
  readonly state: SearchCandidateV1['state'];
  /** Yalnız `passed` adaya karar verilir; diğerlerinde `null`. */
  readonly decision: CandidateDecisionV1['state'] | null;
  readonly labels: readonly string[];
  readonly note: string | null;
  readonly by: CandidateDecisionV1['by'] | null;
  readonly reason: string | null;
  readonly risks: readonly string[];
}

export interface SearchStatusV1 {
  readonly schema: typeof SEARCH_STATUS_SCHEMA;
  readonly searchId: string;
  readonly search: string;
  readonly specHash: Sha256;
  readonly reportHash: Sha256;
  readonly selection: { readonly state: SelectionStateName; readonly reason: string | null };
  readonly problems: readonly string[];
  readonly summary: AcousticSearchReportV1['summary'] & {
    readonly approved: number;
    readonly rejected: number;
  };
  readonly candidates: readonly SearchCandidateStatus[];
}

/** Arama durumu YALNIZ dosyalardan: bütünlük sorunları, mekanik durum ve kararlar birlikte. */
export function searchStatus(loc: SearchLocation): SearchStatusV1 {
  const { report, reportHash } = loadSearch(loc);
  const problems: string[] = [];
  const known = new Set<string>();
  for (const c of report.candidates) {
    if (!c.candidateId || !c.programHash) continue;
    known.add(`${c.candidateId}.json`);
    const file = readProgramFile(loc, c.candidateId);
    if (!file) problems.push(`aday programı yok: ${candidateFile(c.candidateId)}`);
    else if (file.hash !== c.programHash)
      problems.push(`aday programı rapordan sonra değişti: ${candidateFile(c.candidateId)}`);
  }
  const dir = searchFile(loc, 'candidates');
  if (existsSync(dir)) {
    for (const entry of readdirSync(dir))
      if (!known.has(entry)) problems.push(`raporda olmayan dosya: candidates/${entry}`);
  }
  const sel = readSelection(loc, reportHash);
  const decisions = sel.state === 'valid' ? sel.selection?.decisions ?? {} : {};
  const candidates = report.candidates.map((c): SearchCandidateStatus => {
    const d = c.candidateId ? decisions[c.candidateId] : undefined;
    return {
      ordinal: c.ordinal,
      candidateId: c.candidateId,
      state: c.state,
      decision: c.state === 'passed' ? d?.state ?? 'pending' : null,
      labels: d?.labels ?? [],
      note: d?.note ?? null,
      by: d?.by ?? null,
      reason: c.rejection?.message ?? null,
      risks: c.risks,
    };
  });
  return {
    schema: SEARCH_STATUS_SCHEMA,
    searchId: report.searchId,
    search: searchLabel(loc),
    specHash: report.specHash,
    reportHash,
    selection: { state: sel.state, reason: sel.reason },
    problems: problems.sort(),
    summary: {
      ...report.summary,
      approved: candidates.filter((c) => c.decision === 'approved').length,
      rejected: candidates.filter((c) => c.decision === 'rejected').length,
    },
    candidates,
  };
}

/** Kararı kanonik `selection.json`a yazar; aday kimliği raporda `passed` olmalı. */
export function recordDecision(
  loc: SearchLocation,
  candidateId: string,
  decision: CandidateDecisionV1,
): SearchSelectionV1 {
  if (!CANDIDATE_ID.test(candidateId))
    throw new ProtocolError(
      'invalid',
      `aday kimliği ${CANDIDATE_ID.source} kalıbına uymalı`,
      candidateId,
    );
  const dir = resolveInside(loc.repoRoot, searchLabel(loc), 'search');
  return withLock(dir, searchLabel(loc), () => {
    const { report, reportHash } = loadSearch(loc);
    const current = readSelection(loc, reportHash);
    if (current.state === 'corrupt')
      throw new ProtocolError('corrupt', `selection.json: ${current.reason}`, searchLabel(loc));
    const next = asProtocol('decision', () =>
      applyDecision(report, reportHash, current.selection, candidateId, decision),
    );
    writeFileAtomic(searchFile(loc, 'selection.json'), prettyCanonicalJson(next));
    return next;
  });
}

/**
 * Onaylı bir adayı job programına TERFİ ettirir. Önce bütünlük: spec özeti,
 * aday program dosyası, spec'ten YENİDEN planlanan aynı sıradaki adayın
 * program özeti ve kimliği, yeniden render'ın PCM özeti. Biri tutmazsa
 * (`stale`/`identity`) job'a dokunulmaz. Sonra program kanonik
 * `storeProgram` yolundan (brief uyumu + bütçe) `origin.json` ile yazılır;
 * job'un eski render/analiz/seçimi özet zinciriyle bayatlar.
 */
export function promoteCandidate(
  job: JobLocation,
  search: SearchLocation,
  candidateId: string,
): { programHash: Sha256; origin: ProgramOriginV1 } {
  const label = searchLabel(search);
  const { spec, report, reportHash } = loadSearch(search);
  const entry = report.candidates.find((c) => c.candidateId === candidateId);
  if (!entry || !entry.programHash || !entry.render)
    throw new ProtocolError('not-found', `${candidateId} render edilmiş bir aday değil`, label);
  if (entry.state !== 'passed')
    throw new ProtocolError('invalid', `aday ${entry.state}; yalnız passed aday terfi eder`, label);
  const sel = readSelection(search, reportHash);
  const decision = sel.state === 'valid' ? sel.selection?.decisions[candidateId] : undefined;
  if (decision?.state !== 'approved') {
    throw new ProtocolError(
      'stage',
      `aday onaylı değil (seçim ${sel.state}, karar ${
        decision?.state ?? 'pending'
      }); önce search decide`,
      label,
    );
  }
  const file = readProgramFile(search, candidateId);
  if (!file || file.hash !== entry.programHash)
    throw new ProtocolError(
      'identity',
      'aday program dosyası raporla uyuşmuyor',
      `${label}/${candidateFile(candidateId)}`,
    );
  const replanned = planSearch(spec).candidates[entry.ordinal];
  if (replanned?.programHash !== entry.programHash || replanned.candidateId !== candidateId) {
    throw new ProtocolError(
      'stale',
      'spec + strateji bu adayı artık üretmiyor (motor/registry değişti); aramayı yeniden koşun',
      label,
    );
  }
  const rendered = renderProgram(file.program);
  if (hashPcm(rendered.channels, rendered.sampleRate) !== entry.render.pcmHash) {
    throw new ProtocolError(
      'stale',
      'aday yeniden render PCM özeti rapordan farklı (motor değişti); aramayı yeniden koşun',
      label,
    );
  }
  const origin = (hash: Sha256): ProgramOriginV1 => ({
    schema: PROGRAM_ORIGIN_SCHEMA,
    programHash: hash,
    source: {
      kind: 'search-candidate',
      searchesRoot: search.searchesRoot,
      searchId: search.searchId,
      specHash: report.specHash,
      reportHash,
      candidateId,
      ordinal: entry.ordinal,
      strategy: report.strategy,
      seed: report.seed,
      pcmHash: hashPcm(rendered.channels, rendered.sampleRate),
      decision: { by: decision.by, labels: decision.labels, note: decision.note },
    },
  });
  const programHash = storeProgram(job, file.program, origin);
  return { programHash, origin: origin(programHash) };
}

/**
 * Render edilmiş adayların dinleme kopyalarını programlarından YENİDEN
 * üretir (PCM özeti raporla aynı olmalı) ve git-dışı export/ altına yazar.
 */
export function exportSearchAudition(loc: SearchLocation): string[] {
  const { report } = loadSearch(loc);
  const written: string[] = [];
  for (const c of report.candidates) {
    if (!c.candidateId || !c.render) continue;
    const file = readProgramFile(loc, c.candidateId);
    if (!file || file.hash !== c.programHash)
      throw new ProtocolError(
        'identity',
        'aday programı raporla uyuşmuyor',
        candidateFile(c.candidateId),
      );
    const rendered = renderProgram(file.program);
    if (hashPcm(rendered.channels, rendered.sampleRate) !== c.render.pcmHash) {
      throw new ProtocolError(
        'stale',
        `${c.candidateId} PCM özeti rapordan farklı`,
        searchLabel(loc),
      );
    }
    written.push(
      writeAuditionCopy(loc.repoRoot, auditionPath(loc.searchId, c.candidateId), rendered),
    );
  }
  return written;
}

export function listSearches(repoRoot: string, searchesRoot: string): string[] {
  const dir = resolveInside(repoRoot, searchesRoot, 'searches');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && SEARCH_ID.test(e.name))
    .map((e) => e.name)
    .sort();
}

export interface SearchVerificationV1 {
  readonly schema: 'AcousticSearchVerificationV1';
  readonly search: string;
  readonly checks: readonly {
    readonly name: string;
    readonly ok: boolean;
    readonly detail: string;
  }[];
  readonly ok: boolean;
}

/**
 * Kayıtlı aramayı YALNIZ spec'inden yeniden üretir (bellekte; dosya yazmaz)
 * ve her adayın sırasını, kimliğini, program özetini, mekanik durumunu ve
 * PCM özetini raporla karşılaştırır. Registry açıklama özeti farkı bilgi
 * amaçlıdır: aday kimliği ve PCM düğüm sürümlerine bağlıdır, metne değil.
 */
export function verifySearch(loc: SearchLocation): SearchVerificationV1 {
  const { spec, report } = loadSearch(loc);
  const status = searchStatus(loc);
  const plan = planSearch(spec);
  const replay = buildSearchReport(plan, executeSearch(plan));
  const key = (c: SearchCandidateV1) =>
    [
      c.ordinal,
      c.candidateId,
      c.programHash,
      c.state,
      c.render?.pcmHash ?? null,
      c.rejection?.stage ?? null,
    ].join('|');
  const drift = report.candidates.filter(
    (c, i) => key(c) !== (replay.candidates[i] ? key(replay.candidates[i]) : ''),
  );
  const checks = [
    {
      name: 'files',
      ok: status.problems.length === 0,
      detail: status.problems.join('; ') || 'rapordaki bütün aday programları yerinde',
    },
    {
      name: 'reproduction',
      ok: drift.length === 0 && replay.candidates.length === report.candidates.length,
      detail:
        drift.length === 0
          ? `${report.candidates.length} aday: sıra, kimlik, program, durum ve PCM aynı`
          : `farklı adaylar: ${drift.map((c) => c.ordinal).join(', ')}`,
    },
    {
      name: 'registry',
      ok: true,
      detail:
        replay.engine.registryHash === report.engine.registryHash
          ? 'registry özeti aynı'
          : 'registry açıklama özeti farklı (bilgi)',
    },
  ];
  return {
    schema: 'AcousticSearchVerificationV1',
    search: searchLabel(loc),
    checks,
    ok: checks.every((c) => c.ok),
  };
}
