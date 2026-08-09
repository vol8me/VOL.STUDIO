import { LoadingScreen, VOL_COLORS, i18next } from '@volstudio/core';

/** Loading screen geçiş yöneticisi — MainMenu → Game arası yükleniyor ekranı. */
export class LoadingTransition {
  private readonly loadingScreen: LoadingScreen;
  private interval: ReturnType<typeof setInterval> | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private percent = 0;

  /** Toplam gösterim süresi (ms) — minDisplayMs ile aynı olmalı. */
  static readonly durationMs = 1200;

  constructor() {
    this.loadingScreen = new LoadingScreen({
      indicator: { type: 'hexagon-pulse', color: VOL_COLORS.brandSolid, size: 140 },
      backgroundColor: VOL_COLORS.uiBg,
      title: i18next.t('volhell:loading.title'),
      fontSize: { title: 28 },
      contentPosition: 'center',
      minDisplayMs: LoadingTransition.durationMs,
      progressMs: 300,
    });
  }

  /** Loading screen'i DOM'a ekler ve gösterir. Progress simülasyonu başlar. */
  show(): void {
    document.body.appendChild(this.loadingScreen.element);
    this.loadingScreen.show();

    this.interval = setInterval(() => {
      this.percent = Math.min(90, this.percent + Math.random() * 20 + 10);
      this.loadingScreen.update(this.percent);
    }, 200);
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
