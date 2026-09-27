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
  planRumblePulses,
  type HapticPattern,
  type HapticsBackend,
  type HapticsCapability,
  type HapticsDriver,
  type RumblePulse,
} from './haptics';
export { displayCapabilitiesForSession, type SessionDisplayCapabilities } from './sessionDisplay';
export {
  pushBackHandler,
  getBackHandlerCount,
  triggerBack,
  type BackHandler,
} from './backNavigation';
