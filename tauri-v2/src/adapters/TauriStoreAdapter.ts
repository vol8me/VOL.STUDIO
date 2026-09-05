import { LazyStore } from '@tauri-apps/plugin-store';
import type { IStorageAdapter } from '@volstudio/core';

export interface TauriStoreAdapterOptions {
  /** Store dosyasının adı. Belirtilmezse gameId'den türetilir. */
  path?: string;
  /** Oyun kimliği. Store dosyası "{gameId}-store.json" olarak adlandirilir. */
  gameId?: string;
}

/**
 * Tauri native store tabanlı IStorageAdapter implementasyonu.
 * WebView localStorage yerine uygulamanin veri dizinine JSON dosyası yazar.
 * autoSave kapalı tutulur; her set/remove sonrası explicit save yapılarak
 * veri kaybi riski minimize edilir.
 */
export class TauriStoreAdapter implements IStorageAdapter {
  private readonly store: LazyStore;

  constructor(options: TauriStoreAdapterOptions = {}) {
    const path =
      options.path ?? (options.gameId ? `${options.gameId}-store.json` : 'volstudio-store.json');
    this.store = new LazyStore(path, { autoSave: false });
  }

  async get<T>(key: string): Promise<T | undefined> {
    const value = await this.store.get<T>(key);
    return value ?? undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.store.set(key, value);
    await this.store.save();
  }

  async remove(key: string): Promise<void> {
    await this.store.delete(key);
    await this.store.save();
  }
}
