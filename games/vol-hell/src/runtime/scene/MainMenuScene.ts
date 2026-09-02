import { Button, Panel, Text, i18next, showConfirm, vibrate } from '@volstudio/core';
import { TauriWindowAdapter } from '@volstudio/tauri-v2';
import { BaseScene } from './BaseScene';
import { LoadingTransition } from './LoadingTransition';
import { gameAudio } from '@/app/services';
import { sfxVolumes } from '@/config';
import { startMenuMusic, stopMenuMusic } from '@/app/menuMusic';
import { gameStats } from '@/app/services';
import { formatTimeMs } from '@/utils/time';
import { pushBackHandler } from '@volstudio/core';

export class MainMenuScene extends BaseScene {
  private panel!: Panel;
  private startButton!: Button;
  private exitButton!: Button;
  private settingsButton!: Button;
  private loadingTransition: LoadingTransition | null = null;
  /** Android geri tuşu işleyicisinin kaydını kaldırır. */
  private stopBackHandler: (() => void) | null = null;
  /** Sahne ömrünü aşan veya yinelenen çıkış onaylarını tek noktadan iptal eder. */
  private exitPromptAbort: AbortController | null = null;
  /** Uygulama çıkış niyetini Rust tarafına `exit_application` komutuyla iletir. */
  private readonly windowAdapter = new TauriWindowAdapter();
  private nextScene: string | null = null;
  private titleText!: Text;
  private subtitleText!: Text;
  private bestScoreText!: Text;
  private bestTimeText!: Text;

  constructor() {
    super({ key: 'MainMenu' });
  }

  protected override onLanguageChanged(): void {
    this.titleText.setContent(i18next.t('volhell:menu.title'));
    this.subtitleText.setContent(i18next.t('volhell:menu.subtitle'));
    this.startButton.setLabel(i18next.t('volhell:menu.start'));
    this.settingsButton.setLabel(i18next.t('volhell:menu.settings'));
    this.exitButton.setLabel(i18next.t('volhell:menu.exit'));
    this.updateBestStats();
  }

  protected createScene(): void {
    // Phaser sahne ornegini yeniden kullanir; alan baslaticisi restart'ta
    // calismaz. Sifirlanmazsa Ayarlar'dan donunce deger 'Settings' olarak asili
    // kalir ve onShutdown muzigi yanlislikla durdurmaz.
    this.nextScene = null;
    this.exitPromptAbort?.abort();
    this.exitPromptAbort = null;

    // Menü müziği bir parça listesidir ve sahnenin dışında yaşar: Ayarlar'a
    // gidip dönünce baştan sarmaz, bir parça bitince sıradakine geçer.
    startMenuMusic(() => this.scene.isActive(this.scene.key));

    this.startButton = new Button(i18next.t('volhell:menu.start'), {
      variant: 'primary',
      onClick: () => {
        void gameAudio.playSfx('menuBlip', { volume: sfxVolumes.menuBlip });
        this.startGame();
      },
    });
    this.exitButton = new Button(i18next.t('volhell:menu.exit'), {
      onClick: () => {
        void gameAudio.playSfx('menuBlip', { volume: sfxVolumes.menuBlip });
        void this.exitGame();
      },
    });
    this.settingsButton = new Button(i18next.t('volhell:menu.settings'), {
      onClick: () => {
        void gameAudio.playSfx('menuBlip', { volume: sfxVolumes.menuBlip });
        this.nextScene = 'Settings';
        this.scene.start('Settings');
      },
    });

    this.titleText = new Text(i18next.t('volhell:menu.title'), { variant: 'title', tag: 'h1' });
    this.subtitleText = new Text(i18next.t('volhell:menu.subtitle'), { variant: 'muted' });
    this.bestScoreText = new Text('', { variant: 'muted' });
    this.bestTimeText = new Text('', { variant: 'muted' });
    this.updateBestStats();

    this.panel = new Panel({ className: 'main-menu-panel' })
      .add(this.titleText)
      .add(this.subtitleText)
      .add(this.bestScoreText)
      .add(this.bestTimeText)
      .add(this.startButton)
      .add(this.settingsButton)
      .add(this.exitButton);

    this.ui.mount(this.panel.element);

    this.showOnNextFrame(() => this.panel.show());

    // Menüde geri tuşu = çıkış, ama onay kutusuyla.
    this.stopBackHandler?.();
    this.stopBackHandler = pushBackHandler(() => {
      if (this.exitPromptAbort) {
        this.exitPromptAbort.abort();
        return true;
      }
      void this.exitGame();
      return true;
    });
  }

