import { LazyStore } from '@tauri-apps/plugin-store';
import type { IStorageAdapter } from '@volstudio/core';

export interface TauriStoreAdapterOptions {
  /** Store dosyasinin adi. Belirtilmezse gameId'den turetilir. */
  path?: string;
  /** Oyun kimligi. Store dosyasi "{gameId}-store.json" olarak adlandirilir. */
  gameId?: string;
}

/**
 * Tauri native store tabanli IStorageAdapter implementasyonu.
 * WebView localStorage yerine uygulamanin veri dizinine JSON dosyasi yazar.
 * autoSave kapali tutulur; her set/remove sonrasi explicit save yapilarak
 * veri kaybi riski minimize edilir.
 */
export class TauriStoreAdapter implements IStorageAdapter {
  private readonly store: LazyStore;

  constructor(options: TauriStoreAdapterOptions = {}) {
    const path = options.path ?? (options.gameId ? `${options.gameId}-store.json` : 'volstudio-store.json');
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
