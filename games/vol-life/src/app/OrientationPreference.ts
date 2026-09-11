import {
  observeViewportOrientation,
  readViewportOrientation,
  waitForViewportOrientation,
  type ScreenOrientation,
  type ScreenOrientationState,
} from '@volstudio/tauri-v2';
import { displayConfig } from '@/config/display';

/** Android yön köprüsünün uygulamanın gördüğü yüzü; testte sahtesi verilir. */
export interface OrientationBridge {
  getState(): Promise<ScreenOrientationState>;
  set(orientation: ScreenOrientation): Promise<ScreenOrientationState>;
}

/**
 * Ekran yönü seçimi. Android'de tercih native köprüyle uygulanır; web ve
 * masaüstünde seçim yoktur, kontrol ekranın gerçek yönünü gösterir.
 *
 * Doğruluk kaynağı İSTEK değil EKRANDIR: Android isteği yok sayarsa (geniş ekran,
 * çoklu pencere) dinleyiciler gerçek yönü alır ve seçim oraya geri döner.
 */
export class OrientationPreference {
  private interactive = false;
  private readonly listeners = new Set<(orientation: ScreenOrientation) => void>();
  private stopViewport: (() => void) | null = null;

  constructor(
    private readonly bridge: OrientationBridge | null,
    private readonly settleMs = displayConfig.orientationSettleMs,
  ) {}

  async load(): Promise<void> {
    if (!this.bridge) return;
    try {
      this.interactive = (await this.bridge.getState()).supported;
    } catch (error) {
      this.interactive = false;
      console.warn('[VOL.LIFE] Ekran yönü köprüsü okunamadı:', error);
    }
  }

  isInteractive(): boolean {
    return this.interactive;
  }

  current(): ScreenOrientation {
    return readViewportOrientation();
  }

  async select(orientation: ScreenOrientation): Promise<void> {
    if (this.bridge && this.interactive) {
      try {
        await this.bridge.set(orientation);
      } catch (error) {
        console.warn('[VOL.LIFE] Ekran yönü uygulanamadı:', error);
      }
    }
    this.emit(await waitForViewportOrientation(orientation, this.settleMs));
  }

  subscribe(listener: (orientation: ScreenOrientation) => void): () => void {
    this.listeners.add(listener);
    this.stopViewport ??= observeViewportOrientation((orientation) => this.emit(orientation));
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size > 0) return;
      this.stopViewport?.();
      this.stopViewport = null;
    };
  }

  private emit(orientation: ScreenOrientation): void {
    for (const listener of this.listeners) listener(orientation);
  }
}
