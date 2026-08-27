/**
 * Kapatılması gereken bir kaynak (event listener, timer, subscription vb.)
 * için ortak sözleşme.
 */
export interface Disposable {
  dispose(): void;
}

/** İptal edilebilen zamanlayıcı/çerçeve kaynağı. */
export interface CancellableDisposable extends Disposable {
  cancel(): void;
}

/** `destroy()` kullanan bir bileşenin scope'a bağlanabilen şekli. */
export interface Destroyable {
  destroy(): void;
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
  addListener<TEvent extends Event>(
    target: EventTarget,
    type: string,
    listener: (event: TEvent) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
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
   * Aboneliğin kaldırma fonksiyonunu scope'a bağlar. i18n/event-emitter gibi
   * DOM dışı kaynaklar için `addListener`ın eşleniğidir.
   */
  addSubscription(unsubscribe: () => void): void {
    let active = true;
    const disposable: Disposable = {
      dispose: () => {
        if (!active) return;
        active = false;
        try {
          unsubscribe();
        } finally {
          this.remove(disposable);
        }
      },
    };
    this.add(disposable);
  }

  /** `destroy()` API'si olan bir bileşeni scope'a kaydeder. */
  addDestroyable<T extends Destroyable>(destroyable: T): T {
    this.add({ dispose: () => destroyable.destroy() });
    return destroyable;
  }

  /** Birden fazla `destroy()` bileşenini tek çağrıda, ters sırayla kapatılacak şekilde kaydeder. */
  addDestroyables(...destroyables: readonly Destroyable[]): void {
    for (const destroyable of destroyables) {
      this.addDestroyable(destroyable);
    }
  }

  /** Tek atımlık timer'ı scope'a bağlar ve çalışınca kaydı kendisi kaldırır. */
  addTimeout(callback: () => void, delayMs: number): CancellableDisposable {
    return this.addTimer(callback, delayMs, false);
  }

  /** Tekrarlayan interval'ı scope'a bağlar. */
  addInterval(callback: () => void, intervalMs: number): CancellableDisposable {
    return this.addTimer(callback, intervalMs, true);
  }

  /** Tek atımlık rAF'ı scope'a bağlar; rAF bulunmayan test/headless ortamda timer'a düşer. */
  addAnimationFrame(callback: (timestamp: number) => void): CancellableDisposable {
    const request = globalThis.requestAnimationFrame;
    const cancel = globalThis.cancelAnimationFrame;
    if (typeof request !== 'function' || typeof cancel !== 'function') {
      return this.addTimeout(() => callback(Date.now()), 0);
    }

    let active = true;
    const frame = { id: undefined as number | undefined };
    const disposable: CancellableDisposable = {
      cancel: () => disposable.dispose(),
      dispose: () => {
        if (!active) return;
        active = false;
        if (frame.id !== undefined) cancel(frame.id);
        this.remove(disposable);
      },
    };
    const onFrame = (timestamp: number): void => {
      if (!active) return;
      active = false;
      this.remove(disposable);
      callback(timestamp);
    };
    frame.id = request(onFrame);
    // requestAnimationFrame normalde callback'i daha sonra çağırır; fake
    // timer'ların callback'i hemen çalıştırabildiği ortamlarda da güvenli kalır.
    if (!active) return disposable;
    return this.add(disposable);
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

  private addTimer(
    callback: () => void,
    delayMs: number,
    repeating: boolean,
  ): CancellableDisposable {
    let active = true;
    const timer = { id: undefined as ReturnType<typeof setTimeout> | undefined };
    const disposable: CancellableDisposable = {
      cancel: () => disposable.dispose(),
      dispose: () => {
        if (!active) return;
        active = false;
        if (timer.id !== undefined) {
          if (repeating) clearInterval(timer.id);
          else clearTimeout(timer.id);
        }
        this.remove(disposable);
      },
    };
    const run = (): void => {
      if (!active) return;
      if (!repeating) {
        active = false;
        this.remove(disposable);
      }
      callback();
    };
    timer.id = repeating ? setInterval(run, delayMs) : setTimeout(run, delayMs);
    return this.add(disposable);
  }

  private remove(disposable: Disposable): void {
    const index = this.disposables.indexOf(disposable);
    if (index >= 0) this.disposables.splice(index, 1);
  }
}
