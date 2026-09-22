import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeAudio } from '../analysis/report';
import { assertRenderBudget } from '../guard/budget';
import { validateBrief, type AudioBriefV1 } from '../program/brief';
import { estimateProgramCost, PROGRAM_RENDERER_VERSION, renderProgram } from '../program/render';
import { resolveProgram } from '../program/schema';
import { writeAuditionCopy } from './audition';
import { hashCanonical, hashPcm, type Sha256 } from './canonical';
import { ProtocolError } from './errors';
import { readJsonFile, resolveInside, withLock } from './fs';
import {
  advance,
  artifactFile,
  AUDITION_ROOT,
  jobDir,
  jobLabel,
  loadJob,
  saveJob,
  writeArtifact,
  type JobLocation,
} from './location';
import {
  ANALYSIS_RECORD_SCHEMA,
  analysisPath,
  asProtocol,
  AUDIO_JOB_SCHEMA,
  JOB_ID,
  PROTOCOL_VERSION,
  RENDER_RECORD_SCHEMA,
  renderPath,
  SELECTION_SCHEMA,
  type AnalysisRecordV1,
  type AudioJobV1,
  type JobTargetV1,
  type RenderRecordV1,
  type SelectionV1,
} from './records';
import type { ProgramOriginV1 } from './origin';
import { jobStatus, type JobStatusV1 } from './status';
import { resolveDestination, surveyTargets } from './targets';

/** Durumu dosyalardan hesaplar ve komutun ön koşulunu sınar. */
function requireState(
  loc: JobLocation,
  command: string,
  check: (status: JobStatusV1) => string | null,
): JobStatusV1 {
  const status = jobStatus(loc);
  const problem = check(status);
  if (problem) {
    throw new ProtocolError(
      'stage',
      `${command} yapılamaz: ${problem}. Sonraki geçerli adım: ${status.next.action}`,
      jobLabel(loc),
    );
  }
  return status;
}

export interface InitOptions {
  readonly target: JobTargetV1;
}

/** Yeni job açar. Aynı kimlikte job varsa DOKUNMAZ (`overwrite`); hedef burada doğrulanır. */
export function initJob(loc: JobLocation, options: InitOptions): AudioJobV1 {
  const dir = jobDir(loc);
  resolveDestination(surveyTargets(loc.repoRoot), options.target.package, options.target.asset);
  return withLock(dir, jobLabel(loc), () => {
    if (existsSync(join(dir, 'job.json'))) {
      throw new ProtocolError('overwrite', 'job zaten var; mevcut iş sıfırlanmaz', jobLabel(loc));
    }
    const job: AudioJobV1 = {
      schema: AUDIO_JOB_SCHEMA,
      protocolVersion: PROTOCOL_VERSION,
      jobId: loc.jobId,
      kind: 'acoustic',
      target: options.target,
      stage: 'created',
      revision: 0,
      artifacts: { renders: {}, analyses: {} },
    };
    saveJob(loc, job);
    return job;
  });
}

export function registerBrief(loc: JobLocation, document: unknown): Sha256 {
  return withLock(jobDir(loc), jobLabel(loc), () => {
    const job = loadJob(loc);
    const brief = asProtocol('brief', () => validateBrief(document));
    if (brief.loop === true && !job.target.integration.loop) {
      throw new ProtocolError(
        'invalid',
        'brief loop istiyor ama job hedefi loop değil',
        'brief.loop',
      );
    }
    const hash = writeArtifact(loc, 'brief.json', brief);
    saveJob(loc, advance(job, 'briefed', { brief: { path: 'brief.json', hash } }));
    return hash;
  });
}

function checkProgramAgainstBrief(
  brief: AudioBriefV1,
  program: ReturnType<typeof resolveProgram>,
): void {
  if (program.channels !== brief.channels) {
    throw new ProtocolError(
      'invalid',
      `program ${program.channels} kanal, brief ${brief.channels} istiyor`,
      'program.channels',
    );
  }
  const { min, max } = brief.durationSeconds;
  if (program.durationSeconds < min || program.durationSeconds > max) {
    throw new ProtocolError(
      'invalid',
      `süre ${program.durationSeconds} sn brief aralığı [${min}, ${max}] dışında`,
      'program.durationSeconds',
    );
  }
}

