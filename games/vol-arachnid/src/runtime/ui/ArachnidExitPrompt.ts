import { DisposableScope, UIRoot, i18next, pushBackHandler, showConfirm } from '@volstudio/core';
import { TauriWindowAdapter } from '@volstudio/tauri-v2';

export interface ArachnidExitPromptOptions {
  /** Modal'ın ekleneceği kök — CORE UI katmanının içinde kalmalı. */
  container: HTMLElement;
  /** Testte native pencereyi enjekte etmek için. */
  windowAdapter?: TauriWindowAdapter;
  /** Modal açılıp kapanırken oyun simülasyonunu durdurmak için. */
  onVisibilityChange?: (open: boolean) => void;
}

/**
 * Android geri hareketinin karşılığı.
 *
 * Native taraf geri basışını `vol:androidback` olayına çevirir ve uygulamayı
 * KENDİ BAŞINA kapatmaz (bkz. CORE `pushBackHandler`). Karar buraya düşer:
 * geri tuşu bir onay sorar. Doğrudan çıkış, tek bir yanlış jestle oturumu
 * bitiriyordu.
 *
 * Aynı anda İKİ onay açılmaz: geri tuşuna üst üste basmak modal yığmamalıdır.
 */
export class ArachnidExitPrompt {
  private readonly scope = new DisposableScope();
  private readonly uiRoot: UIRoot;
  private readonly windowAdapter: TauriWindowAdapter;
  private readonly onVisibilityChange?: (open: boolean) => void;
  private readonly abort = new AbortController();
  private open = false;

  constructor(options: ArachnidExitPromptOptions) {
    // Confirm doğrudan oyun parent'ına eklenirse `.vol-ui-root`un mobil metin
    // seçimi/tap-highlight korumasının DIŞINDA kalır. Paylaşılan kök ref-count
    // taşır; HUD aynı parent'ı kullanıyorsa aynı elementi sahiplenir.
    this.uiRoot = this.scope.addDestroyable(new UIRoot(options.container));
    this.windowAdapter = options.windowAdapter ?? new TauriWindowAdapter();
    this.onVisibilityChange = options.onVisibilityChange;
    this.scope.addSubscription(pushBackHandler(() => this.request()));
    // Sahne kapanırken bekleyen onay da sonlandırılır; modal yığını ve gövde
    // kaydırma kilidi ekranın ömrünü aşmamalı.
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
    this.onVisibilityChange?.(true);
    try {
      const confirmed = await showConfirm({
        title: i18next.t('arachnid:exit.title'),
        confirmLabel: i18next.t('arachnid:exit.confirm'),
        cancelLabel: i18next.t('arachnid:exit.cancel'),
        variant: 'danger',
        container: this.uiRoot.element,
        signal: this.abort.signal,
      });
      if (confirmed) {
        try {
          await this.windowAdapter.close();
        } catch (error) {
          // `request()` promise'i bilerek beklemez; hata burada yakalanmazsa
          // WebView unhandled rejection üretir ve kullanıcı hiçbir teşhis görmez.
          console.error('[ArachnidExitPrompt] Uygulama kapatılamadı:', error);
        }
      }
    } finally {
      this.open = false;
      this.onVisibilityChange?.(false);
    }
  }
}
