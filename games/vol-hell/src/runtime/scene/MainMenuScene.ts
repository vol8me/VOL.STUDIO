import Phaser from 'phaser';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '@tauri-apps/api/core';
import { AudioManager, Button, Panel, Text, UIRoot, ToastManager, i18next } from '@volstudio/core';
import { LoadingTransition } from './LoadingTransition';
import { soundAssets, soundKeys } from '@/config';
import { audioSettings } from '@/app/bootstrap';

export class MainMenuScene extends Phaser.Scene {
  private ui!: UIRoot;
  private toasts!: ToastManager;
  private panel!: Panel;
  private startButton!: Button;
  private exitButton!: Button;
  private settingsButton!: Button;
  private showRafId: number | null = null;
  private loadingTransition: LoadingTransition | null = null;
  private titleText!: Text;
  private subtitleText!: Text;
  private audio!: AudioManager;
  private unsubscribeAudio: (() => void) | null = null;
  private readonly onLanguageChanged = (): void => {
    this.titleText.setContent(i18next.t('volhell:menu.title'));
    this.subtitleText.setContent(i18next.t('volhell:menu.subtitle'));
    this.startButton.setLabel(i18next.t('volhell:menu.start'));
    this.settingsButton.setLabel(i18next.t('volhell:menu.settings'));
    this.exitButton.setLabel(i18next.t('volhell:menu.exit'));
  };

  constructor() {
    super({ key: 'MainMenu' });
  }

  preload(): void {
    this.load.audio(soundKeys.menuBlip, soundAssets.menuBlip);
  }

  create(): void {
    const container = this.game.canvas.parentElement ?? document.body;
    this.ui = new UIRoot(container);
    this.toasts = new ToastManager(container);

    this.audio = new AudioManager(this);
    this.audio.setSfxVolume(audioSettings.getSfxVolume());
    this.audio.setMute(audioSettings.isMuted());
    this.unsubscribeAudio = audioSettings.onChange((data) => {
      this.audio.setSfxVolume(data.sfxVolume);
      this.audio.setMute(data.muted);
    });

    this.startButton = new Button(i18next.t('volhell:menu.start'), {
      variant: 'primary',
      onClick: () => {
        this.audio.play(soundKeys.menuBlip, { volume: 0.5 });
        this.startGame();
      },
    });
    this.exitButton = new Button(i18next.t('volhell:menu.exit'), {
      onClick: () => {
        this.audio.play(soundKeys.menuBlip, { volume: 0.5 });
        void this.exitGame();
      },
    });
    this.settingsButton = new Button(i18next.t('volhell:menu.settings'), {
      onClick: () => {
        this.audio.play(soundKeys.menuBlip, { volume: 0.5 });
        this.scene.start('Settings');
      },
    });

    this.titleText = new Text(i18next.t('volhell:menu.title'), { variant: 'title', tag: 'h1' });
    this.subtitleText = new Text(i18next.t('volhell:menu.subtitle'), { variant: 'muted' });

    this.panel = new Panel({ className: 'main-menu-panel' })
      .add(this.titleText)
      .add(this.subtitleText)
      .add(this.startButton)
      .add(this.settingsButton)
      .add(this.exitButton);

    this.ui.mount(this.panel.element);

    this.showRafId = requestAnimationFrame(() => {
      this.showRafId = null;
      this.panel.show();
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);

    i18next.on('languageChanged', this.onLanguageChanged);
  }

  private startGame(): void {
    this.startButton.setLoading(true);

    this.loadingTransition = new LoadingTransition();
    this.loadingTransition.show();
    this.loadingTransition.scheduleTransition((loadingScreen) => {
      this.loadingTransition = null;
      this.startButton.setLoading(false);
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

  private onShutdown(): void {
    i18next.off('languageChanged', this.onLanguageChanged);
    if (this.unsubscribeAudio) {
      this.unsubscribeAudio();
      this.unsubscribeAudio = null;
    }
    if (this.showRafId !== null) {
      cancelAnimationFrame(this.showRafId);
      this.showRafId = null;
    }
    if (this.loadingTransition) {
      this.loadingTransition.destroy();
      this.loadingTransition = null;
    }
    this.startButton.destroy();
    this.exitButton.destroy();
    this.settingsButton.destroy();
    this.panel.destroy();
    this.toasts.destroy();
    this.ui.destroy();
  }
}
