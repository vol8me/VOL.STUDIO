export { createScopedStores } from './adapters/scopedStores';
export { DisplayModeController } from './window/DisplayModeController';
export { getRuntimePlatform, type RuntimePlatform } from './platform/runtimePlatform';
export { getSessionKind, type SessionKind } from './platform/sessionKind';
export { registerShutdownFlush } from './platform/shutdownFlush';
export { singleVirtualPad, steamVirtualGamepads } from './platform/virtualGamepads';
export { onSystemResume, registerSuspendFlush } from './platform/systemSleep';
export {
  getDiagnosticsEnv,
  isDeckMeasureRequested,
  reportDiagnostics,
} from './platform/diagnostics';
export { observeLinuxHaptics } from './platform/linuxHaptics';
export { observeAndroidHaptics } from './platform/androidHaptics';
export { androidScreenOrientation } from './platform/screenOrientation';
export {
  activateSteamActionSet,
  createSteamworksTextEntryProvider,
  onSteamOverlay,
  steamworksGlyphContext,
  steamworksStatus,
  type SteamworksStatus,
} from './platform/steamworks';
