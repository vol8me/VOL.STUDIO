import Phaser from 'phaser';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '@tauri-apps/api/core';
import { Button, Panel, Text, UIRoot, i18next } from '@volstudio/core';
import { LoadingTransition } from './LoadingTransition';
import { gameAudio } from '@/app/services';
import { musicConfig, musicTracks, menuTrackKeys, sfxVolumes } from '@/config';
import { gameStats } from '@/app/services';
import { formatTimeMs } from '@/utils/time';

/** trackId'nin bir ana menu parcasi olup olmadigini dogrular (cast yerine). */
function isMenuTrack(trackId: string | undefined): boolean {
  return trackId !== undefined && (menuTrackKeys as readonly string[]).includes(trackId);
}

export class MainMenuScene extends Phaser.Scene {
  private ui!: UIRoot;
  private panel!: Panel;
  private startButton!: Button;
  private exitButton!: Button;
  private settingsButton!: Button;
  private showRafId: number | null = null;
  private loadingTransition: LoadingTransition | null = null;
  private nextScene: string | null = null;
  private titleText!: Text;
  private subtitleText!: Text;
  private bestScoreText!: Text;
  private bestTimeText!: Text;
  private readonly onLanguageChanged = (): void => {
    this.titleText.setContent(i18next.t('volhell:menu.title'));
    this.subtitleText.setContent(i18next.t('volhell:menu.subtitle'));
    this.startButton.setLabel(i18next.t('volhell:menu.start'));
    this.settingsButton.setLabel(i18next.t('volhell:menu.settings'));
    this.exitButton.setLabel(i18next.t('volhell:menu.exit'));
    this.updateBestStats();
  };

  constructor() {
    super({ key: 'MainMenu' });
  }

  create(): void {
    // Phaser sahne ornegini yeniden kullanir; alan baslaticisi restart'ta
    // calismaz. Sifirlanmazsa Ayarlar'dan donunce deger 'Settings' olarak asili
    // kalir ve onShutdown muzigi yanlislikla durdurmaz.
    this.nextScene = null;

    const container = this.game.canvas.parentElement ?? document.body;
    this.ui = new UIRoot(container);

    // Ana menüden ayrılıp geri dönüldüğünde müzik başa sarmasın;
    // eğer zaten bir ana menü teması çalıyorsa onu sürdür.
    const currentMusic = gameAudio.music.getCurrentState();
    // Cast yerine type guard: trackId duz bir string, literal union'a dogrulama
    // olmadan cast etmek `any` kadar guvensizdir.
    const isMenuMusicPlaying = currentMusic.playing && isMenuTrack(currentMusic.trackId);

    if (!isMenuMusicPlaying) {
      const trackKey = menuTrackKeys[Math.floor(Math.random() * menuTrackKeys.length)];
      const track = musicTracks[trackKey];
      void gameAudio.loadMusic(track).then(() => {
        // Kullanıcı sahne kapanmadan önce başka bir ekrana geçtiyse müzik çalmaya devam etmesin.
        if (!this.scene.isActive(this.scene.key)) return;
        void gameAudio.playMusic(track.id, { fadeIn: musicConfig.menu.fadeInSec });
      });
    }

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

    this.showRafId = requestAnimationFrame(() => {
      this.showRafId = null;
      this.panel.show();
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);

    i18next.on('languageChanged', this.onLanguageChanged);
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
      gameAudio.stopMusic(musicConfig.menu.stopFadeSec);
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
    // Ayarlara geçerken müzik devam etsin; oyuna geçişte zaten transition'da durdurulur.
    if (this.nextScene !== 'Settings') {
      gameAudio.stopMusic(musicConfig.menu.stopFadeSec);
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
    this.ui.destroy();
  }
}