/**
 * Programı doğrular (şema, registry, brief uyumu, bütçe) ve kaydeder; render
 * ETMEZ. Köken verilirse (`promote`) program ile AYNI kilit altında yazılır;
 * verilmezse eski köken silinir — elle kaydedilen program aramadan gelmiş
 * gibi görünemez.
 */
export function storeProgram(
  loc: JobLocation,
  document: unknown,
  origin: (programHash: Sha256) => ProgramOriginV1 | null,
): Sha256 {
  return withLock(jobDir(loc), jobLabel(loc), () => {
    const status = requireState(loc, 'program', (s) =>
      s.artifacts.brief.state === 'valid' ? null : `brief ${s.artifacts.brief.state}`,
    );
    const job = loadJob(loc);
    const resolved = asProtocol('program', () => resolveProgram(document));
    const brief = validateBrief(readJsonFile(artifactFile(loc, 'brief.json'), 'brief.json'));
    checkProgramAgainstBrief(brief, resolved);
    assertRenderBudget(estimateProgramCost(resolved), 'program');
    const hash = writeArtifact(loc, 'program.json', document);
    const provenance = origin(hash);
    if (provenance) writeArtifact(loc, 'origin.json', provenance);
    else rmSync(artifactFile(loc, 'origin.json'), { force: true });
    saveJob(
      loc,
      advance(job, 'programmed', {
        program: { path: 'program.json', hash, brief: status.artifacts.brief.hash as Sha256 },
      }),
    );
    return hash;
  });
}

export function registerProgram(loc: JobLocation, document: unknown): Sha256 {
  return storeProgram(loc, document, () => null);
}

export function renderIdOf(programHash: Sha256, seed: number): string {
  const identity = hashCanonical({ programHash, seed, rendererVersion: PROGRAM_RENDERER_VERSION });
  return `r-${identity.slice('sha256:'.length, 'sha256:'.length + 16)}`;
}

function currentProgram(loc: JobLocation): { document: unknown; hash: Sha256 } {
  const document = readJsonFile(artifactFile(loc, 'program.json'), 'program.json');
  return { document, hash: hashCanonical(document) };
}

export interface RenderOptions {
  readonly seed?: number;
  /** Dinleme kopyası (16-bit WAV) `AUDITION_ROOT` altına yazılsın mı. */
  readonly audition?: boolean;
}

export interface RenderOutcome {
  readonly record: RenderRecordV1;
  readonly audition: string | null;
}

export function renderCandidate(loc: JobLocation, options: RenderOptions = {}): RenderOutcome {
  return withLock(jobDir(loc), jobLabel(loc), () => {
    requireState(loc, 'render', (s) =>
      s.artifacts.program.state === 'valid' ? null : `program ${s.artifacts.program.state}`,
    );
    const job = loadJob(loc);
    const program = currentProgram(loc);
    const rendered = renderProgram(program.document, { seed: options.seed });
    const renderId = renderIdOf(program.hash, rendered.seed);
    const record: RenderRecordV1 = {
      schema: RENDER_RECORD_SCHEMA,
      renderId,
      programHash: program.hash,
      seed: rendered.seed,
      rendererVersion: PROGRAM_RENDERER_VERSION,
      pcm: {
        hash: hashPcm(rendered.channels, rendered.sampleRate),
        sampleRate: rendered.sampleRate,
        channels: rendered.channels.length,
        frames: rendered.channels[0].length,
      },
      cost: { peakBytes: rendered.cost.peakBytes, workUnits: rendered.cost.workUnits },
    };
    const hash = writeArtifact(loc, renderPath(renderId), record);
    let audition: string | null = null;
    if (options.audition) {
      audition = writeAuditionCopy(
        loc.repoRoot,
        `${AUDITION_ROOT}/${loc.jobId}/${renderId}.wav`,
        rendered,
      );
    }
    saveJob(
      loc,
      advance(job, 'rendered', {
        renders: { ...job.artifacts.renders, [renderId]: { path: renderPath(renderId), hash } },
      }),
    );
    return { record, audition };
  });
}

