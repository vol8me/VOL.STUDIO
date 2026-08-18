import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '@tauri-apps/api/core';
import { Button, Panel, Text, i18next } from '@volstudio/core';
import { BaseScene } from './BaseScene';
import { LoadingTransition } from './LoadingTransition';
import { gameAudio } from '@/app/services';
import { sfxVolumes } from '@/config';
import { startMenuMusic, stopMenuMusic } from '@/app/menuMusic';
import { gameStats } from '@/app/services';
import { formatTimeMs } from '@/utils/time';

export class MainMenuScene extends BaseScene {
  private panel!: Panel;
  private startButton!: Button;
  private exitButton!: Button;
  private settingsButton!: Button;
  private loadingTransition: LoadingTransition | null = null;
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

  private async exitGame(): Promise<void> {
    if (isTauri()) {
      try {
        await getCurrentWindow().close();
      } catch (error) {
        console.error('[MainMenuScene] Pencere kapatılamadı:', error);
      }
      return;
    }
    console.warn('[MainMenuScene] window.close() tarayıcıda çalışmaz; bu sekmeyi elle kapatın.');
  }

  protected override onSceneShutdown(): void {
    // Ayarlara geçerken müzik devam etsin; oyuna geçişte zaten transition'da durdurulur.
    // SFX'ler kısa olmakla birlikte sahneler arasında taşmaması için durdur.
    gameAudio.stopAllSfx();
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
