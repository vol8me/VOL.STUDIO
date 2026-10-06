import { invoke } from '@tauri-apps/api/core';
import type { IStorageAdapter } from '@volstudio/core';

/** Native okuma kaydı eksik ya da bozuk bulduğunda bildirilen olay. */
export interface StoreIntegrityEvent {
  readonly name: string;
  /** `recovered`: başka bir jenerasyondan okundu; `reset`: hiçbiri okunamadı, kayıt boş başladı. */
  readonly kind: 'recovered' | 'reset';
}

export interface TauriStoreAdapterOptions {
  /** Store dosyasının adı. Belirtilmezse gameId'den türetilir. */
  path?: string;
  /** Oyun kimliği. Store dosyası "{gameId}-store.json" olarak adlandırılır. */
  gameId?: string;
  /** Kurtarma ve sıfırlama bildirimi; teşhise ya da kullanıcı uyarısına bağlanır. */
  onIntegrity?: (event: StoreIntegrityEvent) => void;
}

interface StoreReadResult {
  readonly data: string | null;
  readonly recovered: boolean;
  readonly reset: boolean;
}

/**
 * Uygulamanın veri dizinine JSON dosyası yazan `IStorageAdapter`; native yarısı
 * kabuğun `vol_store_read`/`vol_store_write` komutlarıdır (`store.rs`).
 *
 * İlk okuma paylaşılır: eşzamanlı çağrılar tek önbellek kurar, araya giren
 * `set` sonradan dönen bir okumayla ezilmez. Yazmalar sıraya alınır.
 */
export class TauriStoreAdapter implements IStorageAdapter {
  private readonly name: string;
  private readonly onIntegrity?: (event: StoreIntegrityEvent) => void;
  private loading: Promise<Record<string, unknown>> | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(options: TauriStoreAdapterOptions = {}) {
    this.name =
      options.path ?? (options.gameId ? `${options.gameId}-store.json` : 'volstudio-store.json');
    this.onIntegrity = options.onIntegrity;
  }

  private load(): Promise<Record<string, unknown>> {
    if (!this.loading) {
      this.loading = this.read().catch((error: unknown) => {
        // Başarısız okuma önbelleğe yazılmaz; sonraki çağrı yeniden dener.
        this.loading = null;
        throw error;
      });
    }
    return this.loading;
  }

  private async read(): Promise<Record<string, unknown>> {
    const result = await invoke<StoreReadResult>('vol_store_read', { name: this.name });
    if (result.recovered) this.onIntegrity?.({ name: this.name, kind: 'recovered' });
    if (result.reset) this.onIntegrity?.({ name: this.name, kind: 'reset' });
    return result.data ? (JSON.parse(result.data) as Record<string, unknown>) : {};
  }

  private mutate(
    change: (data: Record<string, unknown>) => Record<string, unknown>,
  ): Promise<void> {
    const next = this.queue.then(async () => {
      const data = change(await this.load());
      await invoke<void>('vol_store_write', { name: this.name, data: JSON.stringify(data) });
      // Yalnız native yazım onayı önbelleği ilerletir; reddedilen göç tekrar denenebilir.
      this.loading = Promise.resolve(data);
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const data = await this.load();
    return data[key] as T | undefined;
  }

  set<T>(key: string, value: T): Promise<void> {
    return this.mutate((data) => ({ ...data, [key]: value }));
  }

  remove(key: string): Promise<void> {
    return this.mutate((data) => {
      const next = { ...data };
      delete next[key];
      return next;
    });
  }

  /** Tüm anahtarlar — tek dosyadan kapsamlı store'a kayıpsız taşımada kullanılır. */
  async keys(): Promise<readonly string[]> {
    return Object.keys(await this.load());
  }
}
