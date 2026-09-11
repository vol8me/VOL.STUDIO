import { LocalStorageAdapter, SaveManager } from '@volstudio/core';
import { TauriStoreAdapter, getRuntimePlatform } from '@volstudio/tauri-v2';

/** Tauri kabuğunda uygulama veri dizinine, tarayıcıda localStorage'a yazan depo. */
export function createSaveManager(): SaveManager {
  const adapter =
    getRuntimePlatform() === 'web'
      ? new LocalStorageAdapter()
      : new TauriStoreAdapter({ gameId: 'vol-life' });
  return new SaveManager(adapter);
}
