/**
 * Metin girişi isteği sözleşmesi — "kim klavyeyi açar" kararı tek yerde.
 *
 * İki uç vardır:
 *
 * - **Sağlayıcı (provider):** platform katmanı kendi klavyesini sunar
 *   (Steamworks kayan klavyesi — D6, ya da OS IME köprüsü). Kayıtlıysa
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
 * davranışının aynası).
 */
export interface TextEntryProvider {
  open(request: TextEntryRequest): Promise<TextEntryResult>;
}

let provider: TextEntryProvider | null = null;
let modeProbe: (() => boolean) | null = null;
const modeOwners: Array<() => boolean> = [];

export function registerTextEntryModeProbe(probe: () => boolean): () => void {
  const owner = () => probe();
  modeOwners.push(owner);
  return () => {
    const index = modeOwners.indexOf(owner);
    if (index >= 0) modeOwners.splice(index, 1);
  };
}

/** Platform katmanı kendi klavyesini kaydeder; `null` yerel klavyeye döner. */
export function setTextEntryProvider(next: TextEntryProvider | null): void {
  provider = next;
}

/**
 * Geriye uyumlu tekil kip probu. `registerTextEntryModeProbe` ile bir sahip
 * kayıtlıysa o önceliklidir; bu prob yalnız sahip kalmadığında kullanılır.
 * `clear` yalnız kendi fonksiyonunu kaldırır.
 */
export function setTextEntryModeProbe(fn: (() => boolean) | null): void {
  modeProbe = fn;
}

export function clearTextEntryModeProbe(fn: () => boolean): void {
  if (modeProbe === fn) modeProbe = null;
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
): Promise<TextEntryResult | null> {
  if (!isGamepadTextEntryActive()) return null;
  if (provider) return provider.open(request);
  return OnScreenKeyboard.open(request);
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
 * metin girişi sürer.
 */
export function requestTextEntryForElement(
  element: HTMLInputElement | HTMLTextAreaElement,
  options: ElementTextEntryOptions,
): void {
  if (refocusSuppress.has(element)) {
    refocusSuppress.delete(element);
    return;
  }
  if (!isGamepadTextEntryActive()) return;
  element.blur();
  const request: TextEntryRequest = {
    value: element.value,
    multiline: options.multiline,
    purpose: options.purpose,
    ...(element.maxLength > 0 ? { maxLength: element.maxLength } : {}),
  };
  void requestGamepadTextEntry(request)
    .then((result) => {
      if (result && !result.canceled) options.apply(result.value);
    })
    // Sağlayıcı hatası girişi iptal sayar; değer değişmez, odak yine döner.
    .catch(() => undefined)
    .finally(() => {
      refocusSuppress.add(element);
      element.focus({ preventScroll: true });
    });
}
