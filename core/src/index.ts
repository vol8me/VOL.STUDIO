export { Vector2 } from './math/Vector2';
export { toStepVelocity } from './math/physics';

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

export type { BaseEntity } from './entities/BaseEntity';
export { BaseSprite } from './entities/BaseSprite';
export { PlayerController, type MovableGameObject } from './entities/PlayerController';

export type { InputState } from './input/InputState';
export type { InputProvider } from './input/InputProvider';
export { InputManager } from './input/InputManager';
export * as InputUtils from './input/InputUtils';
export { PCController } from './input/PCController';
export { TouchController } from './input/TouchController';

export { AudioManager } from './systems/AudioManager';
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
export { VOL_COLORS, type VolColorToken } from './ui/colors';
export { Easing, animateValue, type AnimateValueOptions } from './ui/animation';
