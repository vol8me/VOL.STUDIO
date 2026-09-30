/**
 * Tauri kabuğunda mı koşuyoruz? Kabuk ön yüze `__TAURI_INTERNALS__` enjekte
 * eder; tarayıcıda bu alan yoktur. Tam ekran gibi kararlar buna bağlıdır:
 * native pencere kendi kipini yönetir.
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
