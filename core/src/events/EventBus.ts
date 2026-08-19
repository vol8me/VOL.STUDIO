/** Aboneliği iptal eder. İkinci çağrı no-op'tur. */
export type Unsubscribe = () => void;

/**
 * Tipli olay veri yolu — sistemler arası gevşek bağ.
 *
 * Olay kümesini TÜKETİCİ tanımlar; CORE hiçbir olay adı bilmez.
 *
 * Kısıt `Record<string, unknown>` DEĞİL `object`tir: TypeScript'te bir
 * `interface` örtük indeks imzası taşımaz ve `Record<string, unknown>`ı
 * sağlamaz. Tüketicinin doğal olarak yazacağı `interface Events { … }`
 * biçimini reddeden bir kısıt, tip güvenliği kazandırmadan kullanımı
 * zorlaştırırdı; anahtarlar zaten `keyof TEvents` ile tipli kalıyor.
 *
 * ```ts
 * interface Events {
 *   scoreChanged: { total: number };
 *   phaseEnded: void;
 * }
 * const bus = new EventBus<Events>();
 * bus.on('scoreChanged', ({ total }) => hud.setScore(total));
 * bus.emit('scoreChanged', { total: 120 });
 * ```
 *
 * Doğrudan callback geçirmeye göre kazancı, yayıncının dinleyicileri
 * TANIMAMASIDIR: bir sistemin çıktısına yeni bir tüketici eklemek yayıncıya
 * dokunmayı gerektirmez.
 */
export class EventBus<TEvents extends object> {
  private readonly handlers = new Map<keyof TEvents, Set<(payload: never) => void>>();

  /** Olaya abone olur; iptal fonksiyonu döner. */
  on<K extends keyof TEvents>(event: K, handler: (payload: TEvents[K]) => void): Unsubscribe {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as (payload: never) => void);

    return () => {
      set?.delete(handler as (payload: never) => void);
      if (set?.size === 0) this.handlers.delete(event);
    };
  }

  /** Bir kez çalışır, sonra kendini kaldırır. */
  once<K extends keyof TEvents>(event: K, handler: (payload: TEvents[K]) => void): Unsubscribe {
    const off = this.on(event, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  /**
   * Olayı yayınlar.
   *
   * Dinleyici kümesinin KOPYASI üzerinde yürünür: bir handler yayın sırasında
   * abone olur ya da aboneliği bırakırsa (yaygın bir desen — `once`, kendini
   * kapatan sistemler) canlı küme üzerinde yürümek atlanan ya da iki kez
   * çağrılan dinleyicilere yol açardı.
   *
   * Bir handler hata fırlatırsa YAKALANIR ve kalan dinleyiciler yine çalışır;
   * tek bozuk abonenin yayını yarıda kesmesine izin verilmez. Hata
   * `onHandlerError`a bildirilir (verilmezse sessizce yutulmaz, konsola
   * yazılır).
   */
  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
    const set = this.handlers.get(event);
    if (!set || set.size === 0) return;

    for (const handler of [...set]) {
      try {
        (handler as (p: TEvents[K]) => void)(payload);
      } catch (error) {
        if (this.onHandlerError) {
          this.onHandlerError(error, String(event));
        } else {
          console.error(`[EventBus] "${String(event)}" dinleyicisi hata fırlattı:`, error);
        }
      }
    }
  }

  /** Handler hatalarını karşılamak için opsiyonel kanca. */
  onHandlerError?: (error: unknown, event: string) => void;

  /** Bir olayın dinleyici sayısı — teşhis ve sızıntı testi için. */
  listenerCount(event: keyof TEvents): number {
    return this.handlers.get(event)?.size ?? 0;
  }

  /** Verilen olayın (ya da hiç argümansız çağrılırsa TÜM olayların) abonelerini siler. */
  clear(event?: keyof TEvents): void {
    if (event === undefined) {
      this.handlers.clear();
      return;
    }
    this.handlers.delete(event);
  }
}
