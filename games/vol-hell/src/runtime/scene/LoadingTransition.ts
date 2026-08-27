import { LoadingScreen, VOL_COLORS, i18next } from '@volstudio/core';
import { DisposableScope, type CancellableDisposable } from '@volstudio/core/lifecycle';
import { uiConfig } from '@/config/ui';

/** Loading screen geçiş yöneticisi — MainMenu → Game arası yükleniyor ekranı. */
export class LoadingTransition {
  private readonly loadingScreen: LoadingScreen;
  private readonly lifecycle = new DisposableScope();
  private interval: CancellableDisposable | null = null;
  private timeout: CancellableDisposable | null = null;
  private percent = 0;

  /** Toplam gösterim süresi (ms) — minDisplayMs ile aynı olmalı. */
  static readonly durationMs = uiConfig.loading.durationMs;

  constructor() {
    this.loadingScreen = new LoadingScreen({
      indicator: {
        type: 'hexagon-pulse',
        color: VOL_COLORS.brandSolid,
        size: uiConfig.loading.indicatorSize,
      },
      backgroundColor: VOL_COLORS.uiBg,
      title: i18next.t('volhell:loading.title'),
      fontSize: { title: uiConfig.loading.titleFontSize },
      contentPosition: 'center',
      minDisplayMs: uiConfig.loading.durationMs,
      progressMs: uiConfig.loading.progressMs,
    });
  }

  /**
   * Loading screen'i UIRoot içine ekler ve gösterir. Progress simülasyonu başlar.
   * `document.body` yerine UIRoot: repo'daki diğer tüm UI orada yaşıyor ve
   * box-sizing ile temel UI stilleri yalnızca o ağaçta uygulanıyor.
   */
  show(parent: HTMLElement): void {
    this.interval?.cancel();
    parent.appendChild(this.loadingScreen.element);
    this.loadingScreen.show();

    this.interval = this.lifecycle.addInterval(() => {
      this.percent = Math.min(
        uiConfig.loading.progressCap,
        this.percent +
          uiConfig.loading.progressStepMin +
          Math.random() * (uiConfig.loading.progressStepMax - uiConfig.loading.progressStepMin),
      );
      this.loadingScreen.update(this.percent);
    }, uiConfig.loading.progressIntervalMs);
  }

  /** Süre dolunca callback çağrılır. LoadingScreen referansı callback'e verilir. */
  scheduleTransition(onReady: (loadingScreen: LoadingScreen) => void): void {
    this.timeout?.cancel();
    this.timeout = this.lifecycle.addTimeout(() => {
      this.timeout = null;
      this.interval?.cancel();
      this.interval = null;
      onReady(this.loadingScreen);
    }, LoadingTransition.durationMs);
  }

  destroy(): void {
    this.interval?.cancel();
    this.timeout?.cancel();
    this.interval = null;
    this.timeout = null;
    this.lifecycle.dispose();
    this.loadingScreen.destroy();
  }
}
