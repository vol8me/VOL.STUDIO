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
export type { ContextOptions } from './context';
export { ProtocolError } from './errors';
export type { ProtocolErrorCode } from './errors';
export { checkRepoRelative, readJsonFile, resolveInside } from './fs';
export {
  checkFamily,
  DEFAULT_FAMILIES_ROOT,
  FAMILY_STATUS_SCHEMA,
  familyLabel,
  familyStatus,
  listFamilies,
  previewFamily,
  publishFamily,
  PUBLICATION_ANALYSIS_PASSES,
  PUBLICATION_RENDER_PASSES,
  variantJob,
  verifyFamily,
} from './family';
export type {
  FamilyCheck,
  FamilyLocation,
  FamilyPreview,
  FamilyPublishOutcome,
  FamilyStatusV1,
  FamilyVerificationV1,
} from './family';
export {
  checkMusic,
  DEFAULT_MUSIC_ROOT,
  DEFAULT_THEMEBOOKS_ROOT,
  listMusic,
  loadMusicDocuments,
  MUSIC_ANALYSIS_PASSES,
  MUSIC_BUNDLE_SCHEMA,
  MUSIC_RENDER_PASSES,
  MUSIC_STATUS_SCHEMA,
  musicLabel,
  musicStatus,
  previewMusic,
  publishedStems,
  publishMusic,
  stemJob,
  verifyMusic,
} from './music';
export type {
  MusicBundleV1,
  MusicCheckV1,
  MusicDocumentsV1,
  MusicLocation,
  MusicPreviewV1,
  MusicPublishOutcomeV1,
  MusicStatusV1,
  MusicStemEntryV1,
  MusicVerificationV1,
  RenderedAssetV1,
} from './music';
export {
  loadMusicSearchSpec,
  MUSIC_SEARCH_FILE,
  MUSIC_SEARCH_REPORT_FILE,
  promoteMusicCandidate,
  runMusicSearch,
} from './musicSearch';
export type { MusicFinalistV1, MusicPromotionV1, MusicSearchReportV1 } from './musicSearch';
export { JOB_KINDS, PROGRAM_SCHEMAS, RENDERER_VERSIONS } from './kinds';
export type { JobKind } from './kinds';
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
export {
  decodeSample,
  DEFAULT_SAMPLES_ROOT,
  loadSampleLibrary,
  repoSampleResolver,
  SAMPLE_ASSET_SCHEMA,
  SAMPLE_CACHE_ROOT,
  sampleBytes,
  sampleDeclOf,
  synthesizeFixture,
  validateSampleAsset,
  verifySampleLibrary,
} from './samples';
export type { SampleAssetV1, SampleOriginV1, SampleVerificationV1 } from './samples';
export { sameSources, sourcesOf, validateSources } from './sources';
export type { ManifestSampleV1, ManifestSelectionV1, ManifestSourcesV1 } from './sources';
export { soundDesignContext } from './contextSound';
export { resolveDestination, surveyTargets } from './targets';
export type { PublishTarget, TargetRuntime, TargetSurvey } from './targets';
export { readEncoderToolchain, OGG_ENCODER_SETTINGS } from './toolchain';
export type { EncoderToolchain } from './toolchain';
