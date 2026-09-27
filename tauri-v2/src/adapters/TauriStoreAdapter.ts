import { invoke } from '@tauri-apps/api/core';
import type { IStorageAdapter } from '@volstudio/core';

export interface TauriStoreAdapterOptions {
  /** Store dosyasının adı. Belirtilmezse gameId'den türetilir. */
  path?: string;
  /** Oyun kimliği. Store dosyası "{gameId}-store.json" olarak adlandirilir. */
  gameId?: string;
}

interface StoreReadResult {
  readonly data: string | null;
  /** Güncel dosya bozuktu, yedekten okundu. */
  readonly recovered: boolean;
}

/**
 * Tauri native store tabanlı IStorageAdapter implementasyonu.
 * WebView localStorage yerine uygulamanın veri dizinine JSON dosyası yazar.
 * Kayıt atomikdir: geçici dosya → fsync → rename → dizin fsync'i; güncel
 * kayıt bozuksa `.bak` jenerasyonundan okunur ve kurtarma raporlanır
 * (native `vol_store_read`/`vol_store_write` komutları, `store.rs`).
 *
 * Yazmalar sıraya alınır — iki set aynı anda dosyayı açmaz; sinyal üzerine
 * kapanışta bekleyen kuyruk `registerShutdownFlush` ile boşaltılır.
 */
export class TauriStoreAdapter implements IStorageAdapter {
  private readonly name: string;
  private cache: Record<string, unknown> | null = null;
  private queue: Promise<void> = Promise.resolve();
  /** Bozuk dosyadan yedekle dönüldüğünde bir kere çağrılır. */
  public onRecovered?: (name: string) => void;

  constructor(options: TauriStoreAdapterOptions = {}) {
    this.name =
      options.path ?? (options.gameId ? `${options.gameId}-store.json` : 'volstudio-store.json');
  }

  private async load(): Promise<Record<string, unknown>> {
    if (this.cache) return this.cache;
    const result = await invoke<StoreReadResult>('vol_store_read', { name: this.name });
    if (result.recovered) this.onRecovered?.(this.name);
    this.cache = result.data ? (JSON.parse(result.data) as Record<string, unknown>) : {};
    return this.cache;
  }

  private persist(): Promise<void> {
    const write = async () => {
      const data = JSON.stringify(this.cache ?? {});
      await invoke('vol_store_write', { name: this.name, data });
    };
    // Kuyruğu zincirleme: hata sonraki yazmayı bloklamasın diye catch'lenir
    // ama çağırana hâlâ döner.
    const next = this.queue.then(write);
    this.queue = next.catch(() => undefined);
    return next;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const data = await this.load();
    return (data[key] as T | undefined) ?? undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    const data = await this.load();
    data[key] = value;
    await this.persist();
  }

  async remove(key: string): Promise<void> {
    const data = await this.load();
    delete data[key];
    await this.persist();
  }

  /** Tüm anahtarlar — tek-dosyadan kapsamlı store'a kayıpsız taşımada kullanılır. */
  async keys(): Promise<readonly string[]> {
    return Object.keys(await this.load());
  }
}
