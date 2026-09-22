import { AUDIO_ANALYSIS_SCHEMA, type AudioAnalysisReportV1 } from '../analysis/report';
import { AudioParamError } from '../guard/errors';
import { checkChoice, checkNumber, checkObject, type ParamObject } from '../guard/read';
import { HASH_PATTERN, type Sha256 } from './canonical';
import { ProtocolError } from './errors';
import { checkRepoRelative } from './fs';

/**
 * Job ağacındaki kayıtlar. Üretilen her kayıt ebeveyninin özetini İÇİNDE
 * taşır; bayatlık bu zincirden hesaplanır. Zaman damgası YOKTUR — özetler
 * yalnız içerikten türer, zaman git geçmişindedir.
 */
export const AUDIO_JOB_SCHEMA = 'AudioJobV1';
export const PROTOCOL_VERSION = 1;
export const RENDER_RECORD_SCHEMA = 'AudioRenderRecordV1';
export const ANALYSIS_RECORD_SCHEMA = 'AudioAnalysisRecordV1';
export const SELECTION_SCHEMA = 'AudioSelectionV1';

export const JOB_STAGES = [
  'created',
  'briefed',
  'programmed',
  'rendered',
  'analyzed',
  'selected',
  'published',
] as const;
export type JobStage = (typeof JOB_STAGES)[number];

export interface JobTargetV1 {
  readonly package: string;
  /** Hedef paketin köküne göreli asset yolu (ör. `public/assets/audio/sfx/x.ogg`). */
  readonly asset: string;
  readonly integration: { readonly runtimeKey: string | null; readonly loop: boolean };
}

export interface ArtifactRef {
  readonly path: string;
  readonly hash: Sha256;
}

export interface AudioJobV1 {
  readonly schema: typeof AUDIO_JOB_SCHEMA;
  readonly protocolVersion: typeof PROTOCOL_VERSION;
  readonly jobId: string;
  readonly kind: 'acoustic';
  readonly target: JobTargetV1;
  /** Son BAŞARILI komutun aşaması; etkin aşama dosyalardan yeniden hesaplanır. */
  readonly stage: JobStage;
  readonly revision: number;
  readonly artifacts: {
    readonly brief?: ArtifactRef;
    readonly program?: ArtifactRef & { readonly brief: Sha256 };
    readonly renders: Readonly<Record<string, ArtifactRef>>;
    readonly analyses: Readonly<Record<string, ArtifactRef>>;
    readonly selection?: ArtifactRef;
    readonly publication?: ArtifactRef;
  };
}

export interface RenderRecordV1 {
  readonly schema: typeof RENDER_RECORD_SCHEMA;
  readonly renderId: string;
  readonly programHash: Sha256;
  readonly seed: number;
  readonly rendererVersion: number;
  readonly pcm: {
    readonly hash: Sha256;
    readonly sampleRate: number;
    readonly channels: number;
    readonly frames: number;
  };
  readonly cost: { readonly peakBytes: number; readonly workUnits: number };
}

export interface AnalysisRecordV1 {
  readonly schema: typeof ANALYSIS_RECORD_SCHEMA;
  readonly renderId: string;
  readonly renderHash: Sha256;
  readonly pcmHash: Sha256;
  readonly report: AudioAnalysisReportV1;
}

export interface SelectionV1 {
  readonly schema: typeof SELECTION_SCHEMA;
  readonly renderId: string;
  readonly renderHash: Sha256;
  readonly analysisHash: Sha256;
  readonly pcmHash: Sha256;
  readonly reason: string;
}

export const JOB_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const RENDER_ID = /^r-[0-9a-f]{16}$/;

/** Belge doğrulama hatasını dosya etiketiyle `invalid` protokol hatasına çevirir. */
export function asProtocol<T>(label: string, fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof AudioParamError) throw new ProtocolError('invalid', error.message, label);
    throw error;
  }
}

export function checkHash(value: unknown, path: string): Sha256 {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    throw new AudioParamError(path, 'type', 'sha256:<64 hex> olmalı', value);
  }
  return value as Sha256;
}

