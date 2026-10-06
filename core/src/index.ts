export { Vector2 } from './math/Vector2';

// Deterministik PRNG. Ses, oyun ve asset compiler'lar aynı uygulamayı kullanır.
export {
  createRandom,
  createStatefulRandom,
  seedFromString,
  DEFAULT_SEED,
  type Random,
  type StatefulRandom,
} from './random/random';
export { describePCBinding, findBindingConflicts, isSameBinding } from './input/bindingLabels';

export {
  DisposableScope,
  type CancellableDisposable,
  type Destroyable,
  type Disposable,
} from './lifecycle/DisposableScope';
export {
  getAppVisibility,
  observeAppVisibility,
  type AppVisibilityOptions,
  type AppVisibilityState,
} from './lifecycle/appVisibility';
export {
  observeWakeGaps,
  resumeAudioAfterWake,
  type WakeableAudioContext,
  type WakeGapOptions,
} from './lifecycle/wakeGaps';
export {
  AutosaveCoordinator,
  isScopedKey,
  migrateLegacyStore,
  PersistedObservableState,
  scopeOfKey,
  ScopedSaveManager,
  type AutosaveCoordinatorOptions,
  type KeyEnumerable,
  type LegacyKeyMapping,
  type MigrationReport,
  type PersistedObservableStateOptions,
  type PersistenceOperation,
  type PersistenceStore,
  type ScopedKey,
  type ScopedStores,
  type StorageScope,
} from './persistence';

/*
 * Cihaz yetenekleri — ekran üstü kontrol kurup kurmama kararı gibi ÖNCÜL
 * sorular için. Girdi katmanının reaktif `pointer.wasTouch` ayrımından
 * farklıdır; bkz. `platform/capabilities.ts`.
 */
export { canHover, hasTouchInput, isTouchPrimary, shouldUseTouchControls } from './platform';
export { pushBackHandler, getBackHandlerCount, triggerBack, type BackHandler } from './platform';
export { displayCapabilitiesForSession, type SessionDisplayCapabilities } from './platform';
export {
  cancelHaptics,
  getHapticsCapability,
  observeHapticsCapability,
  isHapticsEnabled,
  isHapticsSupported,
  setHapticsEnabled,
  setHapticsDriver,
  vibrate,
  planRumblePulses,
  type HapticPattern,
  type HapticsBackend,
  type HapticsCapability,
  type HapticsDriver,
  type RumblePulse,
} from './platform';

/*
 * KATMAN 1 — headless primitifler.
 *
 * Hiçbiri oyun kelimesi bilmez ve hiçbiri sunum katmanına bağlı değildir.
 * Yeni bir oyun bunları doğrudan alır.
 */
/*
 * Zaman. `clampSimulationStep` bir SÖZLEŞMEDİR, kolaylık değil: zamanı tüketen
 * bütün alt sistemler aynı tavanı paylaşmazsa aynı karede farklı kadar zaman
 * yaşarlar (bkz. `time/simulationStep.ts`).
 */
export {
  Scheduler,
  Cooldown,
  RoundLoop,
  Clock,
  clampSimulationStep,
  SimulationClock,
} from './time';
export type {
  CancelScheduled,
  RoundLoopOptions,
  SimulationStep,
  SimulationClockConfig,
  PartialStepPolicy,
  SimulationClockFrame,
  SimulationClockAdvanceOptions,
} from './time';
export type { SchedulerOptions } from './time/Scheduler';
export { EventBus, type Unsubscribe } from './events/EventBus';
export {
  Grid,
  findPath,
  PathFinder,
  FlowField,
  bresenhamLine,
  hasLineOfSight,
  ORTHOGONAL_NEIGHBOURS,
  DIAGONAL_NEIGHBOURS,
  type GridPoint,
  type FindPathOptions,
  type FlowFieldOptions,
  type LineOfSightOptions,
} from './grid';
export {
  RingBuffer,
  Deck,
  SlotContainer,
  MinHeap,
  type DeckOptions,
  type Slot,
  type SlotContainerOptions,
} from './collections';
export { WeightedPicker, type WeightedEntry } from './random/WeightedPicker';
export { isFiniteNumber, requireFinite, finiteOr, finitePositiveOr } from './math/numeric';
export {
  clamp,
  clamp01,
  lerp,
  inverseLerp,
  remap,
  approach,
  damp,
  wrap,
} from './math/interpolation';
export { Spring1D, type SpringConfig } from './math/Spring';
export { wrapAngle, angleDelta, rotateTowards, lerpAngle } from './math/angle';
export { valueNoise } from './random/noise';
export { FollowCamera, type FollowCameraConfig } from './camera';

