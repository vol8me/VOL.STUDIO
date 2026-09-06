/** Aboneliği iptal eder. İkinci çağrı no-op'tur. */
export type Unsubscribe = () => void;

/**
 * Tipli olay veri yolu. Olay kümesini TÜKETİCİ tanımlar; kazancı yayıncının
 * dinleyicileri TANIMAMASIDIR — yeni tüketici eklemek yayıncıya dokunmaz.
 *
 * Kısıt `object`tir, `Record<string, unknown>` değil: TypeScript'te bir
 * `interface` örtük indeks imzası taşımaz ve tüketicinin doğal olarak yazacağı
 * `interface Events { … }` biçimi reddedilirdi.
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
   * Yayınlar; hata fırlatan dinleyici SAYISINI döner (0 = tümü sağlıklı).
   *
   * Kümenin KOPYASI üzerinde yürünür: yayın sırasında abone olan/ayrılan bir
   * handler (`once`) canlı kümede atlanan ya da iki kez çağrılan dinleyici
   * üretirdi. Fırlatan handler YAKALANIR, kalanlar yine çalışır.
   */
  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): number {
    const set = this.handlers.get(event);
    if (!set || set.size === 0) return 0;

    let errors = 0;
    for (const handler of [...set]) {
      try {
        (handler as (p: TEvents[K]) => void)(payload);
      } catch (error) {
        errors++;
        if (this.onHandlerError) {
          this.onHandlerError(error, String(event));
        } else {
          console.error(`[EventBus] "${String(event)}" dinleyicisi hata fırlattı:`, error);
        }
      }
    }
    return errors;
  }

  /** Handler hatalarını karşılamak için opsiyonel kanca. */
  onHandlerError?: (error: unknown, event: string) => void;

  /** Bir olayın dinleyici sayısı — teşhis ve sızıntı testi için. */
  listenerCount(event: keyof TEvents): number {
    return this.handlers.get(event)?.size ?? 0;
  }

  /** Argümansız çağrılırsa TÜM olayların abonelerini siler. */
  clear(event?: keyof TEvents): void {
    if (event === undefined) {
      this.handlers.clear();
      return;
    }
    this.handlers.delete(event);
  }
}
