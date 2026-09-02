package com.volstudio.arachnid

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * VOL.ARACHNID'in Android giriş noktası — sürükleyici tam ekran ve geri tuşu.
 *
 * `enableEdgeToEdge()` şablondan gelir ve içeriği sistem çubuklarının ALTINA
 * uzatır; ama çubukları GİZLEMEZ, yalnızca üzerine çizim yapılmasına izin
 * verir. Oyunun tam ekran olması için ayrıca gizlenmeleri gerekir.
 */
class MainActivity : TauriActivity() {
  private var webView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Callback'i WebView kurulum callback'inde eklemek bazı cihazlarda native
    // thread/lifecycle zamanlamasına takılıp dispatcher'a hiç girmiyordu;
    // Galaxy S21 FE'de geri tuşu doğrudan Activity'yi bitiriyordu. Activity
    // CREATED durumundayken ana thread'de kaydet, WebView gelene dek de olayı
    // güvenle tüket.
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
   * Geri tuşunu oyuna devreder.
   *
   * Wry'ın kendi geri işleyicisi WebView geçmişine bakar; oyun tek sayfalı
   * olduğu için geçmiş HİÇ dolmaz ve her geri basışı uygulamayı kapatırdı.
   * Buradaki işleyici olayı JS'e taşır; ne olacağına oyun karar verir
   * (bkz. `ArachnidExitPrompt` — onay sorar, sessizce kapatmaz).
   *
   * Tauri bu uygulamada `handleBackNavigation = false` taşır; Activity'nin
   * `onCreate` içinde kurduğu tek callback olayı tüketir. Bu fonksiyon yalnız
   * WebView referansını hazır eder.
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
