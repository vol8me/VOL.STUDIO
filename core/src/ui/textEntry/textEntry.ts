/**
 * Metin girişi isteği sözleşmesi — "kim klavyeyi açar" kararı tek yerde.
 *
 * İki uç vardır:
 *
 * - **Sağlayıcı (provider):** platform katmanı kendi klavyesini sunar
 *   (Steamworks kayan klavyesi ya da OS IME köprüsü). Kayıtlıysa
 *   core'un ekran klavyesi devreye girmez.
 * - **Kip probu (probe):** "şu an kol kipi mi?" sorusunun cevabını uygulama
 *   sahibi verir (`InputModeArbiter`/`InputManager` kaydeder). Kol kipi
 *   değilse odaklanma klavye açmaz — fareyle tıklanan alan native yazımla
 *   çalışır.
 *
 * `Input`/`TextArea` odaklanınca `requestGamepadTextEntry`'yi çağırır;
 * burası kip kapalıysa sessizce döner.
 */

import { OnScreenKeyboard } from './OnScreenKeyboard';
import { DisposableScope } from '../../lifecycle/DisposableScope';

export interface TextEntryRequest {
  /** Alanın mevcut değeri — klavye düzenlemeye bundan başlar. */
  value: string;
  /** Çok satırlı giriş (TextArea). Yerel klavyede Enter ayrı tuş olur. */
  multiline?: boolean;
  /** Amaç ipucu: `password` ekranda maskelenir; sağlayıcı klavye düzeni seçebilir. */
  purpose?: 'default' | 'password' | 'search';
  /** En çok karakter; alanın `maxLength`inden gelir. Verilmezse sınır yok. */
  maxLength?: number;
}

export interface TextEntryResult {
  /** Kullanıcının bıraktığı değer. İptalde başlangıç değeri döner. */
  value: string;
  canceled: boolean;
}

/**
 * Platform klavyesi sözleşmesi. `open` kullanıcı kapatana kadar açık kalır
 * ve sonucu tek seferde döndürür (Steamworks `ShowGamepadTextInput`
 * davranışının aynası). İptal sinyali geldiğinde sağlayıcı bekleyen kaynaklarını
 * kapatır; sinyali desteklemeyen eski sağlayıcının geç sonucu UI'a uygulanmaz.
 */
export interface TextEntryProvider {
  open(request: TextEntryRequest, signal?: AbortSignal): Promise<TextEntryResult>;
}

let provider: TextEntryProvider | null = null;
const noop = (): void => undefined;
let cancelActiveSession: (() => void) | undefined;
let modeProbe: (() => boolean) | null = null;
const modeOwners: Array<() => boolean> = [];

export function registerTextEntryModeProbe(probe: () => boolean): () => void {
  cancelActiveSession?.();
  const owner = () => probe();
  modeOwners.push(owner);
  return () => {
    const index = modeOwners.indexOf(owner);
    if (index >= 0) {
      if (modeOwners.at(-1) === owner) cancelActiveSession?.();
      modeOwners.splice(index, 1);
    }
  };
}

/** Platform katmanı kendi klavyesini kaydeder; `null` yerel klavyeye döner. */
export function setTextEntryProvider(next: TextEntryProvider | null): void {
  cancelActiveSession?.();
  provider = next;
}

/**
 * Geriye uyumlu tekil kip probu. `registerTextEntryModeProbe` ile bir sahip
 * kayıtlıysa o önceliklidir; bu prob yalnız sahip kalmadığında kullanılır.
 * `clear` yalnız kendi fonksiyonunu kaldırır.
 */
export function setTextEntryModeProbe(fn: (() => boolean) | null): void {
  if (modeOwners.length === 0 && modeProbe !== fn) cancelActiveSession?.();
  modeProbe = fn;
}

export function clearTextEntryModeProbe(fn: () => boolean): void {
  if (modeProbe === fn) {
    if (modeOwners.length === 0) cancelActiveSession?.();
    modeProbe = null;
  }
}