function pickRender(status: JobStatusV1, renderId: string | undefined): string {
  const valid = status.artifacts.renders.filter((r) => r.state === 'valid').map((r) => r.renderId);
  if (renderId !== undefined) {
    if (!valid.includes(renderId))
      throw new ProtocolError(
        'stale',
        `${renderId} geçerli bir render değil (geçerli: ${valid.join(', ') || 'yok'})`,
      );
    return renderId;
  }
  if (valid.length !== 1)
    throw new ProtocolError('invalid', `render seçilmeli (geçerli: ${valid.join(', ') || 'yok'})`);
  return valid[0];
}

/**
 * Seçilen render'ı programından YENİDEN üretir, PCM özetinin kayıtla aynı
 * olduğunu doğrular ve kaynak PCM'i ölçer. Kimlik tutmazsa ölçüm yazılmaz.
 */
export function analyzeCandidate(loc: JobLocation, renderId?: string): AnalysisRecordV1 {
  return withLock(jobDir(loc), jobLabel(loc), () => {
    const status = requireState(loc, 'analyze', (s) =>
      s.artifacts.renders.some((r) => r.state === 'valid') ? null : 'geçerli render yok',
    );
    const id = pickRender(status, renderId);
    const job = loadJob(loc);
    const record = readJsonFile(
      artifactFile(loc, renderPath(id)),
      renderPath(id),
    ) as RenderRecordV1;
    const rendered = renderProgram(currentProgram(loc).document, { seed: record.seed });
    const pcmHash = hashPcm(rendered.channels, rendered.sampleRate);
    if (pcmHash !== record.pcm.hash) {
      throw new ProtocolError(
        'identity',
        `yeniden render PCM özeti kayıttan farklı (${pcmHash})`,
        renderPath(id),
      );
    }
    const analysis: AnalysisRecordV1 = {
      schema: ANALYSIS_RECORD_SCHEMA,
      renderId: id,
      renderHash: job.artifacts.renders[id].hash,
      pcmHash,
      report: analyzeAudio(rendered.channels, rendered.sampleRate, 'source-pcm'),
    };
    const hash = writeArtifact(loc, analysisPath(id), analysis);
    saveJob(
      loc,
      advance(job, 'analyzed', {
        analyses: { ...job.artifacts.analyses, [id]: { path: analysisPath(id), hash } },
      }),
    );
    return analysis;
  });
}

export function selectCandidate(
  loc: JobLocation,
  renderId: string | undefined,
  reason: string,
): SelectionV1 {
  return withLock(jobDir(loc), jobLabel(loc), () => {
    const status = requireState(loc, 'select', (s) =>
      s.artifacts.analyses.some((a) => a.state === 'valid') ? null : 'geçerli analiz yok',
    );
    const id = pickRender(status, renderId);
    const analysis = status.artifacts.analyses.find((a) => a.renderId === id);
    if (analysis?.state !== 'valid')
      throw new ProtocolError('stale', `${id} için geçerli analiz yok`);
    const job = loadJob(loc);
    const selection: SelectionV1 = {
      schema: SELECTION_SCHEMA,
      renderId: id,
      renderHash: job.artifacts.renders[id].hash,
      analysisHash: job.artifacts.analyses[id].hash,
      pcmHash: (
        readJsonFile(artifactFile(loc, analysisPath(id)), analysisPath(id)) as AnalysisRecordV1
      ).pcmHash,
      reason,
    };
    const hash = writeArtifact(loc, 'selection.json', selection);
    saveJob(loc, advance(job, 'selected', { selection: { path: 'selection.json', hash } }));
    return selection;
  });
}

/** Repo'daki job kimlikleri (sıralı); `job.json` taşımayan dizinler job sayılmaz. */
export function listJobs(repoRoot: string, jobsRoot: string): string[] {
  const dir = resolveInside(repoRoot, jobsRoot, 'jobs');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter(
      (e) => e.isDirectory() && JOB_ID.test(e.name) && existsSync(join(dir, e.name, 'job.json')),
    )
    .map((e) => e.name)
    .sort();
}
