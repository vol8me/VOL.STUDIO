import { i18next } from '@volstudio/core/i18n';
import { showConfirm } from '@volstudio/core/ui';
import { TauriWindowAdapter } from '@volstudio/tauri-v2';
import type { GameServices } from '@/app/GameServices';
import { MainMenuPanel } from '@/menu/MainMenuPanel';
import { ScreenScene, type ScreenPanel } from './ScreenScene';

/** Ana menü: savaşa katıl (garaj), alıştırma, ayarlar ve (yalnız native'de) çıkış. */
export class MenuScene extends ScreenScene {
  private exitPrompt: AbortController | undefined;

  constructor(
    services: GameServices,
    private readonly window = new TauriWindowAdapter(),
  ) {
    super('Menu', services);
  }

  /** Uygulama yalnız masaüstünde ve Deck'te kapatılır; Android'de çıkışı geri tuşu/sistem yürütür. */
  private get canExit(): boolean {
    return this.services.platform !== 'android' && this.window.isAvailable();
  }

  protected override createScreen(): ScreenPanel {
    this.exitPrompt?.abort();
    this.exitPrompt = undefined;
    this.scope.addSubscription(() => this.exitPrompt?.abort());
    return new MainMenuPanel({
      onPlay: () => this.goto('Garage'),
      onPractice: () => this.goto('World'),
      onSettings: () => this.goto('Settings'),
      onExit: this.canExit ? () => void this.confirmExit() : undefined,
    });
  }

  protected override onBack(): boolean {
    if (!this.canExit) return false;
    if (this.exitPrompt) this.exitPrompt.abort();
    else void this.confirmExit();
    return true;
  }

  /** Çıkış geri alınamaz; onay ister. Onay bekleyen ikinci çıkış isteği yok sayılır. */
  private async confirmExit(): Promise<void> {
    if (this.exitPrompt) return;
    const prompt = new AbortController();
    this.exitPrompt = prompt;
    try {
      const confirmed = await showConfirm({
        title: i18next.t('voltest:menu.exitTitle'),
        confirmLabel: i18next.t('voltest:menu.exitConfirm'),
        cancelLabel: i18next.t('voltest:menu.exitCancel'),
        variant: 'danger',
        container: this.ui.element,
        signal: prompt.signal,
      });
      // Onaydan hemen önce bırakılır: hızlı ikinci basış yeni bir onay açabilsin.
      if (this.exitPrompt === prompt) this.exitPrompt = undefined;
      if (confirmed) await this.window.close();
    } finally {
      if (this.exitPrompt === prompt) this.exitPrompt = undefined;
    }
  }
}
