import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { ANALYZER_VERSION } from '../analysis/report';
import { validateBrief } from '../program/brief';
import { PROGRAM_RENDERER_VERSION } from '../program/render';
import { resolveProgram } from '../program/schema';
import { hashCanonical, sha256Bytes, type Sha256 } from './canonical';
import { ProtocolError } from './errors';
import { readJsonFile, resolveInside } from './fs';
import { artifactFile, jobLabel, loadJob, type JobLocation } from './location';
import { validateManifest } from './manifest';
import {
  JOB_STAGES,
  validateAnalysisRecord,
  validateRenderRecord,
  validateSelection,
  type AudioJobV1,
  type JobStage,
} from './records';

export const JOB_STATUS_SCHEMA = 'AudioJobStatusV1';

/**
 * - `valid`: dosya okunur, şemaya uyar, job kaydındaki özetle aynı ve
 *   ebeveynleri hâlâ geçerli.
 * - `modified`: dosya job kaydından sonra protokol DIŞINDA değişmiş.
 * - `stale`: dosya bozulmamış ama dayandığı ebeveyn değişmiş/geçersiz.
 * - `corrupt`: okunamıyor ya da şemaya uymuyor (yarım yazım dahil).
 */
export type ArtifactStateName = 'missing' | 'valid' | 'modified' | 'stale' | 'corrupt';

export interface ArtifactState {
  readonly state: ArtifactStateName;
  readonly path: string;
  readonly hash: Sha256 | null;
  readonly reason: string | null;
}

export interface CandidateState extends ArtifactState {
  readonly renderId: string;
}

export type NextAction = 'brief' | 'program' | 'render' | 'analyze' | 'select' | 'publish' | 'done';

export interface JobStatusV1 {
  readonly schema: typeof JOB_STATUS_SCHEMA;
  readonly jobId: string;
  readonly job: string;
  readonly target: AudioJobV1['target'];
  readonly recordedStage: JobStage;
  readonly effectiveStage: JobStage;
  readonly revision: number;
  readonly artifacts: {
    readonly brief: ArtifactState;
    readonly program: ArtifactState;
    readonly renders: readonly CandidateState[];
    readonly analyses: readonly CandidateState[];
    readonly selection: ArtifactState;
    readonly publication: ArtifactState;
  };
  /** Protokol dışı dosyalar, yarım yazımdan kalan geçici dosyalar, kilit. */
  readonly problems: readonly string[];
  readonly next: { readonly action: NextAction; readonly reason: string };
}

const state = (
  name: ArtifactStateName,
  path: string,
  hash: Sha256 | null = null,
  reason: string | null = null,
): ArtifactState => ({ state: name, path, hash, reason });

interface Loaded {
  readonly doc: unknown;
  readonly hash: Sha256;
}

/** Dosyayı oku + doğrula + kayıtlı özetle karşılaştır; ebeveyn denetimi çağıranda. */
function inspect(
  file: string,
  path: string,
  recorded: Sha256 | undefined,
  validate: (doc: unknown) => unknown,
): { state: ArtifactState; loaded: Loaded | null } {
  if (recorded === undefined) return { state: state('missing', path), loaded: null };
  if (!existsSync(file))
    return { state: state('corrupt', path, null, 'kayıtlı ama dosya yok'), loaded: null };
  let doc: unknown;
  try {
    doc = readJsonFile(file, path);
    validate(doc);
  } catch (error) {
    return { state: state('corrupt', path, null, (error as Error).message), loaded: null };
  }
  const hash = hashCanonical(doc);
  if (hash !== recorded) {
    return {
      state: state('modified', path, hash, 'job kaydından sonra protokol dışında değişti'),
      loaded: { doc, hash },
    };
  }
  return { state: state('valid', path, hash), loaded: { doc, hash } };
}

function staleIf(current: ArtifactState, reason: string | null): ArtifactState {
  if (current.state !== 'valid' || reason === null) return current;
  return state('stale', current.path, current.hash, reason);
}

