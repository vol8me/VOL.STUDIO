import { DisposableScope, UIRoot, i18next, pushBackHandler, showConfirm } from '@volstudio/core';
import { TauriWindowAdapter } from '@volstudio/tauri-v2';

export interface LifeExitPromptOptions {
  /** Modal'ın ekleneceği kök — CORE UI katmanının içinde kalmalı. */
  container: HTMLElement;
  /** Testte native pencereyi enjekte etmek için. */
  windowAdapter?: TauriWindowAdapter;
}

/**
 * Android geri hareketinin karşılığı.
 *
 * Native taraf geri basışını `vol:androidback` olayına çevirir ve uygulamayı
 * KENDİ BAŞINA kapatmaz. Karar buraya düşer: geri tuşu bir onay sorar.
 * Doğrudan çıkış, tek bir yanlış jestle uzun süredir izlenen bir dünyayı
 * bitirirdi.
 *
 * Aynı anda İKİ onay açılmaz: geri tuşuna üst üste basmak modal yığmamalıdır.
 */
export class LifeExitPrompt {
  private readonly scope = new DisposableScope();
  private readonly uiRoot: UIRoot;
  private readonly windowAdapter: TauriWindowAdapter;
  private readonly abort = new AbortController();
  private open = false;

  constructor(options: LifeExitPromptOptions) {
    // Confirm doğrudan oyun parent'ına eklenirse `.vol-ui-root`un mobil metin
    // seçimi/tap-highlight korumasının DIŞINDA kalır.
    this.uiRoot = this.scope.addDestroyable(new UIRoot(options.container));
    this.windowAdapter = options.windowAdapter ?? new TauriWindowAdapter();
    this.scope.addSubscription(pushBackHandler(() => this.request()));
    this.scope.add({ dispose: () => this.abort.abort() });
  }

  /** Geri hareketini karşılar; olay her zaman TÜKETİLİR (uygulama kapanmaz). */
  request(): boolean {
    if (!this.open) void this.ask();
    return true;
  }

  destroy(): void {
    this.scope.dispose();
  }

  private async ask(): Promise<void> {
    this.open = true;
    try {
      const confirmed = await showConfirm({
        title: i18next.t('life:exit.title'),
        confirmLabel: i18next.t('life:exit.confirm'),
        cancelLabel: i18next.t('life:exit.cancel'),
        variant: 'danger',
        container: this.uiRoot.element,
        signal: this.abort.signal,
      });
      if (confirmed) {
        try {
          await this.windowAdapter.close();
        } catch (error) {
          // `request()` promise'i bilerek beklemez; hata burada yakalanmazsa
          // WebView unhandled rejection üretir ve kullanıcı teşhis göremez.
          console.error('[VOL.LIFE] Uygulama kapatılamadı:', error);
        }
      }
    } finally {
      this.open = false;
    }
  }
}
