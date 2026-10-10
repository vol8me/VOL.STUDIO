import { isComposingKey } from '../textEntry/ime';

/**
 * Kamera/yakınlaştırma yüzeylerinin klavye eşdeğeri (UI-10.4). Parmak sıkıştırma, tekerlek ve sürükleme tek yol olamaz:
 * `+`/`-` yakınlaştırır, `0` sıfırlar, `Home` sığdırır, oklar GÖRÜNÜMÜ kaydırma kuralıyla (ok sağa = görünüm sağa, içerik
 * sola) taşır. Ctrl/Meta/Alt'li tuşlar tarayıcının kendi yakınlaştırma/gezinti kısayoludur: dokunulmaz.
 */
export type ViewportKeyAction =
  | { readonly kind: 'zoom'; readonly direction: 1 | -1 }
  | { readonly kind: 'reset' }
  | { readonly kind: 'fit' }
  | { readonly kind: 'pan'; readonly x: -1 | 0 | 1; readonly y: -1 | 0 | 1 };

/** `aria-keyshortcuts` değeri (ARIA: `+` "Plus", `-` "Minus" yazılır). */
export const VIEWPORT_SHORTCUTS = 'Plus Minus 0 Home ArrowUp ArrowDown ArrowLeft ArrowRight';

export function viewportKeyAction(event: KeyboardEvent): ViewportKeyAction | null {
  if (event.ctrlKey || event.metaKey || event.altKey || isComposingKey(event)) return null;
  switch (event.key) {
    case '+':
    case '=':
      return { kind: 'zoom', direction: 1 };
    case '-':
    case '_':
      return { kind: 'zoom', direction: -1 };
    case '0':
      return { kind: 'reset' };
    case 'Home':
      return { kind: 'fit' };
    case 'ArrowLeft':
      return { kind: 'pan', x: -1, y: 0 };
    case 'ArrowRight':
      return { kind: 'pan', x: 1, y: 0 };
    case 'ArrowUp':
      return { kind: 'pan', x: 0, y: -1 };
    case 'ArrowDown':
      return { kind: 'pan', x: 0, y: 1 };
    default:
      return null;
  }
}

/**
 * Tuşu yalnız yüzeyin KENDİSİ odaktayken işler: içerideki bir metin alanı ya da düğme `+`/`-`/ok tuşlarını kendi işi için
 * kullanır; yüzey onları çalmaz.
 */
export function isViewportKeyTarget(event: KeyboardEvent, element: HTMLElement): boolean {
  return event.target === element && !event.defaultPrevented;
}
