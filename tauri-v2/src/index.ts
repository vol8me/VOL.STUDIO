// Tauri v2 wrapper paketi — native Rust kodu src-tauri/ altında.
// Frontend storage adapter'lari ve native API'ler buradan disa aktarilir.

export { TauriStoreAdapter } from './adapters/TauriStoreAdapter';
export type { StoreIntegrityEvent, TauriStoreAdapterOptions } from './adapters/TauriStoreAdapter';

export { createScopedStores } from './adapters/scopedStores';
export type { ScopedStoresOptions } from './adapters/scopedStores';

export { TauriWindowAdapter } from './window/TauriWindowAdapter';
export type { TauriWindowAdapterOptions } from './window/TauriWindowAdapter';

export { DisplayModeController } from './window/DisplayModeController';
export type {
  DisplayMode,
  DisplayModeControllerOptions,
  DisplayWindow,
} from './window/DisplayModeController';

export { getRuntimePlatform } from './platform/runtimePlatform';
export type { RuntimePlatform, RuntimePlatformProbe } from './platform/runtimePlatform';

export { getSessionKind } from './platform/sessionKind';
export type { SessionKind, SessionKindProbe } from './platform/sessionKind';

export { registerShutdownFlush } from './platform/shutdownFlush';
export type { ShutdownFlushHook, ShutdownFlushProbe } from './platform/shutdownFlush';

export { onSystemResume, registerSuspendFlush } from './platform/systemSleep';
export type { ResumeListener, SuspendHook, SystemSleepProbe } from './platform/systemSleep';

export {
  getDiagnosticsEnv,
  isDeckMeasureRequested,
  reportDiagnostics,
} from './platform/diagnostics';
export type { DiagnosticsProbe } from './platform/diagnostics';

export {
  createLinuxHapticsDriver,
  getLinuxHapticsStatus,
  observeLinuxHaptics,
  registerLinuxHaptics,
} from './platform/linuxHaptics';
export type { LinuxHapticsProbe, LinuxHapticsStatus } from './platform/linuxHaptics';

export {
  androidScreenOrientation,
  observeViewportOrientation,
  readViewportOrientation,
  waitForViewportOrientation,
} from './platform/screenOrientation';
export type { ScreenOrientation, ScreenOrientationState } from './platform/screenOrientation';

export {
  activateSteamActionSet,
  cloudFileKey,
  cloudFileName,
  createSteamCloudAdapter,
  createSteamworksTextEntryProvider,
  onSteamFloatingKeyboardDismissed,
  onSteamOverlay,
  setSteamInputManifest,
  setSteamworksProbe,
  showSteamBindingPanel,
  showSteamFloatingKeyboard,
  steamActionGlyph,
  steamControllers,
  steamworksGlyphContext,
  steamworksStatus,
} from './platform/steamworks';
export type {
  SteamControllerInfo,
  SteamGlyphOrigin,
  SteamworksProbe,
  SteamworksStatus,
} from './platform/steamworks';
