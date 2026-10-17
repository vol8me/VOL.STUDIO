/*
 * Phaser taşımayan kol yüzeyi — `@volstudio/core/input/gamepad` alt yolu.
 * `input/index.ts` köprüleri de ihraç ettiği için tarayıcı araçları
 * (vol-showcase) bu dar kapıyı kullanır.
 */
export {
  GAMEPAD_BUTTON,
  GAMEPAD_DEFAULT_DEAD_ZONE,
  computeGamepadInput,
  isGamepadInputActive,
  resolveGamepadActions,
  readStick,
  type GamepadActionBinding,
  type GamepadInputOptions,
  type PadLike,
} from './GamepadState';
export {
  GamepadController,
  type GamepadControllerOptions,
  type GamepadInputSnapshot,
} from './GamepadController';
export { InputModeArbiter, inputModeForSession, type InputModePolicyOptions } from './inputMode';
export { selectGamepad, type GamepadSelectionOptions } from './selectGamepad';
export type { InputProvider } from './InputProvider';
export { createIdleActions, type InputState } from './InputState';
export {
  createSingleProviderSnapshot,
  type InputSnapshot,
  type ProviderSnapshot,
} from './InputSnapshot';
export { ActionEdges } from './ActionEdges';
