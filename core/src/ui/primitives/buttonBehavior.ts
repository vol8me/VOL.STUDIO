/**
 * `Button` ve `IconButton`ın PAYLAŞTIĞI tıklama davranışı. Sözleşme tektir:
 * asenkron handler beklenir, süresince loading gösterilir, hata yakalanır ve
 * tıklama yeniden mümkün olur. Çağıran hangi butonu kullandığına göre farklı
 * garanti varsaymaz.
 */

export type ButtonClickHandler = () => void | Promise<void>;

/** Tıklama süresince görsel/erişilebilirlik durumunu uygulayan geri çağrı. */
export interface ButtonBehaviorHost {
  setLoading(loading: boolean): void;
  /** Yeniden giriş bu bayrakla engellenir. */
  isLoading(): boolean;
  readonly logLabel: string;
}

/**
 * `instanceof Promise` DEĞİL: o yalnız bu realm'in native söz'ünü tanır. Farklı
 * realm'den gelen ya da `then` taşıyan bir değer beklenmeden geçer ve loading
 * anında kalkar.
 */
function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === 'function'
  );
}

/**
 * Senkron handler SENKRON kalır: `await Promise.resolve(...)` beklenecek bir şey
 * olmasa bile bir microtask geciktirir ve art arda iki tıklamada ikincisi
 * "loading" görüp düşerdi. Bekleme yalnız sonuç thenable ise yapılır.
 */
export async function runButtonClick(
  host: ButtonBehaviorHost,
  handler: ButtonClickHandler | undefined,
): Promise<void> {
  if (!handler || host.isLoading()) {
    return;
  }

  host.setLoading(true);
  try {
    const result: unknown = handler();
    if (isThenable(result)) {
      await result;
    }
  } catch (error) {
    console.error(`[${host.logLabel}] onClick handler hatası:`, error);
  } finally {
    host.setLoading(false);
  }
}