  private updateBestStats(): void {
    const bestScore = gameStats.getBestScore();
    const bestTimeMs = gameStats.getBestTimeMs();
    this.bestScoreText?.setContent(i18next.t('volhell:menu.bestScore', { score: bestScore }));
    this.bestTimeText?.setContent(
      i18next.t('volhell:menu.bestTime', { time: formatTimeMs(bestTimeMs) }),
    );
  }

  private startGame(): void {
    this.startButton.setLoading(true);

    this.loadingTransition = new LoadingTransition();
    this.loadingTransition.show(this.ui.element);
    this.loadingTransition.scheduleTransition((loadingScreen) => {
      this.loadingTransition = null;
      this.startButton.setLoading(false);
      this.nextScene = 'Game';
      stopMenuMusic();
      this.scene.start('Game', { loadingScreen });
    });
  }

  /**
   * Çıkış GERİ ALINAMAZ, bu yüzden onay ister.
   *
   * Android'de bu ayrıca donanım/jest "geri" tuşunun da vardığı yerdir:
   * yanlışlıkla bir kaydırma oyunu kapatmamalı. Onay kutusu `.vol-ui-root`
   * içine mount edilir, yoksa `body`ye düşer ve oyunun tema/box-sizing
   * kurallarının dışında kalırdı.
   *
   * `getCurrentWindow().close()` yerine `TauriWindowAdapter.close()` kullanılır;
   * ilki Tauri Android'de WebView pencere yaşam döngüsüne girer ve uygulamayı
   * sonlandırmaz, `exitPromptAbort`'ı asılı bırakarak ikinci çıkış denemesini
   * sessizce engeller. `exit_application` komutu `AppHandle::exit(0)` ile süreci
   * kapatır. Onaydan hemen önce `exitPromptAbort` temizlenir ki kullanıcı hızlıca
   * tekrar basarsa yeni modal açılabilsin.
   */
  private async exitGame(): Promise<void> {
    if (this.exitPromptAbort) return;

    const promptAbort = new AbortController();
    this.exitPromptAbort = promptAbort;
    vibrate('warning');
    try {
      const confirmed = await showConfirm({
        title: i18next.t('volhell:menu.exitConfirm'),
        variant: 'danger',
        container: this.ui.element,
        signal: promptAbort.signal,
      });
      if (!confirmed || promptAbort.signal.aborted) return;

      this.exitPromptAbort = null;
      this.windowAdapter.close().catch((error) => {
        console.error('[MainMenuScene] Uygulama kapatılamadı:', error);
      });
    } finally {
      if (this.exitPromptAbort === promptAbort) {
        this.exitPromptAbort = null;
      }
    }
  }

  protected override onSceneShutdown(): void {
    // Ayarlara geçerken müzik devam etsin; oyuna geçişte zaten transition'da durdurulur.
    this.stopBackHandler?.();
    this.stopBackHandler = null;
    this.exitPromptAbort?.abort();
    this.exitPromptAbort = null;
    if (this.nextScene !== 'Settings') {
      stopMenuMusic();
    }
    if (this.loadingTransition) {
      this.loadingTransition.destroy();
      this.loadingTransition = null;
    }
    this.startButton.destroy();
    this.exitButton.destroy();
    this.settingsButton.destroy();
    this.panel.destroy();
  }
}