function listProblems(loc: JobLocation, job: AudioJobV1): string[] {
  const problems: string[] = [];
  const dir = resolveInside(loc.repoRoot, jobLabel(loc), 'job');
  const walk = (relative: string) => {
    const abs =
      relative === '' ? dir : resolveInside(loc.repoRoot, `${jobLabel(loc)}/${relative}`, relative);
    if (!existsSync(abs)) return;
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const rel = relative === '' ? entry.name : `${relative}/${entry.name}`;
      if (entry.name.startsWith('.tmp-'))
        problems.push(`yarım yazımdan kalan geçici dosya: ${rel}`);
      else if (entry.name === '.lock') {
        const owner = lockOwner(`${abs}/${entry.name}`);
        if (owner !== String(process.pid)) problems.push(`kilit var (pid ${owner})`);
      } else if (entry.isDirectory() && (rel === 'renders' || rel === 'analyses')) walk(rel);
      else if (!knownFile(job, rel)) problems.push(`job kaydında olmayan dosya: ${rel}`);
    }
  };
  walk('');
  return problems.sort();
}

function lockOwner(file: string): string {
  try {
    return readFileSync(file, 'utf8').trim();
  } catch {
    return '?';
  }
}

function knownFile(job: AudioJobV1, rel: string): boolean {
  if (['job.json', 'brief.json', 'program.json', 'selection.json'].includes(rel)) return true;
  const refs = [...Object.values(job.artifacts.renders), ...Object.values(job.artifacts.analyses)];
  return refs.some((ref) => ref.path === rel);
}

function stageOf(s: JobStatusV1['artifacts']): JobStage {
  const reached: boolean[] = [
    true,
    s.brief.state === 'valid',
    s.program.state === 'valid',
    s.renders.some((r) => r.state === 'valid'),
    s.analyses.some((a) => a.state === 'valid'),
    s.selection.state === 'valid',
    s.publication.state === 'valid',
  ];
  let index = 0;
  while (index + 1 < reached.length && reached[index + 1]) index++;
  return JOB_STAGES[index];
}

function nextOf(s: JobStatusV1['artifacts']): JobStatusV1['next'] {
  const describe = (a: ArtifactState) => (a.reason ? `${a.state}: ${a.reason}` : a.state);
  if (s.brief.state !== 'valid') return { action: 'brief', reason: `brief ${describe(s.brief)}` };
  if (s.program.state !== 'valid')
    return { action: 'program', reason: `program ${describe(s.program)}` };
  if (!s.renders.some((r) => r.state === 'valid'))
    return { action: 'render', reason: 'geçerli render yok' };
  if (!s.analyses.some((a) => a.state === 'valid'))
    return { action: 'analyze', reason: 'geçerli render için analiz yok' };
  if (s.selection.state !== 'valid')
    return { action: 'select', reason: `selection ${describe(s.selection)}` };
  if (s.publication.state !== 'valid')
    return { action: 'publish', reason: `publication ${describe(s.publication)}` };
  return { action: 'done', reason: 'yayımlandı; manifest audio:job verify ile doğrulanır' };
}

/**
 * Job'un durumunu YALNIZ repo dosyalarından hesaplar: önceki süreç ya da
 * sohbet bilgisi gerekmez. Kayıtlı aşama bilgi amaçlıdır; etkin aşama ve
 * sonraki geçerli adım özet zincirinden türetilir.
 */
