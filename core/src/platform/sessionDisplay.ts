/**
 * Oturumun görüntü yetenekleri — hangi ayar kontrolünün anlamlı olduğunun
 * TEK doğruluk kaynağı.
 *
 * gamescope çerçeve arabelleğini sahiplenir: WebView'ın kendi penceresi ya
 * da iç render çözünürlüğü seçilemez. Bu oturumda pencere kipi ve
 * çözünürlük satırı GÖSTERİLMEZ — işe yaramayan kontrol sunmak ayar
 * ekranının yalan söylemesidir. Grafik kalitesi geçerliliğini korur;
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

/**
 * `runtime` verilirse (`'web' | 'desktop' | 'android'`, `getRuntimePlatform` sonucu) Android'de de pencere kipi ve çözünürlük
 * sunulmaz: Activity pencereyi ve sistem çubuklarını sahiplenir, kullanıcı ne pencere ne iç çözünürlük seçebilir. Android
 * oturumu `desktop` bildirir (gamescope/Big Picture yoktur), bu yüzden yalnız oturum sınıfı bunu ayırt edemezdi.
 */
export function displayCapabilitiesForSession(
  sessionKind: string,
  runtime?: string,
): SessionDisplayCapabilities {
  if (sessionKind === 'gamescope' || runtime === 'android') {
    return { windowMode: false, resolution: false };
  }
  return { windowMode: true, resolution: true };
}
