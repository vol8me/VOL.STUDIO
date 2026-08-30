export { Vector2 } from './math/Vector2';
export { toStepVelocity } from './math/physics';

// Deterministik PRNG. Ses, oyun ve asset compiler'lar aynı uygulamayı kullanır.
export { createRandom, seedFromString, DEFAULT_SEED, type Random } from './random/random';

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

/*
 * Cihaz yetenekleri — ekran üstü kontrol kurup kurmama kararı gibi ÖNCÜL
 * sorular için. Girdi katmanının reaktif `pointer.wasTouch` ayrımından
 * farklıdır; bkz. `platform/capabilities.ts`.
 */
export { canHover, hasTouchInput, isTouchPrimary, shouldUseTouchControls } from './platform';
export {
  cancelHaptics,
  getHapticsCapability,
  observeHapticsCapability,
  isHapticsEnabled,
  isHapticsSupported,
  setHapticsEnabled,
  vibrate,
  type HapticPattern,
  type HapticsBackend,
  type HapticsCapability,
} from './platform';

/*
 * KATMAN 1 — headless primitifler.
 *
 * Hiçbiri oyun kelimesi bilmez ve hiçbiri sunum katmanına bağlı değildir.
 * Yeni bir oyun bunları doğrudan alır.
 */
export { Scheduler, Cooldown, RoundLoop, Clock } from './time';
export type { CancelScheduled, RoundLoopOptions } from './time';
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
export { solveTwoBoneIk, type TwoBoneIkResult } from './math/ik';
export { StateMachine } from './state/StateMachine';
export type { StateDefinition, StateMachineOptions } from './state/StateMachine';
export { ResourcePool, type ResourceCost } from './economy/ResourcePool';
export { ObjectPool, type ObjectPoolOptions } from './pool/ObjectPool';
export { SpatialIndex, type SpatialEntity } from './spatial/SpatialIndex';
export {
  distance,
  distanceSquared,
  segmentCircleEntryT,
  segmentCircleOverlap,
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
// kümeyi tüketici tanımlar (bkz. games/vol-hell/src/config/stats.ts).
export {
  StatBlock,
  type StatModifier,
  type StatModifierType,
  type StatModifierValue,
} from './stats/StatBlock';

export type { BaseEntity } from './entities/BaseEntity';
export { BaseSprite } from './entities/BaseSprite';
export { MovableController, type MovableGameObject } from './entities/MovableController';
/**
 * @deprecated `MovableController` kullan. Bu takma ad yanlış rol iması yaratır;
 * bu takma ad bir sonraki büyük sürümde kaldırılacak.
 */
export { MovableController as PlayerController } from './entities/MovableController';

// Uzuv SÖZLÜĞÜ bilinçli olarak burada yok. `LegGait` yalnız gövde-yerel ev
// konumu ve adım grubu alır; hangi rig'in kaç bacağı olduğunu tüketici bilir.
export {
  RigMotionModel,
  LegGait,
  type RigMotionModelConfig,
  type RigMotionSignals,
  type LegGaitConfig,
  type LegGaitLeg,
} from './rig';

// Eylem SÖZLÜĞÜ bilinçli olarak burada yok. `InputState` jenerik
// `actions: Record<TAction, boolean>` taşır; hangi eylemlerin var olduğunu ve
// hangi tuşa bağlandığını tüketici tanımlar (bkz. games/vol-hell/src/config/input.ts).
export * from './input';

export * as Music from './audio/music';
export { MusicEngine } from './audio/music/engine';
export { MusicPlaylist } from './audio/music/playlist';
export type { MusicPlaylistOptions } from './audio/music/playlist';
export { SidechainDucker } from './audio/sidechain';
export type { DuckingProfile } from './audio/sidechain';
export { SaveManager, LocalStorageAdapter } from './systems/SaveManager';
export type { IStorageAdapter } from './systems/SaveManager';
export { I18n, i18n, i18next, type I18nOptions } from './systems/I18n';
import './systems/i18next-augment';

export {
  FontManager,
  type FontFaceSpec,
  type LoadedFont,
  type FontManagerOptions,
} from './systems/FontManager';
export {
  GraphicsQuality,
  type GraphicsQualityListener,
  type GraphicsQualityOptions,
  type GraphicsQualityProfiles,
} from './quality';
export {
  ViewportManager,
  type MaxDprSetting,
  type ViewportScaleSetting,
  type ViewportConfig,
  type ViewportResult,
  type ScaleStrategy,
} from './systems/ViewportManager';
export { VOL_FONTS, type VolFontFamily } from './systems/DefaultFonts';
export { applyVolViewport, createVolGame, VIEWPORT_REGISTRY_KEY, type VolGameConfig } from './Game';

export * from './ui/primitives';
export * from './ui/layout';
export * from './ui/overlays';
export * from './ui/data';
export * from './ui/feedback';
export * from './ui/controls';
export * from './ui/hud';
export * from './ui/cards';
export { VOL_COLORS, type VolColorToken } from './ui/colors';
export { Easing, animateValue, type AnimateValueOptions } from './ui/animation';
export * from './debug';