function checkId(value: unknown, path: string, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new AudioParamError(path, 'type', `${pattern.source} kalıbına uymalı`, value);
  }
  return value;
}

function checkRef(
  value: unknown,
  path: string,
  expectedPath: string,
  extra: string[] = [],
): ParamObject {
  const o = checkObject(value, path, ['path', 'hash', ...extra]);
  if (o.path !== expectedPath) {
    throw new AudioParamError(`${path}.path`, 'range', `"${expectedPath}" olmalı`, o.path);
  }
  checkHash(o.hash, `${path}.hash`);
  return o;
}

export function renderPath(renderId: string): string {
  return `renders/${renderId}.json`;
}

export function analysisPath(renderId: string): string {
  return `analyses/${renderId}.json`;
}

function checkRefMap(value: unknown, path: string, pathOf: (id: string) => string) {
  const o = checkObject(value, path, Object.keys((value as object) ?? {}));
  for (const [id, ref] of Object.entries(o)) {
    checkId(id, `${path}.${id}`, RENDER_ID);
    checkRef(ref, `${path}.${id}`, pathOf(id));
  }
}

export function validateJob(value: unknown): AudioJobV1 {
  const o = checkObject(value, '', [
    'schema',
    'protocolVersion',
    'jobId',
    'kind',
    'target',
    'stage',
    'revision',
    'artifacts',
  ]);
  if (o.schema !== AUDIO_JOB_SCHEMA)
    throw new AudioParamError('schema', 'type', AUDIO_JOB_SCHEMA, o.schema);
  if (o.protocolVersion !== PROTOCOL_VERSION) {
    throw new AudioParamError(
      'protocolVersion',
      'version',
      `bu araç ${PROTOCOL_VERSION} okur`,
      o.protocolVersion,
    );
  }
  checkId(o.jobId, 'jobId', JOB_ID);
  checkChoice(o.kind, 'kind', ['acoustic'] as const);
  const target = checkObject(o.target, 'target', ['package', 'asset', 'integration']);
  if (typeof target.package !== 'string' || !/^@[a-z0-9-]+\/[a-z0-9.-]+$/.test(target.package)) {
    throw new AudioParamError('target.package', 'type', 'paket adı olmalı', target.package);
  }
  asProtocolPath(target.asset, 'target.asset');
  const integration = checkObject(target.integration, 'target.integration', ['runtimeKey', 'loop']);
  if (
    integration.runtimeKey !== null &&
    (typeof integration.runtimeKey !== 'string' ||
      !/^[a-z0-9/_-]{1,96}$/.test(integration.runtimeKey))
  ) {
    throw new AudioParamError(
      'target.integration.runtimeKey',
      'type',
      'null ya da [a-z0-9/_-] anahtar',
      integration.runtimeKey,
    );
  }
  if (typeof integration.loop !== 'boolean') {
    throw new AudioParamError(
      'target.integration.loop',
      'type',
      'boolean olmalı',
      integration.loop,
    );
  }
  checkChoice(o.stage, 'stage', JOB_STAGES);
  checkNumber(o.revision, 'revision', { min: 0, integer: true });
  const artifacts = checkObject(o.artifacts, 'artifacts', [
    'brief',
    'program',
    'renders',
    'analyses',
    'selection',
    'publication',
  ]);
  if (artifacts.brief !== undefined) checkRef(artifacts.brief, 'artifacts.brief', 'brief.json');
  if (artifacts.program !== undefined) {
    const program = checkRef(artifacts.program, 'artifacts.program', 'program.json', ['brief']);
    checkHash(program.brief, 'artifacts.program.brief');
  }
  checkRefMap(artifacts.renders, 'artifacts.renders', renderPath);
  checkRefMap(artifacts.analyses, 'artifacts.analyses', analysisPath);
  if (artifacts.selection !== undefined)
    checkRef(artifacts.selection, 'artifacts.selection', 'selection.json');
  if (artifacts.publication !== undefined) {
    const publication = checkObject(artifacts.publication, 'artifacts.publication', [
      'path',
      'hash',
    ]);
    asProtocolPath(publication.path, 'artifacts.publication.path');
    checkHash(publication.hash, 'artifacts.publication.hash');
  }
  return value as AudioJobV1;
}