export function jobStatus(loc: JobLocation): JobStatusV1 {
  const job = loadJob(loc);
  const file = (rel: string) => artifactFile(loc, rel);
  const a = job.artifacts;

  const briefResult = inspect(file('brief.json'), 'brief.json', a.brief?.hash, validateBrief);
  const brief = briefResult.state;

  const programResult = inspect(
    file('program.json'),
    'program.json',
    a.program?.hash,
    resolveProgram,
  );
  const program = staleIf(
    programResult.state,
    brief.state !== 'valid'
      ? `brief ${brief.state}`
      : a.program?.brief !== brief.hash
      ? 'brief değişti'
      : null,
  );
  const programHash = programResult.loaded?.hash ?? null;

  const renders = Object.entries(a.renders)
    .sort(([x], [y]) => x.localeCompare(y))
    .map(([renderId, ref]): CandidateState => {
      const result = inspect(file(ref.path), ref.path, ref.hash, validateRenderRecord);
      const record = result.loaded?.doc as
        | { programHash: Sha256; rendererVersion: number }
        | undefined;
      const reason =
        program.state !== 'valid' && program.state !== 'modified'
          ? `program ${program.state}`
          : record && record.programHash !== programHash
          ? 'program değişti'
          : record && record.rendererVersion !== PROGRAM_RENDERER_VERSION
          ? `render motoru sürümü ${record.rendererVersion} → ${PROGRAM_RENDERER_VERSION}`
          : program.state === 'modified'
          ? 'program protokol dışında değişti'
          : null;
      return { ...staleIf(result.state, reason), renderId };
    });
  const renderById = new Map(renders.map((r) => [r.renderId, r]));

  const analyses = Object.entries(a.analyses)
    .sort(([x], [y]) => x.localeCompare(y))
    .map(([renderId, ref]): CandidateState => {
      const result = inspect(file(ref.path), ref.path, ref.hash, validateAnalysisRecord);
      const record = result.loaded?.doc as
        | { renderHash: Sha256; report: { analyzerVersion: number } }
        | undefined;
      const render = renderById.get(renderId);
      const reason =
        render?.state !== 'valid'
          ? `render ${render?.state ?? 'yok'}`
          : record && record.renderHash !== render.hash
          ? 'başka bir render kaydına ait'
          : record && record.report.analyzerVersion !== ANALYZER_VERSION
          ? `analizör sürümü ${record.report.analyzerVersion} → ${ANALYZER_VERSION}`
          : null;
      return { ...staleIf(result.state, reason), renderId };
    });
  const analysisById = new Map(analyses.map((x) => [x.renderId, x]));

  const selectionResult = inspect(
    file('selection.json'),
    'selection.json',
    a.selection?.hash,
    validateSelection,
  );
  const chosen = selectionResult.loaded?.doc as
    | { renderId: string; renderHash: Sha256; analysisHash: Sha256 }
    | undefined;
  const selection = staleIf(
    selectionResult.state,
    chosen === undefined
      ? null
      : renderById.get(chosen.renderId)?.state !== 'valid'
      ? `seçilen render (${chosen.renderId}) geçerli değil`
      : analysisById.get(chosen.renderId)?.state !== 'valid'
      ? 'seçilen render için geçerli analiz yok'
      : chosen.renderHash !== renderById.get(chosen.renderId)?.hash ||
        chosen.analysisHash !== analysisById.get(chosen.renderId)?.hash
      ? 'seçim başka bir render/analiz kaydına işaret ediyor'
      : null,
  );

  const publication = publicationState(loc, job, selection, programHash, chosen?.renderId ?? null);
  const artifacts = { brief, program, renders, analyses, selection, publication };
  return {
    schema: JOB_STATUS_SCHEMA,
    jobId: job.jobId,
    job: jobLabel(loc),
    target: job.target,
    recordedStage: job.stage,
    effectiveStage: stageOf(artifacts),
    revision: job.revision,
    artifacts,
    problems: listProblems(loc, job),
    next: nextOf(artifacts),
  };
}

function publicationState(
  loc: JobLocation,
  job: AudioJobV1,
  selection: ArtifactState,
  programHash: Sha256 | null,
  selectedRender: string | null,
): ArtifactState {
  const ref = job.artifacts.publication;
  if (!ref) return state('missing', '—');
  let manifestFile: string;
  try {
    manifestFile = resolveInside(loc.repoRoot, ref.path, 'publication');
  } catch (error) {
    if (error instanceof ProtocolError) return state('corrupt', ref.path, null, error.message);
    throw error;
  }
  const result = inspect(manifestFile, ref.path, ref.hash, validateManifest);
  if (!result.loaded) return result.state;
  const manifest = validateManifest(result.loaded.doc);
  let reason: string | null = null;
  if (selection.state !== 'valid') reason = `selection ${selection.state}`;
  else if (manifest.program.hash !== programHash) reason = 'yayımlanan program güncel değil';
  else if (manifest.render.renderId !== selectedRender)
    reason = 'yayımlanan render seçimle aynı değil';
  else {
    const asset = resolveInside(loc.repoRoot, manifest.asset.path, 'asset');
    if (!existsSync(asset)) reason = 'asset dosyası yok';
    else if (sha256Bytes(readFileSync(asset)) !== manifest.asset.encodedHash)
      reason = 'asset baytları manifest ile uyuşmuyor';
  }
  return staleIf(result.state, reason);
}