/** Kol kipi etkin mi? Probu kaydeden yoksa `false` — klavye hiç açılmaz. */
export function isGamepadTextEntryActive(): boolean {
  return (modeOwners.at(-1) ?? modeProbe)?.() === true;
}

/**
 * Metin girişi ister. Kayıtlı sağlayıcı varsa ona düşer; yoksa core'un
 * ekran klavyesi açılır. Kol kipi etkin değilse `null` döner — çağıranın
 * native odak davranışı sürer.
 */
export async function requestGamepadTextEntry(
  request: TextEntryRequest,
  signal?: AbortSignal,
): Promise<TextEntryResult | null> {
  if (!isGamepadTextEntryActive()) return null;
  if (signal?.aborted) return null;
  if (provider) return provider.open(request, signal);
  return OnScreenKeyboard.open(request, signal);
}

/**
 * Klavye kapandıktan sonra odağın alana dönmesi `focus` olayı üretir; bu
 * odak klavyeyi TEKRAR açmamalı. Programatik geri-odaklanmadan önce eleman
 * bu kümeye girer, bir sonraki `focus` kancası bunu görüp kaydı siler.
 */
const refocusSuppress = new WeakSet<Element>();

export interface ElementTextEntryOptions {
  multiline?: boolean;
  purpose?: TextEntryRequest['purpose'];
  /** Onaylanan değer — iptalde çağrılmaz. */
  apply(value: string): void;
}

/**
 * `Input`/`TextArea`'nın `focus` kancası. Kol kipindeyse elemanın native
 * odağını kaldırıp klavyeyi açar; kapanınca odağı geri verir ve onaylanan
 * değeri `apply`'a iletir. Kol kipi değilse hiçbir şey yapmaz — native
 * metin girişi sürer. Dönen iptal fonksiyonu alan sahibinin destroy/değer
 * değişimi/devre dışı bırakma ömrüne bağlanır; DOM bağlantısı sahiplik değildir.
 */
export function requestTextEntryForElement(
  element: HTMLInputElement | HTMLTextAreaElement,
  options: ElementTextEntryOptions,
): () => void {
  if (refocusSuppress.has(element)) {
    refocusSuppress.delete(element);
    return noop;
  }
  if (!isGamepadTextEntryActive() || element.disabled) return noop;
  cancelActiveSession?.();
  // Klavyeye odak aktarımının blur'u iptal değildir; dinleyici sonra kurulur.
  element.blur();
  const controller = new AbortController();
  const scope = new DisposableScope();
  let expectedValue = element.value;
  const cleanup = (): void => {
    scope.dispose();
    if (cancelActiveSession === cancel) cancelActiveSession = undefined;
  };
  const cancel = (): void => {
    cleanup();
    controller.abort();
  };
  cancelActiveSession = cancel;
  scope.addListener(element, 'blur', cancel);
  scope.addListener(element.ownerDocument, 'focusin', (event) => {
    const target = event.target;
    // Yerel klavye odağı devralır; başka UI'a geçiş alanın oturumunu bırakır.
    if (target !== element && !(target instanceof Element && target.closest('.vol-osk'))) cancel();
  });
  const request: TextEntryRequest = {
    value: expectedValue,
    multiline: options.multiline,
    purpose: options.purpose,
    ...(element.maxLength > 0 ? { maxLength: element.maxLength } : {}),
  };
  const isCurrent = (): boolean =>
    !controller.signal.aborted &&
    !element.disabled &&
    element.isConnected &&
    element.value === expectedValue &&
    cancelActiveSession === cancel;
  const settle = async (): Promise<void> => {
    try {
      const result = await requestGamepadTextEntry(request, controller.signal);
      if (isCurrent() && result && !result.canceled) {
        options.apply(result.value);
        expectedValue = element.value;
      }
    } finally {
      const restoreFocus = isCurrent();
      cleanup();
      if (restoreFocus) {
        refocusSuppress.add(element);
        try {
          element.focus({ preventScroll: true });
        } finally {
          refocusSuppress.delete(element);
        }
      }
    }
  };
  void settle().catch(() => undefined);
  return cancel;
}
