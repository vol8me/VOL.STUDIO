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
export { EXPORT_ROOT, writeAuditionCopy } from './audition';
export {
  auditionState,
  exportAuditionPage,
  LOOPBACK_HOSTS,
  startAuditionServer,
} from './auditionServer';
export type { AuditionServer, AuditionServerOptions, AuditionStateV1 } from './auditionServer';
export {
  CANARIES_ROOT,
  CANARY_AUDITION_ROOT,
  CANARY_REVIEWS_SCHEMA,
  CANARY_SCHEMA,
  canaryReviews,
  loadCanaries,
  recordCanaryReview,
  runCanaries,
  runCanary,
  validateCanary,
} from './canary';
export type {
  CanaryResultV1,
  CanaryReviewState,
  CanaryReviewStatus,
  CanaryReviewsV1,
  OrganicCanaryV1,
} from './canary';
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
  storeProgram,
} from './job';
export type { InitOptions, RenderOptions, RenderOutcome } from './job';
export { AUDITION_ROOT, DEFAULT_JOBS_ROOT } from './location';
export type { JobLocation } from './location';
export { ASSET_MANIFEST_SCHEMA, classifyAssetChange, validateManifest } from './manifest';
export type { AssetChange, AssetIdentity, AudioAssetManifestV1 } from './manifest';
export { publishJob, registryHash, verifyManifest } from './publish';
export type { AssetVerificationV1, PublishOutcome, VerificationCheck } from './publish';
export { originState, PROGRAM_ORIGIN_SCHEMA, validateOrigin } from './origin';
export type { FamilyOriginV1, OriginState, ProgramOriginV1, SearchOriginV1 } from './origin';
export { JOB_STAGES, PROTOCOL_VERSION } from './records';
export type { AudioJobV1, JobStage, JobTargetV1 } from './records';
export { jobStatus, JOB_STATUS_SCHEMA } from './status';
export type { ArtifactState, JobStatusV1, NextAction } from './status';
export {
  auditionPath,
  DEFAULT_SEARCHES_ROOT,
  exportSearchAudition,
  listSearches,
  loadSearch,
  previewSearch,
  promoteCandidate,
  recordDecision,
  runSearch,
  SEARCH_AUDITION_ROOT,
  SEARCH_STATUS_SCHEMA,
  searchStatus,
  verifySearch,
} from './search';
export type {
  LoadedSearch,
  SearchLocation,
  SearchRunOutcome,
  SearchStatusV1,
  SearchVerificationV1,
} from './search';
export { resolveDestination, surveyTargets } from './targets';
export type { PublishTarget, TargetRuntime, TargetSurvey } from './targets';
export { readEncoderToolchain, OGG_ENCODER_SETTINGS } from './toolchain';
export type { EncoderToolchain } from './toolchain';
