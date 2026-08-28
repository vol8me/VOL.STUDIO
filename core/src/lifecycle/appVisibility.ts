/**
 * Uygulamanın ön planda mı arka planda mı olduğunu tek bir olayda toplar.
 *
 * **Neden `visibilitychange` tek başına yetmez?** İki farklı "artık
 * görünmüyorum" biçimi var ve ikisi de oyunu duraklatmayı gerektirir:
 *
 * - `document.visibilitychange` — sekme/uygulama gerçekten gizlendi
 *   (uygulama değiştirme, ekran kilidi, sekme arkaya alındı).
 * - `window.blur` — pencere odağı gitti ama içerik hâlâ görünür olabilir
 *   (üstte açılan bir bildirim gölgesi, bölünmüş ekranda diğer uygulamaya
 *   dokunma, masaüstünde alt-tab). Burada `document.hidden` `false` kalır.
 *
 * Yalnızca birine abone olan tüketici diğer durumu kaçırır. Android'de bu
 * fark özellikle önemlidir: bildirim gölgesini aşağı çekmek çoğu cihazda
 * `blur` üretir ama `visibilitychange` üretmez.
 *
 * **Neden CORE'da?** Ses motoru, oyun duraklatması ve teşhis katmanı aynı
 * soruyu soruyor ve bugüne kadar her biri kendi dinleyicisini kurdu. Tek bir
 * sözleşme olmadan biri `blur`u, diğeri `visibilitychange`i dinliyor ve aynı
 * olayda farklı davranıyorlardı.
 */

export type AppVisibilityState = 'foreground' | 'background';

export interface AppVisibilityOptions {
  /**
   * Pencere odağı kaybını da arka plan saymak. Varsayılan `true`.
   *
   * Sesi susturmak için `blur` genellikle fazla agresiftir (kullanıcı başka
   * pencereye tıkladı diye müzik kesilmesin istenebilir), oyunu duraklatmak
   * içinse tam olarak istenen davranıştır. Bu yüzden karar çağıranındır.
   */
  readonly includeWindowFocus?: boolean;
}

/** Şu anki görünürlük durumu; DOM yoksa `foreground` varsayılır. */
export function getAppVisibility(): AppVisibilityState {
  if (typeof document === 'undefined') return 'foreground';
  return document.hidden ? 'background' : 'foreground';
}

/**
 * Görünürlük değişimlerine abone olur; aboneliği kaldıran fonksiyonu döner.
 *
 * Dinleyici yalnızca durum GERÇEKTEN değiştiğinde çağrılır — `blur` ve
 * `visibilitychange` aynı geçişte arka arkaya gelebilir ve filtrelenmezse
 * oyunu iki kez duraklatmaya çalışırdı.
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