/*
 * Düzlem katı cisim fiziği: kuvvet/itki alan cisim, düz duvar teması ve iki
 * dikdörtgen cisim arasındaki temas. Render motorundan bağımsızdır; araç
 * dinamiği (palet, tekerlek) tüketicinin kuvvet modelidir.
 */
export {
  RigidBody,
  createContact,
  resolveWallContacts,
  resolveBodyContact,
  type Contact,
  type ContactShape,
  type Wall,
} from './physics';
export { solveTwoBoneIk, type TwoBoneIkResult } from './math/ik';
export { StateMachine } from './state/StateMachine';
export type { StateDefinition, StateMachineOptions } from './state/StateMachine';
export { ResourcePool, type ResourceCost } from './state/ResourcePool';
export {
  CommandHistory,
  CommandTransaction,
  type HistoryCommand,
  type CommandHistorySnapshot,
  type CommandHistoryOptions,
} from './state/CommandHistory';
export {
  FullscreenController,
  type FullscreenControllerOptions,
} from './platform/FullscreenController';
export { ObjectPool, type ObjectPoolOptions } from './pool/ObjectPool';
export { SpatialIndex, type SpatialEntity } from './spatial/SpatialIndex';
export {
  distance,
  distanceSquared,
  segmentCircleEntryT,
  segmentCircleOverlap,
  segmentOrientedBoxEntryT,
  circlesOverlap,
  pointInCircle,
  pointInRect,
  rectsOverlap,
  circleRectOverlap,
  raycastCircles,
  type Circle,
  type Rect,
  type RayHit,
} from './math/geometry';

export {
  INPUT,
  UI_DEPTH,
  UI_ALPHA,
  UI_SIZE,
  UI_RATIO,
  UI_TIMING,
  UI_THRESHOLD,
  UI_CAPACITY,
  PINCH_ZOOM,
  TECH,
} from './constants';

// Stat SÖZLÜĞÜ bilinçli olarak burada yok. Motor jeneriktir (`StatBlock<TStat>`);
// kümeyi tüketici tanımlar.
export {
  StatBlock,
  type StatModifier,
  type StatModifierType,
  type StatModifierValue,
} from './state/StatBlock';

export type { BaseEntity } from './phaser/entities/BaseEntity';
export { BaseSprite } from './phaser/entities/BaseSprite';
export { MovableController, type MovableGameObject } from './phaser/entities/MovableController';

// Uzuv SÖZLÜĞÜ bilinçli olarak burada yok. `LegGait` yalnız gövde-yerel ev
// konumu ve adım grubu alır; hangi rig'in kaç bacağı olduğunu tüketici bilir.
/*
 * Destek poligonu bir FİZİK MOTORU değildir: kütle, kuvvet ve kısıt çözücü
 * taşımaz. Tek soruyu ölçer — gövde, yere basan ayakların çevrelediği alanın
 * içinde mi? Bacaklı bir yaratıkta "devriliyor mu?" sorusunun ilk yaklaşımı
 * budur ve yürüyüş döngüsünün SIRA disipliniyle verdiği dolaylı güvenceyi
 * ölçülebilir kılar. Ne yapılacağına tüketici karar verir.
 */
export { measureSupport } from './rig';
export type { SupportFoot, SupportQuery, SupportState } from './rig';

export {
  RigMotionModel,
  LegGait,
  GazeDriver,
  type RigMotionModelConfig,
  type RigMotionSignals,
  type LegGaitConfig,
  type LegGaitLeg,
  type LegGaitStepTuning,
  type GazeDriverConfig,
  type GazeSignals,
} from './rig';

