import Phaser from 'phaser';
import {
  Button,
  Checkbox,
  Panel,
  Select,
  Slider,
  Text,
  UIRoot,
  i18n,
  i18next,
} from '@volstudio/core';
import { audioSettings, gameAudio } from '@/app/bootstrap';

export class SettingsScene extends Phaser.Scene {
  private ui!: UIRoot;
  private panel!: Panel;
  private backButton!: Button;
  private languageSelect!: Select;
  private titleText!: Text;
  private languageText!: Text;
  private soundText!: Text;
  private masterSlider!: Slider;
  private sfxSlider!: Slider;
  private musicSlider!: Slider;
  private shakeCheckbox!: Checkbox;
  private shakeSlider!: Slider;
  private muteCheckbox!: Checkbox;
  private showRafId: number | null = null;
  private readonly onLanguageChanged = (): void => {
    this.titleText.setContent(i18next.t('volhell:settings.title'));
    this.languageText.setContent(i18next.t('volhell:settings.language'));
    this.soundText.setContent(i18next.t('volhell:settings.sound'));
    this.backButton.setLabel(i18next.t('volhell:settings.back'));
    this.updateSliderLabels();
  };

  constructor() {
    super({ key: 'Settings' });
  }

  create(): void {
    const container = this.game.canvas.parentElement ?? document.body;
    this.ui = new UIRoot(container);

    this.backButton = new Button(i18next.t('volhell:settings.back'), {
      onClick: () => {
        void gameAudio.playSfx('back', { volume: 0.5 });
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

    this.masterSlider = new Slider({
      min: 0,
      max: 1,
      step: 0.05,
      value: audioSettings.getMasterVolume(),
      label: i18next.t('volhell:settings.master'),
      onChange: (value) => {
        void audioSettings.setMasterVolume(value);
        void gameAudio.playSfx('menuBlip', { volume: 0.4 });
      },
    });

    this.sfxSlider = new Slider({
      min: 0,
      max: 1,
      step: 0.05,
      value: audioSettings.getSfxVolume(),
      label: i18next.t('volhell:settings.sfx'),
      onChange: (value) => {
        void audioSettings.setSfxVolume(value);
        void gameAudio.playSfx('menuBlip', { volume: 0.4 });
      },
    });

    this.musicSlider = new Slider({
      min: 0,
      max: 1,
      step: 0.05,
      value: audioSettings.getMusicVolume(),
      label: i18next.t('volhell:settings.music'),
      onChange: (value) => {
        void audioSettings.setMusicVolume(value);
        void gameAudio.playSfx('menuBlip', { volume: 0.4 });
      },
    });

    this.shakeCheckbox = new Checkbox({
      checked: audioSettings.isScreenShakeEnabled(),
      label: i18next.t('volhell:settings.shake'),
      onChange: (checked) => {
        void audioSettings.setScreenShakeEnabled(checked);
        void gameAudio.playSfx('menuBlip', { volume: 0.4 });
      },
    });

    this.shakeSlider = new Slider({
      min: 0,
      max: 1,
      step: 0.05,
      value: audioSettings.getScreenShakeIntensity(),
      label: i18next.t('volhell:settings.shakeIntensity'),
      onChange: (value) => {
        void audioSettings.setScreenShakeIntensity(value);
        void gameAudio.playSfx('menuBlip', { volume: 0.4 });
      },
    });

    this.muteCheckbox = new Checkbox({
      checked: audioSettings.isMuted(),
      label: i18next.t('volhell:settings.mute'),
      onChange: (checked) => {
        void audioSettings.setMuted(checked);
        if (!checked) {
          void gameAudio.playSfx('menuBlip', { volume: 0.4 });
        }
      },
    });

    this.panel = new Panel({ className: 'main-menu-panel' })
      .add(this.titleText)
      .add(this.languageText)
      .add(this.languageSelect)
      .add(this.soundText)
      .add(this.masterSlider)
      .add(this.sfxSlider)
      .add(this.musicSlider)
      .add(this.shakeCheckbox)
      .add(this.shakeSlider)
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

  private updateSliderLabels(): void {
    this.masterSlider.setLabel(i18next.t('volhell:settings.master'));
    this.sfxSlider.setLabel(i18next.t('volhell:settings.sfx'));
    this.musicSlider.setLabel(i18next.t('volhell:settings.music'));
    this.shakeCheckbox.setLabel(i18next.t('volhell:settings.shake'));
    this.shakeSlider.setLabel(i18next.t('volhell:settings.shakeIntensity'));
    this.muteCheckbox.setLabel(i18next.t('volhell:settings.mute'));
  }

  private async changeLanguage(locale: string): Promise<void> {
    await i18n.changeLanguage(locale);
  }

  private onShutdown(): void {
    i18next.off('languageChanged', this.onLanguageChanged);
    if (this.showRafId !== null) {
      cancelAnimationFrame(this.showRafId);
      this.showRafId = null;
    }
    this.backButton.destroy();
    this.languageSelect.destroy();
    this.masterSlider.destroy();
    this.sfxSlider.destroy();
    this.musicSlider.destroy();
    this.shakeCheckbox.destroy();
    this.shakeSlider.destroy();
    this.muteCheckbox.destroy();
    this.panel.destroy();
    this.ui.destroy();
  }
}
