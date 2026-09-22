import { existsSync } from 'node:fs';
import { hashCanonical, prettyCanonicalJson, type Sha256 } from './canonical';
import { ProtocolError } from './errors';
import { readJsonFile, resolveInside, writeFileAtomic } from './fs';
import { asProtocol, JOB_ID, validateJob, type AudioJobV1, type JobStage } from './records';

/** Job'lar varsayılan olarak burada yaşar; `--jobs` ile başka bir repo-göreli köke alınabilir. */
export const DEFAULT_JOBS_ROOT = 'devtools/audio-synth/audio-jobs';
/** Dinleme kopyaları git'e girmez (`devtools/*\/export/` yok sayılır). */
export const AUDITION_ROOT = 'devtools/audio-synth/export/audio-jobs';

export interface JobLocation {
  readonly repoRoot: string;
  readonly jobsRoot: string;
  readonly jobId: string;
}

export function jobLabel(loc: JobLocation): string {
  return `${loc.jobsRoot}/${loc.jobId}`;
}

export function jobDir(loc: JobLocation): string {
  if (!JOB_ID.test(loc.jobId))
    throw new ProtocolError('path', `jobId ${JOB_ID.source} kalıbına uymalı`, loc.jobId);
  return resolveInside(loc.repoRoot, jobLabel(loc), 'job');
}

export function artifactFile(loc: JobLocation, relative: string): string {
  return resolveInside(loc.repoRoot, `${jobLabel(loc)}/${relative}`, relative);
}

export function loadJob(loc: JobLocation): AudioJobV1 {
  const label = `${jobLabel(loc)}/job.json`;
  const file = artifactFile(loc, 'job.json');
  if (!existsSync(file)) throw new ProtocolError('not-found', 'job yok (audio:job init)', label);
  return asProtocol(label, () => validateJob(readJsonFile(file, label)));
}

export function saveJob(loc: JobLocation, job: AudioJobV1): void {
  writeFileAtomic(
    artifactFile(loc, 'job.json'),
    prettyCanonicalJson(asProtocol('job', () => validateJob(job))),
  );
}

export function writeArtifact(loc: JobLocation, relative: string, doc: unknown): Sha256 {
  writeFileAtomic(artifactFile(loc, relative), prettyCanonicalJson(doc));
  return hashCanonical(doc);
}

export function advance(
  job: AudioJobV1,
  stage: JobStage,
  artifacts: Partial<AudioJobV1['artifacts']>,
): AudioJobV1 {
  return {
    ...job,
    stage,
    revision: job.revision + 1,
    artifacts: { ...job.artifacts, ...artifacts },
  };
}
