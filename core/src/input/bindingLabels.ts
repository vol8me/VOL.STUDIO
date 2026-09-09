import type { PCActionBinding } from './PCInputState';

/**
 * Tuş kodunun İNSAN OKUR karşılığı.
 *
 * `KeyboardEvent.key` varken kod tablosu tutmak gereksiz görünür, ama bir
 * atama ekranı BAĞLI olan tuşu da yazmak zorundadır ve o an elde yalnız kayıtlı
 * `keyCode` vardır — canlı bir olay yoktur. Tablo bu yüzden kaçınılmazdır.
 *
 * Kapsanmayan kodlar `Tuş 123` biçiminde gösterilir: yanlış bir ad uydurmaktansa
 * ham kodu göstermek dürüsttür ve kullanıcı yine de hangi tuşa bastığını bilir.
 */
const KEY_NAMES: Readonly<Record<number, string>> = {
  8: 'Backspace',
  9: 'Tab',
  13: 'Enter',
  16: 'Shift',
  17: 'Ctrl',
  18: 'Alt',
  19: 'Pause',
  20: 'Caps Lock',
  27: 'Esc',
  32: 'Space',
  33: 'Page Up',
  34: 'Page Down',
  35: 'End',
  36: 'Home',
  37: '←',
  38: '↑',
  39: '→',
  40: '↓',
  45: 'Insert',
  46: 'Delete',
  91: 'Meta',
  93: 'Menu',
  144: 'Num Lock',
  186: ';',
  187: '=',
  188: ',',
  189: '-',
  190: '.',
  191: '/',
  192: '`',
  219: '[',
  220: '\\',
  221: ']',
  222: "'",
};

/**
 * Fare düğmesinin okunur adı; i18n gerektirmeyecek kadar simgeseldir.
 *
 * Tablo TEK girdilidir çünkü `PointerButton` da öyle: `resolvePCActions` yalnız
 * `leftButtonDown` okur. Orta/sağ düğme eklemek, çözülemeyecek bir bağı
 * gösterilebilir kılardı.
 */
const POINTER_NAMES: Readonly<Record<string, string>> = {
  left: 'LMB',
};

/**
 * Bir bağı ekranda gösterilecek metne çevirir.
 *
 * Metin ÇEVRİLMEZ: "W" her dilde W'dir ve `Space`/`LMB` gibi adlar girdi
 * dünyasının ortak sözlüğüdür. Oyun kendi kelimesini isterse `formatBinding`
 * ile geçersiz kılar (bkz. `KeyBindingList`).
 */
export function describePCBinding(binding: PCActionBinding): string {
  if (binding.source === 'pointerButton') {
    return POINTER_NAMES[binding.button] ?? binding.button;
  }

  const { keyCode } = binding;
  if (KEY_NAMES[keyCode]) return KEY_NAMES[keyCode];
  // 0-9 ve A-Z doğrudan karakterdir; tabloya yazmak 36 satır tekrar olurdu.
  if (keyCode >= 48 && keyCode <= 57) return String.fromCharCode(keyCode);
  if (keyCode >= 65 && keyCode <= 90) return String.fromCharCode(keyCode);
  if (keyCode >= 96 && keyCode <= 105) return `Num ${keyCode - 96}`;
  if (keyCode >= 112 && keyCode <= 123) return `F${keyCode - 111}`;
  return `Tuş ${keyCode}`;
}

/** İki bağ aynı fiziksel girdiyi mi işaret ediyor? */
export function isSameBinding(left: PCActionBinding, right: PCActionBinding): boolean {
  if (left.source !== right.source) return false;
  return left.source === 'key' && right.source === 'key'
    ? left.keyCode === right.keyCode
    : left.source === 'pointerButton' &&
        right.source === 'pointerButton' &&
        left.button === right.button;
}

/**
 * Bir eylemi verilen bağa taşımak hangi eylemlerle ÇAKIŞIR?
 *
 * TARİF katmanıdır (opt-in): çakışmanın ne anlama geldiğine oyun karar verir.
 * Bazı oyunlarda aynı tuş iki eylemde meşrudur (biri sadece menüde çalışır),
 * bazılarında değildir. Bekçi yalnız ÇAKIŞANLARI söyler; ne yapılacağını değil.
 *
 * @returns Aynı girdiye bağlı DİĞER eylemler; boşsa çakışma yok.
 */
export function findBindingConflicts<TAction extends string>(
  bindings: Readonly<Record<TAction, PCActionBinding>>,
  action: TAction,
  candidate: PCActionBinding,
): TAction[] {
  return (Object.keys(bindings) as TAction[]).filter(
    (other) => other !== action && isSameBinding(bindings[other], candidate),
  );
}
