/**
 * Geliştirme/diagnostics için input sağlayıcılarının ham durum snapshot'ları.
 * Bu tipler sadece `?debug`/`?perf` modunda kullanılır; normal oyun mantığına
 * dahil değildir.
 *
 * **Sağlayıcı kümesi AÇIKTIR.** Önceden `activeProvider: 'pc' | 'touch' | 'none'`
 * kapalı bir union'dı ve `pc`/`touch` ayrı alanlardı; oysa `InputProvider` açık
 * bir arayüz. Yani bir gamepad sağlayıcısı YAZILABİLİYOR ama RAPORLANAMIYORDU —
 * CORE'un tanımadığı bir modality diagnostics'e giremiyordu. Bu, eylem
 * sözlüğünün (`fire`/`dash`) CORE'da durmasıyla aynı sınıf sızıntıydı.
 */

/**
 * Bir sağlayıcının ham durumu. Şekli sağlayıcının kendisi belirler; CORE
 * içeriği yorumlamaz, yalnızca taşır ve overlay'de gösterir.
 */
export type ProviderSnapshot = Readonly<Record<string, unknown>>;

/** Hiçbir sağlayıcı aktif değilken kullanılan kimlik. */
export const NO_ACTIVE_PROVIDER = 'none';

export interface InputSnapshot {
  /**
   * Aktif sağlayıcının kimliği; sağlayıcı kendi adını verir
   * (`'pc'`, `'touch'`, `'gamepad'`…). Hiçbiri aktif değilse
   * `NO_ACTIVE_PROVIDER`.
   */
  activeProvider: string;

  /**
   * Sağlayıcı kimliği → o sağlayıcının ham durumu.
   *
   * Genellikle yalnızca aktif sağlayıcının girdisi bulunur, ama sözleşme bunu
   * ZORUNLU KILMAZ: aynı anda birden fazla sağlayıcıyı raporlamak (ör. hangi
   * modality'nin neden kazandığını incelemek) serbesttir.
   */
  providers?: Readonly<Record<string, ProviderSnapshot>>;
}

/** PC sağlayıcısının kendi snapshot şekli — CORE bunu yorumlamaz. */
export interface PcInputSnapshot extends ProviderSnapshot {
  /** Hareket tuşlarının durumu. */
  move: {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
  };
  /** Fare/pointer durumu. */
  pointer: {
    x: number;
    y: number;
    isDown: boolean;
    leftButtonDown: boolean;
  };
  /**
   * Eylemlerin o karedeki durumu (eylem adı → basılı mı).
   *
   * Anahtar kümesi tüketicinin eylem sözlüğünden gelir; CORE burada somut bir
   * eylem adı bilmez — bu yüzden tip `Record<string, boolean>`.
   */
  actions: Readonly<Record<string, boolean>>;
}

/** Dokunmatik sağlayıcısının kendi snapshot şekli. */
export interface TouchInputSnapshot extends ProviderSnapshot {
  /** Sol hareket stick'i. */
  left?: TouchStickSnapshot;
  /** Sağ nişan/aksiyon stick'i. */
  right?: TouchStickSnapshot;
}

export interface TouchStickSnapshot {
  /** Stick merkezi. */
  base: { x: number; y: number };
  /** Şu anki parmak pozisyonu. */
  current: { x: number; y: number };
}

/**
 * Tek sağlayıcılı snapshot kurmak için yardımcı — çağıranın hem `activeProvider`
 * hem `providers` anahtarını elle senkron tutmasını engeller (ayrışırlarsa
 * overlay aktif sağlayıcının verisini bulamaz ve sessizce boş görünür).
 */
export function singleProviderSnapshot(id: string, snapshot: ProviderSnapshot): InputSnapshot {
  return { activeProvider: id, providers: { [id]: snapshot } };
}

/** Hiçbir sağlayıcının aktif olmadığı snapshot. */
export function idleSnapshot(): InputSnapshot {
  return { activeProvider: NO_ACTIVE_PROVIDER };
}
