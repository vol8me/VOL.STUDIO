export { canHover, hasTouchInput, isTouchPrimary, shouldUseTouchControls } from './capabilities';
export {
  cancelHaptics,
  getHapticsCapability,
  isHapticsEnabled,
  isHapticsSupported,
  observeHapticsCapability,
  setHapticsEnabled,
  vibrate,
  type HapticPattern,
  type HapticsBackend,
  type HapticsCapability,
} from './haptics';
export { pushBackHandler, backHandlerCount, type BackHandler } from './backNavigation';
