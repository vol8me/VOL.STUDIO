import { Button, Checkbox, DisposableScope, Panel, Slider, Text, i18next } from '@volstudio/core';
import type { AudioSettings } from '@/app/AudioSettings';
import { gameAudio } from '@/app/services';
import { sfxVolumes } from '@/config/audio';

/**
 * Oyun içi duraklatma ekranı — DOM tabanlı overlay.
 * ESC tuşu veya sağ üst pause butonu ile açılır/kapanır.
 * Phaser sahnesini pause yapar, DOM overlay gösterir.
 * Settings alt-panel: ses seviyeleri + mute + ekran sarsıntısı.
 */
export class PauseScreen {
  private readonly scope = new DisposableScope();
  private readonly overlay: HTMLDivElement;
  private readonly panel: Panel;
  private readonly settingsPanel: Panel;
  private readonly resumeButton!: Button;
  private readonly restartButton!: Button;
  private readonly settingsButton!: Button;
  private readonly mainMenuButton!: Button;
  private readonly titleText!: Text;
  private readonly settingsTitleText!: Text;
  private readonly masterSlider: Slider;
  private readonly sfxSlider: Slider;
  private readonly musicSlider: Slider;
  private readonly shakeCheckbox: Checkbox;
  private readonly muteCheckbox: Checkbox;
  private readonly settingsBackButton: Button;
  private readonly onLanguageChanged = (): void => {
    this.titleText.setContent(i18next.t('volhell:pause.title'));
    this.resumeButton.setLabel(i18next.t('volhell:pause.resume'));
    this.restartButton.setLabel(i18next.t('volhell:pause.restart'));
    this.settingsButton.setLabel(i18next.t('volhell:pause.settings'));
    this.mainMenuButton.setLabel(i18next.t('volhell:pause.mainMenu'));
    this.settingsTitleText.setContent(i18next.t('volhell:settings.title'));
    this.masterSlider.setLabel(i18next.t('volhell:settings.master'));
    this.sfxSlider.setLabel(i18next.t('volhell:settings.sfx'));
    this.musicSlider.setLabel(i18next.t('volhell:settings.music'));
    this.shakeCheckbox.setLabel(i18next.t('volhell:settings.shake'));
    this.muteCheckbox.setLabel(i18next.t('volhell:settings.mute'));
    this.settingsBackButton.setLabel(i18next.t('volhell:settings.back'));
  };

  constructor(
    parent: HTMLElement,
    private readonly audioSettings: AudioSettings,
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
    this.settingsTitleText = new Text(i18next.t('volhell:settings.title'), {
      variant: 'title',
      tag: 'h1',
    });

    const makeSlider = (
      get: () => number,
      set: (v: number) => Promise<void>,
      label: string,
    ): Slider =>
      new Slider({
        min: 0,
        max: 1,
        step: 0.05,
        value: get(),
        label,
        onCommit: (value) => {
          void set(value).then(() => {
            void gameAudio.playSfx('menuBlip', { volume: sfxVolumes.menuBlip });
          });
        },
      });

    this.masterSlider = makeSlider(
      () => audioSettings.getMasterVolume(),
      (v) => audioSettings.setMasterVolume(v),
      i18next.t('volhell:settings.master'),
    );
    this.sfxSlider = makeSlider(
      () => audioSettings.getSfxVolume(),
      (v) => audioSettings.setSfxVolume(v),
      i18next.t('volhell:settings.sfx'),
    );
    this.musicSlider = makeSlider(
      () => audioSettings.getMusicVolume(),
      (v) => audioSettings.setMusicVolume(v),
      i18next.t('volhell:settings.music'),
    );

    this.shakeCheckbox = new Checkbox({
      checked: audioSettings.isScreenShakeEnabled(),
      label: i18next.t('volhell:settings.shake'),
      onCommit: (checked) => {
        void audioSettings.setScreenShakeEnabled(checked).then(() => {
          void gameAudio.playSfx('menuBlip', { volume: sfxVolumes.menuBlip });
        });
      },
    });

    this.muteCheckbox = new Checkbox({
      checked: audioSettings.isMuted(),
      label: i18next.t('volhell:settings.mute'),
      onCommit: (checked) => {
        void audioSettings.setMuted(checked).then(() => {
          if (!checked) {
            void gameAudio.playSfx('menuBlip', { volume: sfxVolumes.menuBlip });
          }
        });
      },
    });

    this.settingsBackButton = new Button(i18next.t('volhell:settings.back'), {
      variant: 'primary',
      onClick: () => this.hideSettings(),
    });

    this.settingsPanel = new Panel({ className: 'pause-panel' })
      .add(this.settingsTitleText)
      .add(this.masterSlider)
      .add(this.sfxSlider)
      .add(this.musicSlider)
      .add(this.shakeCheckbox)
      .add(this.muteCheckbox)
      .add(this.settingsBackButton);

    this.overlay.appendChild(this.panel.element);
    this.overlay.appendChild(this.settingsPanel.element);
    parent.appendChild(this.overlay);

    i18next.on('languageChanged', this.onLanguageChanged);
    this.scope.addSubscription(() => i18next.off('languageChanged', this.onLanguageChanged));
    this.scope.addDestroyable(this.panel);
    this.scope.addDestroyable(this.settingsPanel);
    this.scope.addDestroyable(this.resumeButton);
    this.scope.addDestroyable(this.restartButton);
    this.scope.addDestroyable(this.settingsButton);
    this.scope.addDestroyable(this.mainMenuButton);
    this.scope.addDestroyable(this.settingsBackButton);
    this.scope.addDestroyable(this.masterSlider);
    this.scope.addDestroyable(this.sfxSlider);
    this.scope.addDestroyable(this.musicSlider);
    this.scope.addDestroyable(this.shakeCheckbox);
    this.scope.addDestroyable(this.muteCheckbox);
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
    void gameAudio.playSfx('menuBlip', { volume: sfxVolumes.menuBlip });
    this.panel.hide();
    this.settingsPanel.show();
  }

  private hideSettings(): void {
    void gameAudio.playSfx('back', { volume: sfxVolumes.back });
    this.settingsPanel.hide();
    this.panel.show();
  }

  destroy(): void {
    this.scope.dispose();
    this.overlay.remove();
  }
}
