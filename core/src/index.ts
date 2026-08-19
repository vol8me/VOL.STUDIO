export { Vector2 } from './math/Vector2';
export { toStepVelocity } from './math/physics';

// Deterministik PRNG. Ses sentezinde doğdu ama motor geneli bir yardımcıdır;
// oyun tarafı da (spawn, davranış) aynı uygulamayı kullanır — ikinci bir PRNG
// yazmak determinizmi iki ayrı yerde doğrulanması gereken bir soruna çevirir.
// Kendi namespace'inde yaşar (`core/src/random/`); `audio/synth/random.ts`
// yalnızca sentez modülü içi importlar için bırakılan bir re-export shim'idir.
export { createRandom, seedFromString, DEFAULT_SEED, type Random } from './random/random';

export { DisposableScope, type Disposable } from './lifecycle/DisposableScope';

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

// Stat SÖZLÜĞÜ bilinçli olarak burada yok: `StatKey`/`STAT_KEYS`/`StatBaseValues`
// CORE'dan kaldırıldı, çünkü 'damage'/'fireRate' bir oyunun kelimesidir. Motor
// jeneriktir (`StatBlock<TStat>`); kümeyi tüketici tanımlar
// (bkz. games/vol-hell/src/config/stats.ts).
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
 * @deprecated `MovableController` kullan. Sınıf hiçbir zaman oyuncuya özel
 * bir davranış taşımadı; eski ad CORE'da olmayan bir rol ima ediyordu.
 * Bu takma ad bir sonraki büyük sürümde kaldırılacak.
 */
export { MovableController as PlayerController } from './entities/MovableController';

// Eylem SÖZLÜĞÜ bilinçli olarak burada yok: `InputState.fire`/`dash` alanları
// kaldırıldı, yerine `actions: Record<TAction, boolean>` geldi. Hangi eylemlerin
// var olduğunu ve hangi tuşa bağlandığını tüketici tanımlar
// (bkz. games/vol-hell/src/config/input.ts).
export { createIdleActions, type InputState } from './input/InputState';
export type { InputProvider } from './input/InputProvider';
export type {
  PCActionBinding,
  PointerButton,
  MoveDownState,
  PointerLikeState,
} from './input/PCInputState';
export { resolvePCActions, computePCInputState, isPCInputActive } from './input/PCInputState';
export type { TouchStickOptions } from './input/TouchStickState';
export type { InputManagerOptions } from './input/InputManager';
export {
  DEFAULT_MOVE_KEYS,
  type MoveKeyBindings,
  type PCControllerOptions,
} from './input/PCController';
// Sağlayıcı kümesi AÇIK olduğu için tüketici kendi modality'sini yazabilmeli:
// `singleProviderSnapshot`/`idleSnapshot` olmadan `activeProvider` ile
// `providers` anahtarını elle senkron tutmak gerekir ve ayrışırlarsa overlay
// sessizce boş görünür.
export {
  NO_ACTIVE_PROVIDER,
  singleProviderSnapshot,
  idleSnapshot,
  type ProviderSnapshot,
  type InputSnapshot,
  type PcInputSnapshot,
  type TouchInputSnapshot,
  type TouchStickSnapshot,
} from './input/InputSnapshot';
export { InputManager } from './input/InputManager';
export * as InputUtils from './input/InputUtils';
export { PCController } from './input/PCController';
export { TouchController } from './input/TouchController';

export * as Synth from './audio/synth';
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
  ViewportManager,
  type ViewportConfig,
  type ViewportResult,
  type ScaleStrategy,
} from './systems/ViewportManager';
export { VOL_FONTS, type VolFontFamily } from './systems/DefaultFonts';
export { createVolGame, type VolGameConfig } from './Game';

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
