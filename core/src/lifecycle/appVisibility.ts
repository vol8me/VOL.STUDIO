/**
 * Ön plan/arka plan sorusunu TEK olayda toplar — ses, duraklatma ve teşhis
 * aynı soruyu soruyor ve ayrı dinleyicilerle farklı cevaplar alıyorlardı.
 *
 * İki geçiş biçimi vardır ve ikisi de duraklatmayı gerektirir:
 * `visibilitychange` gerçekten gizlenmeyi, `blur` ise odak kaybını bildirir
 * (bildirim gölgesi, bölünmüş ekran) ve orada `document.hidden` `false` kalır.
 * Android'de bildirim gölgesi çoğu cihazda yalnız `blur` üretir.
 */

export type AppVisibilityState = 'foreground' | 'background';

export interface AppVisibilityOptions {
  /**
   * Odak kaybı da arka plan sayılsın mı (varsayılan `true`). Sesi susturmak
   * için `blur` fazla agresiftir, duraklatmak için tam isabet — karar çağıranın.
   */
  readonly includeWindowFocus?: boolean;
}

/** Şu anki görünürlük durumu; DOM yoksa `foreground` varsayılır. */
export function getAppVisibility(): AppVisibilityState {
  if (typeof document === 'undefined') return 'foreground';
  return document.hidden ? 'background' : 'foreground';
}

/**
 * Yalnız durum GERÇEKTEN değiştiğinde çağırır: `blur` ve `visibilitychange`
 * aynı geçişte arka arkaya gelir, filtrelenmezse oyun iki kez duraklatılırdı.
 */
export function observeAppVisibility(
  onChange: (state: AppVisibilityState) => void,
  options: AppVisibilityOptions = {},
): () => void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return () => {};
  }

  const includeWindowFocus = options.includeWindowFocus ?? true;
  let current = getAppVisibility();

  const emit = (next: AppVisibilityState): void => {
    if (next === current) return;
    current = next;
    onChange(next);
  };

  const handleVisibility = (): void => emit(getAppVisibility());
  const handleBlur = (): void => emit('background');
  // Odak geri geldiğinde belge hâlâ gizli olabilir (ör. arka plandaki bir
  // pencereye odak verilmesi); bu yüzden körlemesine 'foreground' denmez.
  const handleFocus = (): void => emit(getAppVisibility());

  const scope = new DisposableScope();
  try {
    scope.addListener(document, 'visibilitychange', handleVisibility);
    if (includeWindowFocus) {
      scope.addListener(window, 'blur', handleBlur);
      scope.addListener(window, 'focus', handleFocus);
    }
  } catch (error) {
    // Bir host/WebView listener kaydını reddederse daha önce eklenenleri
    // bırak; çağıran henüz unsubscribe fonksiyonunu alamamıştır.
    scope.dispose();
    throw error;
  }

  return () => scope.dispose();
}
import { DisposableScope } from './DisposableScope';
