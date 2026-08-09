import { Button, Checkbox, Panel, Slider, Text, i18next, type AudioManager } from '@volstudio/core';
import type { AudioSettings } from '@/app/AudioSettings';
import { soundKeys } from '@/config';

/**
 * Oyun içi duraklatma ekranı — DOM tabanlı overlay.
 * ESC tuşu veya sağ üst pause butonu ile açılır/kapanır.
 * Phaser sahnesini pause yapar, DOM overlay gösterir.
 * Settings alt-panel: volume slider + mute toggle içerir.
 */
export class PauseScreen {
  private readonly overlay: HTMLDivElement;
  private readonly panel: Panel;
  private readonly settingsPanel: Panel;
  private readonly resumeButton: Button;
  private readonly restartButton: Button;
  private readonly settingsButton: Button;
  private readonly mainMenuButton: Button;
  private readonly titleText: Text;
  private readonly settingsTitleText: Text;
  private readonly volumeSlider: Slider;
  private readonly muteCheckbox: Checkbox;
  private readonly settingsBackButton: Button;
  private readonly onLanguageChanged = (): void => {
    this.titleText.setContent(i18next.t('volhell:pause.title'));
    this.resumeButton.setLabel(i18next.t('volhell:pause.resume'));
    this.restartButton.setLabel(i18next.t('volhell:pause.restart'));
    this.settingsButton.setLabel(i18next.t('volhell:pause.settings'));
    this.mainMenuButton.setLabel(i18next.t('volhell:pause.mainMenu'));
    this.settingsTitleText.setContent(i18next.t('volhell:settings.title'));
    this.volumeSlider.setLabel(i18next.t('volhell:settings.volume'));
    this.muteCheckbox.setLabel(i18next.t('volhell:settings.mute'));
    this.settingsBackButton.setLabel(i18next.t('volhell:settings.back'));
  };

  constructor(
    parent: HTMLElement,
    private readonly audioSettings: AudioSettings,
    private readonly audio: AudioManager,
    private readonly callbacks: {
      onResume: () => void;
      onRestart: () => void;
      onMainMenu: () => void;
    },
  ) {
    this.overlay = document.createElement('div');
    this.overlay.className = 'vol-pause-overlay';

    // Ana pause paneli
    this.titleText = new Text(i18next.t('volhell:pause.title'), { variant: 'title', tag: 'h1' });

    this.resumeButton = new Button(i18next.t('volhell:pause.resume'), {
      variant: 'primary',
      onClick: () => this.callbacks.onResume(),
    });
    this.restartButton = new Button(i18next.t('volhell:pause.restart'), {
      onClick: () => this.callbacks.onRestart(),
    });
    this.settingsButton = new Button(i18next.t('volhell:pause.settings'), {
      onClick: () => this.showSettings(),
    });
    this.mainMenuButton = new Button(i18next.t('volhell:pause.mainMenu'), {
      variant: 'danger',
      onClick: () => this.callbacks.onMainMenu(),
    });

    this.panel = new Panel({ className: 'pause-panel' })
      .add(this.titleText)
      .add(this.resumeButton)
      .add(this.restartButton)
      .add(this.settingsButton)
      .add(this.mainMenuButton);

    // Settings alt-paneli
    this.settingsTitleText = new Text(i18next.t('volhell:settings.title'), { variant: 'title', tag: 'h1' });

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

    this.settingsBackButton = new Button(i18next.t('volhell:settings.back'), {
      variant: 'primary',
      onClick: () => this.hideSettings(),
    });

    this.settingsPanel = new Panel({ className: 'pause-panel' })
      .add(this.settingsTitleText)
      .add(this.volumeSlider)
      .add(this.muteCheckbox)
      .add(this.settingsBackButton);

    this.overlay.appendChild(this.panel.element);
    this.overlay.appendChild(this.settingsPanel.element);
    parent.appendChild(this.overlay);

    i18next.on('languageChanged', this.onLanguageChanged);
  }

  show(): void {
    this.overlay.classList.add('vol-pause-overlay--visible');
    this.panel.show();
  }

  hide(): void {
    this.overlay.classList.remove('vol-pause-overlay--visible');
    this.panel.hide();
    this.settingsPanel.hide();
  }

  isVisible(): boolean {
    return this.panel.isVisible();
  }

  private showSettings(): void {
    this.panel.hide();
    this.settingsPanel.show();
  }

  private hideSettings(): void {
    this.settingsPanel.hide();
    this.panel.show();
  }

  destroy(): void {
    i18next.off('languageChanged', this.onLanguageChanged);
    this.resumeButton.destroy();
    this.restartButton.destroy();
    this.settingsButton.destroy();
    this.mainMenuButton.destroy();
    this.settingsBackButton.destroy();
    this.volumeSlider.destroy();
    this.muteCheckbox.destroy();
    this.panel.destroy();
    this.settingsPanel.destroy();
    this.overlay.remove();
  }
}
