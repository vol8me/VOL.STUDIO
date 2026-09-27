import { ScopedSaveManager, type IStorageAdapter } from '@volstudio/core';

/**
 * Testlerde iki kapsamı aynı bellek-içi adapter'a yönlendiren
 * ScopedSaveManager. Kapsam ayrımını sınamayan testlerde eski tek dosyalı
 * SaveManager davranışını korur.
 */
export function scopedManager(adapter: IStorageAdapter): ScopedSaveManager {
  return new ScopedSaveManager({ synced: adapter, device: adapter });
}
