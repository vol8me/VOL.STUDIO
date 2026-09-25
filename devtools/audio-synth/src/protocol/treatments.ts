import { existsSync } from 'node:fs';
import type { AcousticBriefV1 } from '../program/brief';
import { resolveProgram, outputSeconds, type AcousticProgramV1 } from '../program/schema';
import { treatmentProfileHash, type TreatmentProfileV1 } from '../program/treatmentProfiles';
import { hashCanonical, type Sha256 } from './canonical';
import { expectedTreatment, profileOrThrow, readSourceManifest } from './derivation';
import { ProtocolError } from './errors';
import { resolveInside } from './fs';
import {
  analyzeCandidate,
  initJob,
  registerBrief,
  renderCandidate,
  selectCandidate,
  storeProgram,
} from './job';
import { loadJob, type JobLocation } from './location';
import type { AudioAssetManifestV1 } from './manifest';
import { PROGRAM_ORIGIN_SCHEMA, type ProgramOriginV1 } from './origin';
import { publishJob } from './publish';
import { jobStatus } from './status';

/**
 * Teslim varyantı üretimi: yayımlanmış bir kaynağın manifest'inden brief ve
 * program türetilir (program = kaynak + profilin genişletilmesi), köken
 * `treatment` olarak yazılır ve varyant kanonik job akışından geçer — aynı
 * kodek QA'sı, aynı manifest; manifest ayrıca `derivation` bağını taşır.
 * Aynı komutun tekrarı yayımlanmış varyanta dokunmaz (idempotent).
 */
export interface DeriveOptions {
  readonly repoRoot: string;
  readonly job: JobLocation;
  /** Kaynak manifest'in repo-göreli yolu. */
  readonly source: string;
  readonly profile: string;
  /** Hedef paketin köküne göreli `.ogg` yolu; paket kaynağın paketidir. */
  readonly asset: string;
}

export interface DerivedDocuments {
  readonly brief: AcousticBriefV1;
  readonly program: AcousticProgramV1;
  readonly profile: TreatmentProfileV1;
}

/** Kaynağın brief'i ve programından varyantın belgelerini üretir (yazım yok). */
export function derivedDocuments(
  source: AudioAssetManifestV1,
  profileId: string,
): DerivedDocuments {
  const profile = profileOrThrow(profileId);
  const brief = source.brief.document as AcousticBriefV1;
  const treatment = expectedTreatment(source, profile);
  const program = { ...(source.program.document as AcousticProgramV1), treatment };
  const seconds = outputSeconds(resolveProgram(program));
  const id = `${brief.id}-${profile.id}`;
  if (id.length > 64) throw new ProtocolError('invalid', 'varyant kimliği 64 karakteri aşıyor', id);
  return {
    profile,
    program,
    brief: {
      ...brief,
      id,
      title: `${brief.title} — ${profile.id}`.slice(0, 120),
      intent: `${brief.intent} Teslim profili ${profile.id}: ${profile.description}`.slice(0, 4000),
      provenance: { author: 'agent', by: 'treatment-profile' },
      channels: treatment.channels ?? brief.channels,
      durationSeconds: {
        min: Math.min(brief.durationSeconds.min, seconds),
        max: Math.max(brief.durationSeconds.max, seconds),
      },
      descriptors: [...(brief.descriptors ?? []), `treatment:${profile.id}`],
    },
  };
}

function originFor(
  manifestPath: string,
  source: AudioAssetManifestV1,
  profile: TreatmentProfileV1,
): (programHash: Sha256) => ProgramOriginV1 {
  return (programHash) => ({
    schema: PROGRAM_ORIGIN_SCHEMA,
    programHash,
    source: {
      kind: 'treatment',
      source: {
        manifest: manifestPath,
        assetId: source.assetId,
        programHash: source.program.hash,
        pcmHash: source.render.pcm.hash,
        seed: source.render.seed,
      },
      profile: { id: profile.id, version: profile.version, hash: treatmentProfileHash(profile) },
    },
  });
}

export interface DeriveOutcome {
  readonly result: 'published' | 'unchanged';
  readonly manifest: string | null;
}

export function deriveTreatment(options: DeriveOptions): DeriveOutcome {
  const { job } = options;
  const source = readSourceManifest(options.repoRoot, options.source);
  const documents = derivedDocuments(source, options.profile);
  const target = {
    package: source.integration.package,
    asset: options.asset,
    integration: {
      runtimeKey: source.integration.runtimeKey
        ? `${source.integration.runtimeKey}/${options.profile}`
        : null,
      loop: source.integration.loop,
    },
  };
  const jobFile = resolveInside(options.repoRoot, `${job.jobsRoot}/${job.jobId}/job.json`, 'job');
  if (!existsSync(jobFile)) initJob(job, { target });
  else if (hashCanonical(loadJob(job).target) !== hashCanonical(target)) {
    throw new ProtocolError('identity', 'iş başka bir hedefe ait', `${job.jobsRoot}/${job.jobId}`);
  }
  if (jobStatus(job).artifacts.brief.hash !== hashCanonical(documents.brief)) {
    registerBrief(job, documents.brief);
  }
  const before = jobStatus(job);
  if (
    before.artifacts.program.state !== 'valid' ||
    before.artifacts.program.hash !== hashCanonical(documents.program) ||
    before.artifacts.origin.state !== 'valid'
  ) {
    storeProgram(job, documents.program, originFor(options.source, source, documents.profile));
  }
  if (jobStatus(job).next.action === 'done') {
    return { result: 'unchanged', manifest: loadJob(job).artifacts.publication?.path ?? null };
  }
  for (let step = 0; step < 6; step++) {
    const action = jobStatus(job).next.action;
    if (action === 'done') break;
    if (action === 'render') renderCandidate(job, { seed: source.render.seed });
    else if (action === 'analyze') analyzeCandidate(job);
    else if (action === 'select')
      selectCandidate(
        job,
        undefined,
        `teslim profili ${options.profile}: kaynağın tohumuyla tek aday`,
      );
    else if (action === 'publish') publishJob(job);
    else
      throw new ProtocolError(
        'stage',
        `beklenmeyen adım: ${action}`,
        `${job.jobsRoot}/${job.jobId}`,
      );
  }
  return { result: 'published', manifest: loadJob(job).artifacts.publication?.path ?? null };
}
