import { LocalStorageAdapter } from '@volstudio/core';
import type { ScopedStores } from '@volstudio/core';
import { isTauri } from '@tauri-apps/api/core';
import { TauriStoreAdapter } from './TauriStoreAdapter';
import type { StoreIntegrityEvent } from './TauriStoreAdapter';

export interface ScopedStoresOptions {
  /** Bir kapsam dosyası yedekten okunduğunda ya da boş kayıtla başladığında. */
  readonly onIntegrity?: (event: StoreIntegrityEvent) => void;
}

/**
 * Oyunun iki kapsamlı store'unu üretir: `synced` kayıtlar
 * `{gameId}-synced.json`, `device` kayıtlar `{gameId}-device.json` dosyasına
 * gider. Steam Cloud'un Auto-Cloud yapılandırması yalnız `*-synced.json`
 * kalıbını işaret eder — böylece cihaz ayarları hiçbir zaman buluta kaçmaz.
 *
 * Tarayıcıda iki adapter da localStorage'a düşer; kapsam ayrımı anahtar
 * önekleriyle korunur ve aynı `ScopedSaveManager` sözleşmesi çalışır.
 */
export function createScopedStores(
  gameId: string,
  options: ScopedStoresOptions = {},
): ScopedStores {
  if (isTauri()) {
    const { onIntegrity } = options;
    return {
      synced: new TauriStoreAdapter({ path: `${gameId}-synced.json`, onIntegrity }),
      device: new TauriStoreAdapter({ path: `${gameId}-device.json`, onIntegrity }),
    };
  }
  return { synced: new LocalStorageAdapter(), device: new LocalStorageAdapter() };
}
