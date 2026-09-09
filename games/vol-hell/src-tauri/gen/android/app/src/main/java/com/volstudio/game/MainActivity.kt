package com.volstudio.game

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * VOL.HELL'in Android giriş noktası — sürükleyici tam ekran ve geri tuşu.
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
    // Callback'i Activity yaşam döngüsünde, ana thread'de kaydet. WebView
    // kurulumu bazı cihazlarda dispatcher kaydı için geç/uygunsuz bir sınır
    // olabiliyor; referans hazır değilse geri olayı güvenle tüketilir.
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
   * Wry'ın kendi geri işleyicisi WebView geçmişine bakar; VOL.HELL tek sayfalı
   * olduğu için geçmiş HİÇ dolmaz ve her geri basışı uygulamayı kapatıyordu —
   * koşunun ortasında tek bir jestle. Buradaki işleyici olayı JS'e taşır;
   * hangi ekranın ne yapacağına oyun karar verir (menüde onay kutusu, oyunda
   * duraklatma, ayarlarda geri dönüş).
   *
   * Callback `onCreate` içinde Activity'ye bağlanır; bu fonksiyon yalnız
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
   * Odak her geri geldiğinde çubuklar yeniden gizlenir.
   *
   * Geçici gösterim, uygulama değiştirme ve bildirim gölgesi çubukları geri
   * getirir; yalnızca `onCreate`te gizlemek oyunu ilk kesintiden sonra kalıcı
   * olarak çubuklu bırakırdı.
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
