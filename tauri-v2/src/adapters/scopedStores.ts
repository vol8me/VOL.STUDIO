import { LocalStorageAdapter } from '@volstudio/core';
import type { ScopedStores } from '@volstudio/core';
import { isTauri } from '@tauri-apps/api/core';
import { TauriStoreAdapter } from './TauriStoreAdapter';

/**
 * Oyunun iki kapsamlı store'unu üretir: `synced` kayıtlar
 * `{gameId}-synced.json`, `device` kayıtlar `{gameId}-device.json` dosyasına
 * gider. Steam Cloud'un Auto-Cloud yapılandırması yalnız `*-synced.json`
 * kalıbını işaret eder — böylece cihaz ayarları hiçbir zaman buluta kaçmaz.
 *
 * Tarayıcıda iki adapter da localStorage'a düşer; kapsam ayrımı anahtar
 * önekleriyle korunur ve aynı `ScopedSaveManager` sözleşmesi çalışır.
 */
export function createScopedStores(gameId: string): ScopedStores {
  if (isTauri()) {
    return {
      synced: new TauriStoreAdapter({ path: `${gameId}-synced.json` }),
      device: new TauriStoreAdapter({ path: `${gameId}-device.json` }),
    };
  }
  return { synced: new LocalStorageAdapter(), device: new LocalStorageAdapter() };
}
