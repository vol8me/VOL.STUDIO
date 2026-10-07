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
  /** Handler hata fırlatınca çağrılır (hata durumu); sonraki tıklamada `false` ile temizlenir. */
  setError?(error: boolean): void;
  /** Yeniden giriş bu bayrakla engellenir. */
  isLoading(): boolean;
  readonly logLabel: string;
  /** Tıklanan düğme: handler çalışırken odağın "önceki sahibi" olarak bilinir (bkz. `previousFocusTarget`). */
  readonly element?: Element;
}

/**
 * Handler çalışırken düğme `disabled` olur ve tarayıcı odağı gövdeye düşürür; handler'ın açtığı bir
 * katman (modal, sheet, klavye) o anda `document.activeElement`e bakarsa tetikleyiciyi KAYBEDER ve kapanınca
 * odağı geri veremez. Katmanlar odağın önceki sahibini buradan sorar: odak gövdede ise o an tıklanan düğme.
 */
let activatingElement: Element | null = null;

export function previousFocusTarget(): Element | null {
  const active = document.activeElement;
  if (active && active !== document.body) return active;
  return activatingElement;
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

  host.setError?.(false);
  const outerActivating = activatingElement;
  activatingElement = host.element ?? null;
  host.setLoading(true);
  let failed = false;
  try {
    const result: unknown = handler();
    if (isThenable(result)) {
      await result;
    }
  } catch (error) {
    failed = true;
    console.error(`[${host.logLabel}] onClick handler hatası:`, error);
  } finally {
    activatingElement = outerActivating;
    host.setLoading(false);
    if (failed) host.setError?.(true);
  }
}
