/**
 * Agent protokolü (Node-only): kanonik JSON + özet, `AudioJobV1` durum
 * makinesi, kayıtlar, `AudioAssetManifestV1` ve TEK publish kapısı.
 * `audio:job` CLI'ı bu yüzeyin ince bir kabuğudur.
 */
export {
  canonicalJson,
  CanonicalJsonError,
  hashCanonical,
  hashPcm,
  prettyCanonicalJson,
  sha256Bytes,
} from './canonical';
export type { Sha256 } from './canonical';
export { buildContext, CONTEXT_SCHEMA } from './context';
export { ProtocolError } from './errors';
export type { ProtocolErrorCode } from './errors';
export { checkRepoRelative } from './fs';
export {
  analyzeCandidate,
  initJob,
  listJobs,
  registerBrief,
  registerProgram,
  renderCandidate,
  renderIdOf,
  selectCandidate,
} from './job';
export type { InitOptions, RenderOptions, RenderOutcome } from './job';
export { AUDITION_ROOT, DEFAULT_JOBS_ROOT } from './location';
export type { JobLocation } from './location';
export { ASSET_MANIFEST_SCHEMA, classifyAssetChange, validateManifest } from './manifest';
export type { AssetChange, AssetIdentity, AudioAssetManifestV1 } from './manifest';
export { publishJob, registryHash, verifyManifest } from './publish';
export type { AssetVerificationV1, PublishOutcome, VerificationCheck } from './publish';
export { JOB_STAGES, PROTOCOL_VERSION } from './records';
export type { AudioJobV1, JobStage, JobTargetV1 } from './records';
export { jobStatus, JOB_STATUS_SCHEMA } from './status';
export type { ArtifactState, JobStatusV1, NextAction } from './status';
export { resolveDestination, surveyTargets } from './targets';
export type { PublishTarget, TargetRuntime, TargetSurvey } from './targets';
export { readEncoderToolchain, OGG_ENCODER_SETTINGS } from './toolchain';
export type { EncoderToolchain } from './toolchain';
