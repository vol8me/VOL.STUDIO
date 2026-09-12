export { canHover, hasTouchInput, isTouchPrimary, shouldUseTouchControls } from './capabilities';
export {
  cancelHaptics,
  getHapticsCapability,
  isHapticsEnabled,
  isHapticsSupported,
  observeHapticsCapability,
  setHapticsEnabled,
  setHapticsDriver,
  vibrate,
  type HapticPattern,
  type HapticsBackend,
  type HapticsCapability,
  type HapticsDriver,
} from './haptics';
export { pushBackHandler, getBackHandlerCount, type BackHandler } from './backNavigation';
