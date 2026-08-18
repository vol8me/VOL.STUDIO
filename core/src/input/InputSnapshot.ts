/**
 * Geliştirme/diagnostics için input sağlayıcılarının ham durum snapshot'ları.
 * Bu tipler sadece `?debug`/`?perf` modunda kullanılır; normal oyun mantığına dahil değildir.
 */

export interface InputSnapshot {
  /** Hangi sağlayıcı aktif girdi üretiyor. */
  activeProvider: 'pc' | 'touch' | 'none';

  /** PC (WASD + fare) durumu; sadece aktif sağlayıcı 'pc' ise dolu. */
  pc?: PcInputSnapshot;

  /** Touch (çift joystick) durumu; sadece aktif sağlayıcı 'touch' ise dolu. */
  touch?: TouchInputSnapshot;
}

export interface PcInputSnapshot {
  /** WASD tuş durumları. */
  wasd: {
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

export interface TouchInputSnapshot {
  /** Sol hareket stick'i. */
  left?: TouchStickSnapshot;
  /** Sağ nişan/ateş stick'i. */
  right?: TouchStickSnapshot;
}

export interface TouchStickSnapshot {
  /** Stick merkezi. */
  base: { x: number; y: number };
  /** Şu anki parmak pozisyonu. */
  current: { x: number; y: number };
}
