/**
 * `Button` ve `IconButton`ın PAYLAŞTIĞI tıklama davranışı.
 *
 * İkisi bir dönem aynı sözleşmenin iki farklı yorumunu taşıyordu: `Button`
 * asenkron handler'ı bekliyor, loading gösteriyor ve hatayı yakalıyordu;
 * `IconButton` handler'ı doğrudan listener olarak takıyordu — asenkron yok,
 * loading yok, fırlatılan hata yakalanmıyordu. Aynı "buton" adını taşıyan iki
 * bileşenin farklı garantiler vermesi, çağıranın hangisini kullandığına göre
 * davranış değiştirmesi demekti.
 */

export type ButtonClickHandler = () => void | Promise<void>;

/** Tıklama süresince görsel/erişilebilirlik durumunu uygulayan geri çağrı. */
export interface ButtonBehaviorHost {
  /** Bileşenin kendi loading gösterimi (spinner, disabled, aria-busy). */
  setLoading(loading: boolean): void;
  /** Loading zaten sürüyor mu — yeniden giriş bu bayrakla engellenir. */
  isLoading(): boolean;
  /** Hata logunda görünecek bileşen adı. */
  readonly logLabel: string;
}

/**
 * "Beklenebilir mi?" — `instanceof Promise` DEĞİL.
 *
 * `instanceof` yalnızca bu realm'in native Promise'lerini tanır. Farklı bir
 * realm'den (iframe, vm) gelen bir söz ya da `then` taşıyan bir thenable —
 * birçok kütüphanenin döndürdüğü şey — beklenmeden geçer, loading anında
 * kalkar ve çağıran işin bittiğini sanır.
 */
function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === 'function'
  );
}

/**
 * Handler'ı çalıştırır, sonucunu bekler ve loading durumunu yönetir.
 *
 * **Senkron handler senkron kalır.** `await Promise.resolve(handler())` yazmak
 * kısa olurdu ama sonucu beklenecek bir şey OLMASA BİLE en az bir microtask
 * gecikme yaratır: art arda iki tıklamada ikincisi hâlâ "loading" görüp
 * sessizce düşerdi. Bu yüzden bekleme yalnızca sonuç gerçekten thenable ise
 * yapılır.
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
    // Handler senkron veya asenkron hata fırlatırsa loading kalksın;
    // unhandled rejection yerine loglanır.
    console.error(`[${host.logLabel}] onClick handler hatası:`, error);
  } finally {
    host.setLoading(false);
  }
}
