import {
  observeViewportOrientation,
  readViewportOrientation,
  waitForViewportOrientation,
  type ScreenOrientation,
  type ScreenOrientationState,
} from '@volstudio/tauri-v2';
import { DisposableScope } from '@volstudio/core';
import { displayConfig } from '@/config/display';

const WINDOW_MODE_EVENT = 'vol:windowmodechange';

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
  private readonly interactiveListeners = new Set<(interactive: boolean) => void>();
  private observationScope: DisposableScope | null = null;

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
    this.ensureObserving();
    return () => {
      this.listeners.delete(listener);
      this.stopObservingIfIdle();
    };
  }

  subscribeInteractive(listener: (interactive: boolean) => void): () => void {
    this.interactiveListeners.add(listener);
    this.ensureObserving();
    return () => {
      this.interactiveListeners.delete(listener);
      this.stopObservingIfIdle();
    };
  }

  private emit(orientation: ScreenOrientation): void {
    for (const listener of this.listeners) listener(orientation);
  }

  private ensureObserving(): void {
    if (this.observationScope) return;
    const scope = new DisposableScope();
    scope.addSubscription(observeViewportOrientation((orientation) => this.emit(orientation)));
    if (this.bridge) {
      scope.addListener(window, WINDOW_MODE_EVENT, () => void this.refreshInteractive());
    }
    this.observationScope = scope;
  }

  private stopObservingIfIdle(): void {
    if (this.listeners.size > 0 || this.interactiveListeners.size > 0) return;
    this.observationScope?.dispose();
    this.observationScope = null;
  }

  private async refreshInteractive(): Promise<void> {
    if (!this.bridge) return;
    let next = false;
    try {
      next = (await this.bridge.getState()).supported;
    } catch (error) {
      console.warn('[VOL.LIFE] Ekran yönü desteği yenilenemedi:', error);
    }
    if (next === this.interactive) return;
    this.interactive = next;
    for (const listener of this.interactiveListeners) listener(next);
  }
}