/*
 * Rig VARLIK katmanı: üretilmiş bir parça ağacını (metadata + texture) doğrular,
 * montaja hazır bir tanıma çevirir ve sahnede kurar.
 *
 * Bu yüzey ÜRETİLMİŞ VERİNİN sözleşmesidir, bir aracın API'si değil. Metadata'yı
 * hangi tasarım aracının yazdığı CORE'un konusu değildir; tüketici dosyayı verir,
 * CORE onu okur. Böylece bir oyunun çalışma zamanı, asset'ini üreten araca
 * bağlanmadan eklemli bir varlığı sahneye kurabilir.
 */
export type {
  Point,
  Size,
  RigPartMetadata,
  RigPreviewMetadata,
  RigMetadata,
  RigPartAsset,
  RigDefinition,
  RigArticulation,
  PartLayout,
  AssembledRig,
} from './rig';
export {
  validateRigMetadata,
  buildRigDefinition,
  articulateRigDefinition,
  computePartLayout,
  preloadRigTextures,
  assembleRig,
} from './rig';

/*
 * Sunum efektleri. Bir görüntü ağacının POZUNU okur ve ondan türetilmiş
 * ikinci bir görüntü çizer (art-görüntü, gölge); simülasyona dokunmaz.
 */
export { poseSourceOf } from './phaser/poseSource';
export {
  samplePose,
  GhostTrail,
  PoseShadow,
  type PoseSample,
  type PoseSampleScratch,
  type PoseSourceNode,
  type PoseTransform,
  type PoseSprite,
  type PoseSpriteScene,
  type GhostTrailOptions,
  type PoseShadowOptions,
} from './fx';

// Eylem SÖZLÜĞÜ bilinçli olarak burada yok. `InputState` jenerik
// `actions: Record<TAction, boolean>` taşır; hangi eylemlerin var olduğunu ve
// hangi tuşa bağlandığını tüketici tanımlar.
export * from './input';

export * as Music from './audio/music';
export { MusicEngine } from './audio/music/engine';
export { MusicPlaylist } from './audio/music/playlist';
export type { MusicPlaylistOptions } from './audio/music/playlist';
export { SidechainDucker } from './audio/sidechain';
export type { DuckingProfile } from './audio/sidechain';
export { SaveManager, LocalStorageAdapter } from './persistence/SaveManager';
export type { IStorageAdapter } from './persistence/SaveManager';
export { I18n, i18n, i18next, type I18nOptions } from './i18n/I18n';
import './i18n/i18next-augment';

export {
  FontManager,
  type FontFaceSpec,
  type LoadedFont,
  type FontManagerOptions,
} from './fonts/FontManager';
export {
  GraphicsQuality,
  type GraphicsQualityListener,
  type GraphicsQualityOptions,
  type GraphicsQualityProfiles,
} from './graphics';
export {
  ViewportManager,
  type ViewportScaleSetting,
  type ViewportConfig,
  type ViewportResult,
  type ScaleStrategy,
} from './phaser/ViewportManager';
export { VOL_FONTS, type VolFontFamily } from './fonts/DefaultFonts';
export {
  applyVolViewport,
  createVolGame,
  VIEWPORT_REGISTRY_KEY,
  type VolGameConfig,
  type RendererRequest,
} from './phaser/createVolGame';

export * from './ui/primitives';
export * from './ui/layout';
export * from './ui/overlays';
export * from './ui/data';
export * from './ui/feedback';
export * from './ui/touch';
export * from './ui/camera';
export * from './ui/buttons';
export * from './ui/hud';
export * from './ui/cards';
export * from './ui/focus';
export * from './ui/textEntry';
export * from './ui/glyphs';
export { suppressNativeMenus } from './ui/nativeMenus';
export { VOL_COLORS, type VolColorToken } from './ui/colors';
export { Easing, animateValue, type AnimateValueOptions } from './ui/animation';

/*
 * Tek-atış ses bankası. Müzik motoru katmanlı ve zamanlanmış akış içindir;
 * bu ise varyantlı, bütçeli, anlık tetiklemelerdir.
 */
export {
  SoundBank,
  type SoundBankOptions,
  type PlayOptions,
  SoundFamilyBank,
  type SoundFamilyQuery,
  type SoundFamilyVariant,
  LoopBlend,
  type LoopBlendLayer,
  type LoopBlendOptions,
} from './audio/sfx';
export * from './diagnostics';
