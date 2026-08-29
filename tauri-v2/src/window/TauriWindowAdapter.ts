import { isTauri } from '@tauri-apps/api/core';
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

  constructor(options: TauriWindowAdapterOptions = {}) {
    const enabled = options.enabled ?? isTauri();
    this.window = enabled ? options.window ?? getCurrentWindow() : null;
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
   * Tauri ayrı bir fullscreen olayı sunmadığı için resize sinyalinden sonra
   * gerçek durum okunur; aynı durum tekrar bildirilmez.
   */
  async onFullscreenChange(listener: (active: boolean) => void): Promise<() => void> {
    const target = this.window;
    if (!target) return () => {};

    let stopped = false;
    let lastState = await target.isFullscreen();
    const unlisten = await target.onResized(() => {
      void target
        .isFullscreen()
        .then((active) => {
          if (stopped || active === lastState) return;
          lastState = active;
          listener(active);
        })
        .catch((error: unknown) => {
          console.warn('[TauriWindowAdapter] Tam ekran durumu okunamadı:', error);
        });
    });

    return () => {
      if (stopped) return;
      stopped = true;
      unlisten();
    };
  }
}
