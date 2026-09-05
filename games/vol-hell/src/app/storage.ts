import { isTauri } from '@tauri-apps/api/core';
import { SaveManager, LocalStorageAdapter, type IStorageAdapter } from '@volstudio/core';
import { TauriStoreAdapter } from '@volstudio/tauri-v2';

const GAME_ID = 'vol-hell';

/** Çalışma ortamına göre en uygun storage adapter'ini seçer. */
export function createStorageAdapter(): IStorageAdapter {
  return isTauri() ? new TauriStoreAdapter({ gameId: GAME_ID }) : new LocalStorageAdapter();
}

/** Uygulama genelinde kullanılacak SaveManager instance'ini oluşturur. */
export function createSaveManager(): SaveManager {
  return new SaveManager(createStorageAdapter());
}
