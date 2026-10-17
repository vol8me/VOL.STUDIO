/**
 * Teşhis için sağlayıcı durum snapshot'ları — yalnız `?debug`/`?perf` modunda.
 *
 * Sağlayıcı kümesi AÇIKTIR: tüketici kendi sağlayıcısını yazar, CORE kimlikleri
 * ve ham durumu taşır, içeriği YORUMLAMAZ.
 */

/** Şekli sağlayıcının kendisi belirler. */
export type ProviderSnapshot = Readonly<Record<string, unknown>>;

/** Hiçbir sağlayıcı aktif değilken kullanılan kimlik. */
export const NO_ACTIVE_PROVIDER = 'none';

export interface InputSnapshot {
  /** Sağlayıcı kendi adını verir (`'pc'`, `'touch'`…); yoksa `NO_ACTIVE_PROVIDER`. */
  activeProvider: string;

  /** Yalnız aktif sağlayıcıyı taşımak ZORUNLU DEĞİL; birden fazlası serbesttir. */
  providers?: Readonly<Record<string, ProviderSnapshot>>;
}

/** PC sağlayıcısının kendi snapshot şekli — CORE bunu yorumlamaz. */
export interface PcInputSnapshot extends ProviderSnapshot {
  move: {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
  };
  pointer: {
    x: number;
    y: number;
    isDown: boolean;
    leftButtonDown: boolean;
  };
  /** Anahtarlar tüketicinin eylem sözlüğünden gelir; CORE eylem adı bilmez. */
  actions: Readonly<Record<string, boolean>>;
}

/** Dokunmatik sağlayıcısının kendi snapshot şekli. */
export interface TouchInputSnapshot extends ProviderSnapshot {
  left?: TouchStickSnapshot;
  right?: TouchStickSnapshot;
}

export interface TouchStickSnapshot {
  /** Stick merkezi ve o anki parmak konumu. */
  base: { x: number; y: number };
  current: { x: number; y: number };
}

/**
 * `activeProvider` ile `providers` anahtarını elle senkron tutmayı engeller;
 * ayrışırlarsa overlay veriyi bulamaz ve sessizce boş görünür.
 */
export function createSingleProviderSnapshot(
  id: string,
  snapshot: ProviderSnapshot,
): InputSnapshot {
  return { activeProvider: id, providers: { [id]: snapshot } };
}

/** Hiçbir sağlayıcının aktif olmadığı snapshot. */
export function createIdleSnapshot(): InputSnapshot {
  return { activeProvider: NO_ACTIVE_PROVIDER };
}
