/**
 * Kapatılması gereken bir kaynak (event listener, timer, subscription vb.)
 * için ortak sözleşme.
 */
export interface Disposable {
  dispose(): void;
}

/**
 * Birden fazla `Disposable`'ı tek bir birim olarak yönetir.
 *
 * Bir component'in aynı ömre sahip birden fazla kaynağı (birkaç event
 * listener, bir observer, bir timer) olduğunda, her birini `destroy()`
 * içinde tek tek ve simetrik biçimde kapatmak kolayca unutulan bir adım
 * haline gelir — kaynak eklenir, kapatma satırı eklenmeyi unutulur. `add()`
 * ile kaydedilen her kaynak `dispose()` çağrıldığında EKLENİŞ SIRASININ
 * TERSİNDE kapatılır (son eklenen ilk kapanır — kaynaklar arası bağımlılık
 * genelde bu yönde kurulur). İkinci `dispose()` çağrısı no-op'tur.
 */
export class DisposableScope implements Disposable {
  private readonly disposables: Disposable[] = [];
  private disposed = false;

  /**
   * Verilen kaynağı kaydeder ve olduğu gibi geri döner (zincirlenebilir
   * kullanım için). Scope zaten `dispose()` edilmişse kaynak HEMEN kapatılır
   * ve kayıtlı tutulmaz — geç eklenen bir kaynağın sessizce sızmasını önler.
   */
  add<T extends Disposable>(disposable: T): T {
    if (this.disposed) {
      disposable.dispose();
      return disposable;
    }
    this.disposables.push(disposable);
    return disposable;
  }

  /**
   * `target.addEventListener`'ı çağırır ve kaldırmayı bir `Disposable`
   * olarak kaydeder — çağıran `removeEventListener`'ı elle simetrik tutmak
   * zorunda kalmaz. `options` hem ekleme hem kaldırmada aynı değerle
   * kullanılır (aksi halde tarayıcı listener'ı eşleştirip kaldıramaz).
   *
   * `options` verilmediğinde `addEventListener`/`removeEventListener` İKİ
   * argümanla çağrılır (üçüncü argümana açıkça `undefined` geçilmez) —
   * bazı ortamlarda/test spy'larında iki ve üç argümanlı çağrılar farklı
   * eşleşir, bu yüzden çağıranın orijinal davranışı (options'sız çağrı)
   * birebir korunur.
   */
  addListener(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (options === undefined) {
      target.addEventListener(type, listener);
      this.add({ dispose: () => target.removeEventListener(type, listener) });
    } else {
      target.addEventListener(type, listener, options);
      this.add({ dispose: () => target.removeEventListener(type, listener, options) });
    }
  }

  /**
   * Kayıtlı tüm kaynakları ekleniş sırasının TERSİNDE kapatır. İkinci çağrı
   * no-op. Bir kaynağın `dispose()`'u hata fırlatırsa yakalanıp yutulur —
   * tek bir bozuk listener/timer'ın geri kalan kaynakların (ve dolayısıyla
   * sızıntı temizliğinin) yarım kalmasına izin verilmez.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (let i = this.disposables.length - 1; i >= 0; i--) {
      try {
        this.disposables[i].dispose();
      } catch {
        // Bilinçli olarak yutulur — bkz. yukarıdaki JSDoc.
      }
    }
    this.disposables.length = 0;
  }

  /** Bu scope zaten `dispose()` edildi mi? */
  isDisposed(): boolean {
    return this.disposed;
  }
}
