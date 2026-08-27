import Phaser from 'phaser';
import { UIRoot, i18next } from '@volstudio/core';
import { DisposableScope } from '@volstudio/core/lifecycle';

/**
 * DOM tabanlı UI kullanan sahnelerin ortak iskeleti.
 *
 * Üç sahnede birebir tekrarlanan dört iş burada toplanır: `UIRoot` kurulumu,
 * `languageChanged` aboneliği, ilk frame'de `show()` için `requestAnimationFrame`
 * ve `SHUTDOWN`'da bunların temizliği. Tekrarın kendisi zararsızdı, ama her yeni
 * sahnede dördünden birinin unutulması sızıntı demek — soyutlamanın asıl amacı
 * temizliği zorunlu kılmak.
 *
 * Alt sınıf `create()` yerine `createScene()` yazar; `SHUTDOWN` kaydı ve UIRoot
 * kurulumu taban tarafından zaten yapılmıştır. Ek kaynak temizliği için
 * `onSceneShutdown()` override edilir — taban temizliği ondan SONRA çalışır,
 * böylece alt sınıf `this.ui` hâlâ ayaktayken kendi işini bitirebilir.
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

  /**
   * Phaser sahne örneğini yeniden kullanır ve alan başlatıcıları restart'ta
   * ÇALIŞMAZ; bu yüzden durum sıfırlama `createScene()` içinde yapılır.
   */
  create(data?: unknown): void {
    // Phaser aynı Scene nesnesini yeniden kullanabilir. Önceki çevrim
    // beklenmedik bir nedenle SHUTDOWN alamadıysa yeni listener'lar eklenmeden
    // kaynakları yine de kapat.
    this.lifecycleScope?.dispose();
    this.shutdownHandled = false;
    const scope = (this.lifecycleScope = new DisposableScope());
    const container = this.game.canvas.parentElement ?? document.body;
    this.ui = new UIRoot(container);
    // Scope kapanış sırası ters olduğu için UI ilk eklenir: diğer listener ve
    // frame kaynakları kapandıktan sonra DOM kökü yok edilir.
    scope.addDestroyable(this.ui);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    scope.add({
      dispose: () => this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this),
    });
    i18next.on('languageChanged', this.onLanguageChangedBound);
    scope.addSubscription(() => i18next.off('languageChanged', this.onLanguageChangedBound));

    this.createScene(data);
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
