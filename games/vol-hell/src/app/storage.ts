import { isTauri } from '@tauri-apps/api/core';
import { SaveManager, LocalStorageAdapter, type IStorageAdapter } from '@volstudio/core';
import { TauriStoreAdapter } from '@volstudio/tauri-v2';

const GAME_ID = 'vol-hell';

/** Calisma ortamina gore en uygun storage adapter'ini secer. */
export function createStorageAdapter(): IStorageAdapter {
  return isTauri() ? new TauriStoreAdapter({ gameId: GAME_ID }) : new LocalStorageAdapter();
}

/** Uygulama genelinde kullanilacak SaveManager instance'ini olusturur. */
export function createSaveManager(): SaveManager {
  return new SaveManager(createStorageAdapter());
}
