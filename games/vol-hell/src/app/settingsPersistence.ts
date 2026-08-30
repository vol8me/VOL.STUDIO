import { diagnostics } from '@/app/services';

/** Kalıcılık hatasını gözlemleyen taraf (ayar ekranı, telemetri). */
export type PersistenceFailureListener = (failure: PersistenceFailure) => void;

export interface PersistenceFailure {
  /** Hangi ayar deposu — `vol-hell:audio-settings` gibi. */
  readonly storageKey: string;
  readonly error: unknown;
}

const listeners = new Set<PersistenceFailureListener>();

/**
 * Ayar kalıcılığı hatalarının TEK toplanma noktası.
 *
 * `AudioSettings` ve `VideoSettings` yazma hatasını `console.warn`e gömüyordu:
 * çalışma anında ayar UYGULANMIŞ görünüyor (slider oynuyor, kalite değişiyor)
 * ama disk yazımı sessizce başarısız oluyordu. Oyuncu uygulamayı kapatınca
 * ayarları kayboluyor ve bunun HİÇBİR izi kalmıyordu — ne kullanıcıda, ne
 * teşhis kaydında.
 *
 * Burası hatayı üç yere birden taşır: konsol (geliştirme), `diagnostics`
 * olay akışı (`?debug` oturumu) ve abone olan UI. Ayar sınıfları yalnızca
 * bunu çağırır; nereye taşındığını bilmezler.
 */
export function reportPersistenceFailure(storageKey: string, error: unknown): void {
  console.warn(`[settings] Ayarlar kaydedilemedi: ${storageKey}`, error);
  diagnostics?.recordEvent('settingsPersistFailed', {
    storageKey,
    message: error instanceof Error ? error.message : String(error),
  });

  for (const listener of listeners) {
    try {
      listener({ storageKey, error });
    } catch (listenerError) {
      // Bir gözlemcinin hatası diğerlerini ve asıl akışı engellemesin.
      console.warn('[settings] Kalıcılık dinleyicisi hata verdi:', listenerError);
    }
  }
}

/** Kalıcılık hatalarını izler; aboneliği kaldıran fonksiyonu döner. */
export function onPersistenceFailure(listener: PersistenceFailureListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Testler için: abone listesini sıfırlar. */
export function resetPersistenceListenersForTests(): void {
  listeners.clear();
}
