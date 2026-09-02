import { invoke, isTauri } from '@tauri-apps/api/core';
import { LogicalSize, getCurrentWindow, type Window as TauriWindow } from '@tauri-apps/api/window';

type WindowHandle = Pick<
  TauriWindow,
  'center' | 'isFullscreen' | 'onResized' | 'setFullscreen' | 'setSize'
>;

export interface TauriWindowAdapterOptions {
  /** Test/SSR ve mobil yüzeylerde native pencere erişimini açıkça kapatır. */
  enabled?: boolean;
  /** Test veya çok pencereli uygulamalar için hedef pencere enjeksiyonu. */
  window?: WindowHandle;
  /** LogicalSize üretimi testte IPC sınıfına bağımlı kalmamak için enjekte edilebilir. */
  createLogicalSize?: (width: number, height: number) => LogicalSize;
  /** Uygulama çıkış komutunu testte IPC'den ayırır. */
  exitApplication?: () => Promise<void>;
}

/**
 * Tauri masaüstü penceresinin küçük, platformdan bağımsız uygulama yüzeyi.
 *
 * Oyunlar doğrudan Tauri Window nesnesini UI katmanına taşımaz; çözünürlük ve
 * tam ekran niyetini bu adapter'a verir. Web/mobil ortamında aynı çağrılar
 * güvenli no-op olur.
 */
export class TauriWindowAdapter {
  private readonly window: WindowHandle | null;
  private readonly createLogicalSize: (width: number, height: number) => LogicalSize;
  private readonly exitApplication: (() => Promise<void>) | null;

  constructor(options: TauriWindowAdapterOptions = {}) {
    const enabled = options.enabled ?? isTauri();
    this.window = enabled ? options.window ?? getCurrentWindow() : null;
    this.exitApplication = enabled
      ? options.exitApplication ?? (() => invoke<void>('exit_application'))
      : null;
    this.createLogicalSize =
      options.createLogicalSize ?? ((width, height) => new LogicalSize(width, height));
  }

  isAvailable(): boolean {
    return this.window !== null;
  }

  async isFullscreen(): Promise<boolean> {
    return this.window ? this.window.isFullscreen() : false;
  }

  async setFullscreen(active: boolean): Promise<void> {
    await this.window?.setFullscreen(active);
  }

  /**
   * Uygulama sürecini kapatır — onaylanmış native uygulama çıkışı.
   *
   * `Window.close()` / `Window.destroy()` pencere yaşam döngüsü
   * primitive'leridir; ürünün "uygulamadan çık" niyetini Android Activity
   * yaşam döngüsüne bırakmak belirsizdir. Kullanıcı zaten ürün modalında onay
   * verdiği için Rust tarafındaki açık uygulama semantiğine,
   * `AppHandle::exit(0)` komutuna gideriz.
   *
   * Native yüzey yoksa (web, test) sessizce hiçbir şey yapmaz: çıkış niyeti
   * her platformda ifade edilebilmeli, ama yalnız native olan yerde sonuç
   * doğurmalıdır.
   */
  async close(): Promise<void> {
    await this.exitApplication?.();
  }

  /** Pencerenin içerik çözünürlüğünü değiştirir ve görünür ekrana ortalar. */
  async setResolution(width: number, height: number): Promise<void> {
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
      throw new RangeError('TauriWindowAdapter: çözünürlük pozitif tam sayılardan oluşmalı');
    }
    if (!this.window) return;

    await this.window.setSize(this.createLogicalSize(width, height));
    await this.window.center();
  }

  /**
   * Tam ekranın ESC/pencere yöneticisi tarafından değişmesini izler.
   *
   * Tauri ayrı bir fullscreen olayı sunmadığı için resize sinyalinden sonra
   * gerçek durum okunur. İki sıralama tuzağı vardır:
   *
   * 1. **Kayıt penceresi.** Taban durum `await` ile okunurken gelen bir resize,
   *    dinleyici henüz bağlanmamışsa tamamen kaybolur ve durum bir sonraki
   *    resize'a kadar yanlış kalır. Bu yüzden `onResized` ÖNCE bağlanır; taban
   *    okuması da diğer sorgularla aynı kuyruğa girer, böylece o sırada gelen
   *    olaylar taban oturduktan sonra sırayla değerlendirilir.
   * 2. **Eşzamanlı sorgu.** Art arda iki resize iki `isFullscreen()` sözü
   *    başlatır; ikincisi önce dönerse durum eski değere geri düşer ve
   *    dinleyici yanlış yönde tetiklenir. Sorgular tek zincirde sıralanır ve
   *    yalnız EN SON istek sonucu yayımlar.
   *
   * Kayıttan ÖNCE olmuş bir değişim bildirilmez: karşılaştırılacak bir önceki
   * durum yoktur. Çağıran açılıştaki gerçek durumu `isFullscreen()` ile okur.
   */
  async onFullscreenChange(listener: (active: boolean) => void): Promise<() => void> {
    const target = this.window;
    if (!target) return () => {};

    let stopped = false;
    let lastState: boolean | undefined;
    let probeGeneration = 0;
    let probeQueue: Promise<void> = Promise.resolve();

    /** @param announce Taban okumasında `false`: durumu kurar, bildirmez. */
    const probe = (announce: boolean): Promise<void> => {
      const generation = ++probeGeneration;
      probeQueue = probeQueue
        .then(async () => {
          // Taban okuması nesil kontrolünden MUAF: araya giren bir resize
          // sorgusu tabanı geçersiz kılmaz, yalnız sırayı belirler.
          if (stopped || (announce && generation !== probeGeneration)) return;
          const active = await target.isFullscreen();
          if (stopped || (announce && generation !== probeGeneration)) return;
          const previous = lastState;
          lastState = active;
          if (announce && previous !== undefined && previous !== active) listener(active);
        })
        .catch((error: unknown) => {
          console.warn('[TauriWindowAdapter] Tam ekran durumu okunamadı:', error);
        });
      return probeQueue;
    };

    // Dinleyici ÖNCE bağlanır: taban okunurken gelen resize kaybolmaz.
    const unlisten = await target.onResized(() => void probe(true));
    // Taban okuması burada BEKLENİR: `stopped` yalnız aşağıdaki closure'dan
    // set edilebiliyor ve çağıran o closure'ı bu satırdan sonra alıyor, yani
    // "kurulum sırasında iptal" durumu OLUŞAMAZ — savunma dalı yazılmaz.
    await probe(false);

    return () => {
      if (stopped) return;
      stopped = true;
      unlisten();
    };
  }
}
