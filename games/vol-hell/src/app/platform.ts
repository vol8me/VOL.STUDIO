import { shouldUseTouchControls } from '@volstudio/core';
import { isTauri } from '@tauri-apps/api/core';

/**
 * Native masaüstü pencere yeteneği — TEK yüklem.
 *
 * Hem `bootstrap` (adapter'ı etkinleştirirken) hem ayar ekranları (çözünürlük
 * kontrolünü açarken) aynı soruyu sorar. İki yerde ayrı ayrı yazılırsa
 * biri değişip diğeri kalır ve kullanıcıya hiçbir şey yapmayan bir seçenek
 * gösterilir. Dokunmatik Tauri yüzeyinde (Android) pencere boyutu kavramı
 * yoktur; tarayıcıda ise pencereyi yeniden boyutlandıracak bir API yoktur.
 */
export function hasNativeWindow(): boolean {
  return isTauri() && !shouldUseTouchControls();
}
