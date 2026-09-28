import { isTauri } from '@tauri-apps/api/core';
import {
  LocalStorageAdapter,
  ScopedSaveManager,
  migrateLegacyStore,
  type IStorageAdapter,
  type KeyEnumerable,
  type LegacyKeyMapping,
  type MigrationReport,
} from '@volstudio/core';
import { TauriStoreAdapter, createScopedStores } from '@volstudio/tauri-v2';

const GAME_ID = 'vol-hell';

/**
 * İki kapsamlı SaveManager: `synced.*` kayıtlar `vol-hell-synced.json`'a
 * (Steam Cloud'un Auto-Cloud hedefi), `device.*` kayıtlar
 * `vol-hell-device.json`'a gider. Tarayıcıda ikisi de localStorage'a düşer;
 * kapsam ayrımı anahtar önekleriyle korunur (bkz. `core/scopedStorage`).
 */
export function createSaveManager(): ScopedSaveManager {
  return new ScopedSaveManager(createScopedStores(GAME_ID));
}

/**
 * Tek dosyalı eski kayıttaki (`vol-hell-store.json` / localStorage) anahtarların
 * hedef kapsamları. `synced` yalnızca cihazlar arası ilerlemedir; ayarlar ve
 * tuş eşlemesi cihazın parçasıdır ve buluta yazılmaz.
 */
export const LEGACY_KEY_SCOPES: readonly LegacyKeyMapping[] = [
  { key: 'vol-hell:game-stats', scope: 'synced' },
  { key: 'vol-locale', scope: 'device' },
  { key: 'vol-hell:audio-settings', scope: 'device' },
  { key: 'vol-hell:video-settings', scope: 'device' },
  { key: 'vol-hell:key-bindings', scope: 'device' },
];

/** Eski tek dosyalı kayıt düzeni (freeze öncesi sürümlerin yazdığı). */
export function createLegacyStore(): IStorageAdapter & Partial<KeyEnumerable> {
  return isTauri() ? new TauriStoreAdapter({ gameId: GAME_ID }) : new LocalStorageAdapter();
}

/**
 * Eski kaydı kapsamlı store'lara kayıpsız taşır. `i18n.init`'ten ÖNCE
 * çağrılmalıdır — dil tercihi de aynı dosyadan okunur. Yarım kalan taşıma
 * idempotent'tir; ikinci çağrı eksik anahtarı tamamlar, taşınmışı atlar.
 */
export function migrateLegacySave(scoped: ScopedSaveManager): Promise<MigrationReport> {
  return migrateLegacyStore({
    legacy: createLegacyStore(),
    scoped,
    mappings: LEGACY_KEY_SCOPES,
    retainSource: true,
  });
}
