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

export {
  StatBlock,
  STAT_KEYS,
  type StatKey,
  type StatModifier,
  type StatModifierType,
  type StatModifierValue,
  type StatBaseValues,
} from './stats/StatBlock';

export type { BaseEntity } from './entities/BaseEntity';
export { BaseSprite } from './entities/BaseSprite';
export { PlayerController, type MovableGameObject } from './entities/PlayerController';

export type { InputState } from './input/InputState';
export type { InputProvider } from './input/InputProvider';
export type {
  InputSnapshot,
  PcInputSnapshot,
  TouchInputSnapshot,
  TouchStickSnapshot,
} from './input/InputSnapshot';
export { InputManager } from './input/InputManager';
export * as InputUtils from './input/InputUtils';
export { PCController } from './input/PCController';
export { TouchController } from './input/TouchController';

export * as Synth from './audio/synth';
export * as Music from './audio/music';
export { MusicEngine } from './audio/music/engine';
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
