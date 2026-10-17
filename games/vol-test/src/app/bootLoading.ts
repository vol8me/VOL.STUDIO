import { LoadingScreen } from '@volstudio/core/ui';
import { i18next } from '@volstudio/core';

/** Açılış yüklemesinin dilim sınırları (yüzde): hizmetler → varlıklar → dünya. */
const SERVICES_DONE = 25;
const ASSETS_SHARE = 65;

/**
 * Oyun açılışının yükleme ekranı. Hızlı açılışta (200 ms altı) hiç görünmez; görünürse en az 400 ms kalır
 * (yanıp sönme yok). İlerleme gerçek aşamalardan gelir: hizmetler, varlık yükleyici oranı, dünya.
 */
export class BootLoading {
  private readonly screen: LoadingScreen;

  constructor() {
    this.screen = new LoadingScreen({
      title: i18next.t('voltest:boot.title'),
      stage: i18next.t('voltest:boot.services'),
      showPercent: true,
      showDelayMs: 200,
      minDisplayMs: 400,
      transitionMs: 240,
      onComplete: () => this.screen.destroy(),
    });
    document.body.appendChild(this.screen.element);
    this.screen.show();
    this.screen.update(8);
  }

  servicesReady(): void {
    this.screen.setStage(i18next.t('voltest:boot.assets'));
    this.screen.update(SERVICES_DONE);
  }

  /** Varlık yükleyici oranı (0–1). */
  assets(ratio: number): void {
    this.screen.update(SERVICES_DONE + ratio * ASSETS_SHARE);
  }

  /** Dokular hazır: dünya kurulur, bir kare sonra ekran kapanır. */
  worldReady(): void {
    this.screen.setStage(i18next.t('voltest:boot.world'));
    this.screen.update(100);
    requestAnimationFrame(() => this.screen.hide());
  }

  /** Açılış başarısız: ölümcül hata ekranı devralır; yükleme ekranı çekilir. */
  abort(): void {
    this.screen.destroy();
  }
}
