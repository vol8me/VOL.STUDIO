package com.volstudio.life

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.volstudio.orientation.OrientationStore

/**
 * VOL.LIFE'ın Android giriş noktası — sürükleyici tam ekran, geri tuşu ve
 * oyuncunun seçtiği ekran yönü.
 *
 * `enableEdgeToEdge()` şablondan gelir ve içeriği sistem çubuklarının ALTINA
 * uzatır; ama çubukları GİZLEMEZ, yalnızca üzerine çizim yapılmasına izin
 * verir. İzlenen bir dünya için çubukların da çekilmesi gerekir.
 */
class MainActivity : TauriActivity() {
  private var webView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    // Kayıtlı yön pencere kurulmadan uygulanır: sayfa yüklendikten sonra
    // uygulansaydı her açılışta ekran bir kez dönerdi. Kayıt yoksa manifestteki
    // varsayılan (dikey) geçerlidir.
    OrientationStore.applySaved(this)
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Callback'i WebView kurulum callback'inde eklemek bazı cihazlarda native
    // thread/lifecycle zamanlamasına takılıp dispatcher'a hiç girmiyor ve geri
    // tuşu doğrudan Activity'yi bitiriyor. Activity CREATED durumundayken ana
    // thread'de kaydet, WebView gelene dek de olayı güvenle tüket.
    onBackPressedDispatcher.addCallback(
      this,
      object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
          dispatchBackToWebView()
        }
      },
    )
    hideSystemBars()
  }

  /**
   * Geri tuşunu uygulamaya devreder.
   *
   * Wry'ın kendi geri işleyicisi WebView geçmişine bakar; uygulama tek sayfalı
   * olduğu için geçmiş HİÇ dolmaz ve her geri basışı uygulamayı kapatırdı.
   * Buradaki işleyici olayı JS'e taşır; ne olacağına uygulama karar verir
   * (bkz. `LifeExitPrompt` — onay sorar, sessizce kapatmaz).
   */
  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
  }

  private fun dispatchBackToWebView() {
    webView?.evaluateJavascript(
      "window.dispatchEvent(new CustomEvent('vol:androidback'))",
      null,
    )
  }

  /**
   * Odak her geri geldiğinde çubuklar yeniden gizlenir. Geçici gösterim,
   * uygulama değiştirme ve bildirim gölgesi çubukları geri getirir.
   */
  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) hideSystemBars()
  }

  private fun hideSystemBars() {
    WindowCompat.getInsetsController(window, window.decorView).apply {
      systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      hide(WindowInsetsCompat.Type.systemBars())
    }
  }
}
