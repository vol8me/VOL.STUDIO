import {
  LocalStorageAdapter,
  migrateLegacyStore,
  ScopedSaveManager,
} from '@volstudio/core/persistence';
import type { LegacyKeyMapping, MigrationReport, ScopedStores } from '@volstudio/core/persistence';
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

/** Eski kaynağı korur; göç tamamlanmadan oyun state'i yüklenmez. */
export function migrateScopedStores(
  gameId: string,
  stores: ScopedStores,
  mappings: readonly LegacyKeyMapping[],
  options: ScopedStoresOptions = {},
): Promise<MigrationReport> {
  const native = isTauri();
  const source = native
    ? new TauriStoreAdapter({ gameId, onIntegrity: options.onIntegrity })
    : new LocalStorageAdapter();
  return migrateLegacyStore({
    legacy: source,
    scoped: new ScopedSaveManager(stores),
    mappings,
    defaultScope: 'device',
    retainSource: true,
    skipScopedKeys: !native,
    // localStorage origin'e aittir; başka oyunun kayıtları bu oyunun göçü değildir.
    keyPrefix: native ? undefined : `${gameId}.`,
  });
}
