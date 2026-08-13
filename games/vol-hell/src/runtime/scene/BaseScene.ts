import Phaser from 'phaser';
import { UIRoot, i18next } from '@volstudio/core';

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

  /** Bekleyen `show()` rAF'i; shutdown'da iptal edilir. */
  private showRafId: number | null = null;

  private readonly onLanguageChangedBound = (): void => {
    this.onLanguageChanged();
  };

  /**
   * Phaser sahne örneğini yeniden kullanır ve alan başlatıcıları restart'ta
   * ÇALIŞMAZ; bu yüzden durum sıfırlama `createScene()` içinde yapılır.
   */
  create(data?: unknown): void {
    const container = this.game.canvas.parentElement ?? document.body;
    this.ui = new UIRoot(container);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    i18next.on('languageChanged', this.onLanguageChangedBound);

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
    this.showRafId = requestAnimationFrame(() => {
      this.showRafId = null;
      show();
    });
  }

  private handleShutdown(): void {
    this.onSceneShutdown();

    i18next.off('languageChanged', this.onLanguageChangedBound);
    if (this.showRafId !== null) {
      cancelAnimationFrame(this.showRafId);
      this.showRafId = null;
    }
    this.ui.destroy();
  }
}
