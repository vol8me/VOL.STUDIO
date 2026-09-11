// Tauri v2 wrapper paketi — native Rust kodu src-tauri/ altında.
// Frontend storage adapter'lari ve native API'ler buradan disa aktarilir.

export { TauriStoreAdapter } from './adapters/TauriStoreAdapter';
export type { TauriStoreAdapterOptions } from './adapters/TauriStoreAdapter';

export { GameStateDb } from './storage/GameStateDb';
export type { GameStateDbOptions, SaveGame } from './storage/GameStateDb';
export { GameStateDbError } from './storage/GameStateDbError';

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

export {
  androidScreenOrientation,
  observeViewportOrientation,
  readViewportOrientation,
  waitForViewportOrientation,
} from './platform/screenOrientation';
export type { ScreenOrientation, ScreenOrientationState } from './platform/screenOrientation';
