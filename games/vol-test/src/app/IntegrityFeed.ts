import type { StoreIntegrityEvent } from '@volstudio/tauri-v2';

/**
 * Kayıt bütünlüğü olaylarının kuyruğu: depo oyun arayüzü kurulmadan ÖNCE açılır, bu yüzden olaylar
 * saklanır ve abone olan arayüze geçmişten başlayarak iletilir (oyuncu kurtarma/sıfırlama bilgisini kaçırmaz).
 */
export class IntegrityFeed {
  private readonly history: StoreIntegrityEvent[] = [];
  private readonly listeners = new Set<(event: StoreIntegrityEvent) => void>();

  record(event: StoreIntegrityEvent): void {
    this.history.push(event);
    for (const listener of this.listeners) listener(event);
  }

  /** Geçmiş olaylar hemen iletilir; dönen işlev aboneliği bırakır. */
  subscribe(listener: (event: StoreIntegrityEvent) => void): () => void {
    for (const event of this.history) listener(event);
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
