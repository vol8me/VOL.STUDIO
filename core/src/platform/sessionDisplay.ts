/**
 * Oturumun görüntü yetenekleri — hangi ayar kontrolünün anlamlı olduğunun
 * TEK doğruluk kaynağı.
 *
 * gamescope çerçeve arabelleğini sahiplenir: WebView'ın kendi penceresi ya
 * da iç render çözünürlüğü seçilemez. Bu oturumda pencere kipi ve
 * çözünürlük satırı GÖSTERİLMEZ — işe yaramayan kontrol sunmak ayar
 * ekranının yalan söylemesidir (D5c). Grafik kalitesi geçerliliğini korur;
 * ekran başına bir tercihtir ve `device` kalıcılık kapsamına aittir.
 *
 * Oturum sınıfını ürün kodu algılamaz: kabuk `getSessionKind` ile bildirir,
 * bu tablo sınıfı yeteneğe çevirir, ayar ekranı satırları yeteneğe bağlar.
 */

export interface SessionDisplayCapabilities {
  /** Pencere kipi (windowed/fullscreen) seçimi anlamlı mı? */
  readonly windowMode: boolean;
  /** İç render çözünürlüğü seçimi anlamlı mı? */
  readonly resolution: boolean;
}

export function displayCapabilitiesForSession(sessionKind: string): SessionDisplayCapabilities {
  if (sessionKind === 'gamescope') return { windowMode: false, resolution: false };
  return { windowMode: true, resolution: true };
}
