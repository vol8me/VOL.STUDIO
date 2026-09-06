import Phaser from 'phaser';
import { UIRoot, applyVolViewport, i18next } from '@volstudio/core';
import { DisposableScope } from '@volstudio/core/lifecycle';
import { CustomCursor } from '@/runtime/ui/CustomCursor';

/**
 * DOM UI kullanan sahnelerin iskeleti: `UIRoot`, `languageChanged`, ilk
 * frame'de `show()` ve `SHUTDOWN` temizliği. Amaç tekrarı azaltmak değil,
 * TEMİZLİĞİ zorunlu kılmak — dördünden birinin unutulması sızıntı demek.
 *
 * Alt sınıf `create()` değil `createScene()` yazar; ek temizlik için
 * `onSceneShutdown()` override edilir ve taban temizliği ondan SONRA çalışır.
 */
export abstract class BaseScene extends Phaser.Scene {
  /** DOM UI kökü. `createScene()` çağrıldığında hazırdır. */
  protected ui!: UIRoot;

  /** Sahne örneğinin o anki create/shutdown çevrimine ait kaynaklar. */
  private lifecycleScope: DisposableScope | null = null;
  private shutdownHandled = false;

  private readonly onLanguageChangedBound = (): void => {
    this.onLanguageChanged();
  };

  /** Alan başlatıcıları restart'ta ÇALIŞMAZ; sıfırlama `createScene()` içinde yapılır. */
  create(data?: unknown): void {
    // Önceki çevrim SHUTDOWN alamadıysa yeni listener'lar eklenmeden kapat.
    this.lifecycleScope?.dispose();
    this.shutdownHandled = false;
    const scope = (this.lifecycleScope = new DisposableScope());
    // Dünya birimlerini CSS pikseline sabitler: çözünürlük ayarı sahanın
    // BOYUTUNU değiştirmez. Kamera sahneye ait, bu yüzden sahne başına.
    applyVolViewport(this);
    const container = this.game.canvas.parentElement ?? document.body;
    this.ui = new UIRoot(container);
    // Kapanış TERS sırayla: UI ilk eklenir, en son yok edilir.
    scope.addDestroyable(this.ui);
    // HER sahnede kurulur: yalnız oyun sahnesinde olsaydı imleç ekranlar
    // arasında değişirdi. (F11 bunun AKSİNE bootstrap'te uygulama ömürlüdür;
    // sahne başına listener geçişlerde iki kez toggle üretirdi.)
    scope.addDestroyable(new CustomCursor(document.body));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    scope.add({
      dispose: () => this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this),
    });
    i18next.on('languageChanged', this.onLanguageChangedBound);
    scope.addSubscription(() => i18next.off('languageChanged', this.onLanguageChangedBound));

    try {
      this.createScene(data);
    } catch (createError) {
      // Phaser `create()` fırlattığında SHUTDOWN'ı GARANTİ ETMEZ. Alt sınıfın
      // cleanup hatası asıl nedeni maskelememeli.
      try {
        this.handleShutdown();
      } catch (cleanupError) {
        console.error('[BaseScene] Kısmi kurulum temizliği başarısız:', cleanupError);
      }
      throw createError;
    }
  }

  /** Sahne kurulumunu alt sınıf burada yapar. `this.ui` hazırdır. */
  protected abstract createScene(data?: unknown): void;

  /**
   * Dil değiştiğinde metinleri tazeler. Metni olmayan sahneler override etmez.
   */
  protected onLanguageChanged(): void {}

  /**
   * Alt sınıfa ait kaynakların temizliği. Taban temizliğinden ÖNCE çalışır;
   * `this.ui` bu noktada hâlâ ayaktadır.
   */
  protected onSceneShutdown(): void {}

  /**
   * Bir sonraki frame'de `show()` çağırır ve rAF'i shutdown iptali için saklar.
   * Panel'in geçiş animasyonu, element DOM'a girdikten sonraki ilk frame'de
   * class değişmesini gerektirir — aynı frame'de yapılırsa tarayıcı geçişi atlar.
   */
  protected showOnNextFrame(show: () => void): void {
    this.lifecycleScope?.addAnimationFrame(() => show());
  }

  private handleShutdown(): void {
    if (this.shutdownHandled) return;
    this.shutdownHandled = true;

    try {
      this.onSceneShutdown();
    } finally {
      // Alt sınıf kısmi kurulumda hata verse bile taban listener/rAF/UI
      // kaynakları açık kalmamalı; aksi hâlde sonraki scene restart'ı eski
      // DOM ve i18n closure'larıyla birlikte çalışır.
      this.lifecycleScope?.dispose();
      this.lifecycleScope = null;
    }
  }
}
