import { existsSync, readdirSync } from 'node:fs';
import { DEFAULT_FAMILIES_ROOT } from './family';
import { resolveInside } from './fs';
import { DEFAULT_JOBS_ROOT, type JobLocation } from './location';
import { DEFAULT_MUSIC_ROOT } from './music';
import { JOB_ID, type JobStage } from './records';
import { jobStatus, type ArtifactStateName, type NextAction } from './status';

export const JOB_PUBLICATION_SCHEMA = 'AudioJobPublicationV1';

/**
 * Kayıtlı iş envanterinin bir satırı. Yayın kaydı taşıyan iş, kaydın
 * gösterdiği manifest ve asset ile hâlâ tutarlı olmalıdır; aksi hâlde iş ya
 * emekli edilmiştir (kaydı temizlenmeli) ya da asset yeniden yayımlanmalıdır.
 * Aktif manifestleri doğrulamak bu satırların yerine geçmez: kaybolmuş hedefin
 * manifesti bulunmaz ve doğrulama onu hiç görmez.
 */
export interface JobPublicationVerificationV1 {
  readonly schema: typeof JOB_PUBLICATION_SCHEMA;
  readonly job: string;
  readonly stage: JobStage;
  readonly publication: 'none' | Exclude<ArtifactStateName, 'missing'>;
  readonly reason: string | null;
  readonly next: NextAction;
  readonly ok: boolean;
}

function childDirs(repoRoot: string, rel: string): string[] {
  const dir = resolveInside(repoRoot, rel, 'jobs');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function jobsUnder(repoRoot: string, jobsRoot: string): JobLocation[] {
  return childDirs(repoRoot, jobsRoot)
    .filter((jobId) => JOB_ID.test(jobId))
    .filter((jobId) => existsSync(resolveInside(repoRoot, `${jobsRoot}/${jobId}/job.json`, 'job')))
    .map((jobId) => ({ repoRoot, jobsRoot, jobId }));
}

/**
 * Depodaki bütün iş konumları: doğrudan işler, ailelerin ve müziklerin kendi
 * `jobs` dizinleri. Sıra deterministiktir.
 */
export function listJobLocations(repoRoot: string): JobLocation[] {
  const roots = [DEFAULT_JOBS_ROOT];
  for (const parent of [DEFAULT_FAMILIES_ROOT, DEFAULT_MUSIC_ROOT]) {
    for (const owner of childDirs(repoRoot, parent)) roots.push(`${parent}/${owner}/jobs`);
  }
  return roots.flatMap((jobsRoot) => jobsUnder(repoRoot, jobsRoot));
}

/** Yayın kaydı olan her işin kaydı geçerli bir manifest ve asset'e bağlı mı. */
export function verifyJobPublications(repoRoot: string): JobPublicationVerificationV1[] {
  return listJobLocations(repoRoot).map((loc) => {
    const status = jobStatus(loc);
    const publication = status.artifacts.publication;
    const recorded = publication.state !== 'missing';
    return {
      schema: JOB_PUBLICATION_SCHEMA,
      job: status.job,
      stage: status.effectiveStage,
      publication: publication.state === 'missing' ? 'none' : publication.state,
      reason: recorded && publication.state !== 'valid' ? (publication.reason ?? null) : null,
      next: status.next.action,
      ok: !recorded || publication.state === 'valid',
    };
  });
}
