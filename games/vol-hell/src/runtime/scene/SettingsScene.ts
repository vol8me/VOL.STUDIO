import Phaser from 'phaser';
import { AudioManager, Button, Checkbox, Panel, Select, Slider, Text, UIRoot, i18n, i18next } from '@volstudio/core';
import { soundAssets, soundKeys } from '@/config';
import { audioSettings } from '@/app/bootstrap';

export class SettingsScene extends Phaser.Scene {
  private ui!: UIRoot;
  private panel!: Panel;
  private backButton!: Button;
  private languageSelect!: Select;
  private titleText!: Text;
  private languageText!: Text;
  private soundText!: Text;
  private volumeSlider!: Slider;
  private muteCheckbox!: Checkbox;
  private showRafId: number | null = null;
  private audio!: AudioManager;
  private unsubscribeAudio: (() => void) | null = null;
  private readonly onLanguageChanged = (): void => {
    this.titleText.setContent(i18next.t('volhell:settings.title'));
    this.languageText.setContent(i18next.t('volhell:settings.language'));
    this.soundText.setContent(i18next.t('volhell:settings.sound'));
    this.volumeSlider.setLabel(i18next.t('volhell:settings.volume'));
    this.muteCheckbox.setLabel(i18next.t('volhell:settings.mute'));
    this.backButton.setLabel(i18next.t('volhell:settings.back'));
  };

  constructor() {
    super({ key: 'Settings' });
  }

  preload(): void {
    this.load.audio(soundKeys.menuBlip, soundAssets.menuBlip);
  }

  create(): void {
    const container = this.game.canvas.parentElement ?? document.body;
    this.ui = new UIRoot(container);

    this.audio = new AudioManager(this);
    this.audio.setSfxVolume(audioSettings.getSfxVolume());
    this.audio.setMute(audioSettings.isMuted());
    this.unsubscribeAudio = audioSettings.onChange((data) => {
      this.audio.setSfxVolume(data.sfxVolume);
      this.audio.setMute(data.muted);
    });

    this.backButton = new Button(i18next.t('volhell:settings.back'), {
      onClick: () => {
        this.audio.play(soundKeys.menuBlip, { volume: 0.5 });
        this.scene.start('MainMenu');
      },
    });

    const currentLocale = i18n.getLocale();
    this.languageSelect = new Select({
      options: [
        { value: 'tr', label: 'Türkçe' },
        { value: 'en', label: 'English' },
      ],
      value: currentLocale,
      onChange: (value) => {
        void this.changeLanguage(value);
      },
    });

    this.titleText = new Text(i18next.t('volhell:settings.title'), { variant: 'title', tag: 'h1' });
    this.languageText = new Text(i18next.t('volhell:settings.language'), { variant: 'muted' });
    this.soundText = new Text(i18next.t('volhell:settings.sound'), { variant: 'muted' });

    this.volumeSlider = new Slider({
      min: 0,
      max: 1,
      step: 0.05,
      value: audioSettings.getSfxVolume(),
      label: i18next.t('volhell:settings.volume'),
      onChange: (value) => {
        void audioSettings.setSfxVolume(value);
        this.audio.play(soundKeys.menuBlip, { volume: 0.5 });
      },
    });

    this.muteCheckbox = new Checkbox({
      checked: audioSettings.isMuted(),
      label: i18next.t('volhell:settings.mute'),
      onChange: (checked) => {
        void audioSettings.setMuted(checked);
        if (!checked) {
          this.audio.play(soundKeys.menuBlip, { volume: 0.5 });
        }
      },
    });

    this.panel = new Panel({ className: 'main-menu-panel' })
      .add(this.titleText)
      .add(this.languageText)
      .add(this.languageSelect)
      .add(this.soundText)
      .add(this.volumeSlider)
      .add(this.muteCheckbox)
      .add(this.backButton);

    this.ui.mount(this.panel.element);

    this.showRafId = requestAnimationFrame(() => {
      this.showRafId = null;
      this.panel.show();
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);

    i18next.on('languageChanged', this.onLanguageChanged);
  }

  private async changeLanguage(locale: string): Promise<void> {
    await i18n.changeLanguage(locale);
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
    this.volumeSlider.destroy();
    this.muteCheckbox.destroy();
    this.backButton.destroy();
    this.languageSelect.destroy();
    this.panel.destroy();
    this.ui.destroy();
  }
}