function asProtocolPath(value: unknown, path: string): void {
  try {
    checkRepoRelative(value, path);
  } catch (error) {
    throw new AudioParamError(path, 'type', (error as Error).message, value);
  }
}

export function validateRenderRecord(value: unknown): RenderRecordV1 {
  const o = checkObject(value, '', [
    'schema',
    'renderId',
    'programHash',
    'seed',
    'rendererVersion',
    'pcm',
    'cost',
  ]);
  if (o.schema !== RENDER_RECORD_SCHEMA)
    throw new AudioParamError('schema', 'type', RENDER_RECORD_SCHEMA, o.schema);
  checkId(o.renderId, 'renderId', RENDER_ID);
  checkHash(o.programHash, 'programHash');
  checkNumber(o.seed, 'seed', { min: 0, max: 0xffff_ffff, integer: true });
  checkNumber(o.rendererVersion, 'rendererVersion', { min: 1, integer: true });
  const pcm = checkObject(o.pcm, 'pcm', ['hash', 'sampleRate', 'channels', 'frames']);
  checkHash(pcm.hash, 'pcm.hash');
  checkNumber(pcm.sampleRate, 'pcm.sampleRate', { min: 8000, max: 384000, integer: true });
  checkNumber(pcm.channels, 'pcm.channels', { min: 1, max: 2, integer: true });
  checkNumber(pcm.frames, 'pcm.frames', { min: 1, integer: true });
  const cost = checkObject(o.cost, 'cost', ['peakBytes', 'workUnits']);
  checkNumber(cost.peakBytes, 'cost.peakBytes', { min: 0 });
  checkNumber(cost.workUnits, 'cost.workUnits', { min: 0 });
  return value as RenderRecordV1;
}

export function validateAnalysisRecord(value: unknown): AnalysisRecordV1 {
  const o = checkObject(value, '', ['schema', 'renderId', 'renderHash', 'pcmHash', 'report']);
  if (o.schema !== ANALYSIS_RECORD_SCHEMA)
    throw new AudioParamError('schema', 'type', ANALYSIS_RECORD_SCHEMA, o.schema);
  checkId(o.renderId, 'renderId', RENDER_ID);
  checkHash(o.renderHash, 'renderHash');
  checkHash(o.pcmHash, 'pcmHash');
  const report = checkObject(o.report, 'report', Object.keys((o.report as object) ?? {}));
  if (report.schema !== AUDIO_ANALYSIS_SCHEMA) {
    throw new AudioParamError('report.schema', 'type', AUDIO_ANALYSIS_SCHEMA, report.schema);
  }
  if (report.measuredFrom !== 'source-pcm') {
    throw new AudioParamError(
      'report.measuredFrom',
      'range',
      "job analizi 'source-pcm' ölçer",
      report.measuredFrom,
    );
  }
  return value as AnalysisRecordV1;
}

export function validateSelection(value: unknown): SelectionV1 {
  const o = checkObject(value, '', [
    'schema',
    'renderId',
    'renderHash',
    'analysisHash',
    'pcmHash',
    'reason',
  ]);
  if (o.schema !== SELECTION_SCHEMA)
    throw new AudioParamError('schema', 'type', SELECTION_SCHEMA, o.schema);
  checkId(o.renderId, 'renderId', RENDER_ID);
  checkHash(o.renderHash, 'renderHash');
  checkHash(o.analysisHash, 'analysisHash');
  checkHash(o.pcmHash, 'pcmHash');
  if (typeof o.reason !== 'string' || o.reason.length > 2000) {
    throw new AudioParamError('reason', 'type', 'en çok 2000 karakterlik metin', o.reason);
  }
  return value as SelectionV1;
}
