import { LoadingScreen, VOL_COLORS, i18next } from '@volstudio/core';
import { uiConfig } from '@/config/ui';

/** Loading screen geçiş yöneticisi — MainMenu → Game arası yükleniyor ekranı. */
export class LoadingTransition {
  private readonly loadingScreen: LoadingScreen;
  private interval: ReturnType<typeof setInterval> | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
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
    parent.appendChild(this.loadingScreen.element);
    this.loadingScreen.show();

    this.interval = setInterval(() => {
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
    this.timeout = setTimeout(() => {
      this.clearTimers();
      onReady(this.loadingScreen);
    }, LoadingTransition.durationMs);
  }

  /** Timer ve interval temizler. */
  private clearTimers(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }

  destroy(): void {
    this.clearTimers();
    this.loadingScreen.destroy();
  }
}
