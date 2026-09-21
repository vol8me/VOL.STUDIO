export { createIdleActions, type InputState } from './InputState';
export type { InputProvider } from './InputProvider';
export type {
  PCActionBinding,
  PointerButton,
  MoveDownState,
  PointerLikeState,
} from './PCInputState';
export { resolvePCActions, computePCInputState, isPCInputActive } from './PCInputState';
export type { TouchStickOptions } from './TouchStickState';
export type { TouchControllerOptions } from '../phaser/input/TouchController';
export type { NormalizedInputRegion } from './InputUtils';
export type { InputManagerOptions } from '../phaser/input/InputManager';
export {
  DEFAULT_MOVE_KEYS,
  type MoveKeyBindings,
  type PCControllerOptions,
} from '../phaser/input/PCController';
export {
  NO_ACTIVE_PROVIDER,
  createSingleProviderSnapshot,
  createIdleSnapshot,
  type ProviderSnapshot,
  type InputSnapshot,
  type PcInputSnapshot,
  type TouchInputSnapshot,
  type TouchStickSnapshot,
} from './InputSnapshot';
export { InputManager } from '../phaser/input/InputManager';
export { VirtualActionSource } from './VirtualActionSource';
export * as InputUtils from './InputUtils';
export { PCController } from '../phaser/input/PCController';
export { TouchController } from '../phaser/input/TouchController';
