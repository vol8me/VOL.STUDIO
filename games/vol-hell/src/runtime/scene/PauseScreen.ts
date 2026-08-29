import {
  Button,
  DisposableScope,
  IconButton,
  Panel,
  Text,
  i18next,
  shouldUseTouchControls,
} from '@volstudio/core';
import type { AudioSettings } from '@/app/AudioSettings';
import type { VideoSettings } from '@/app/VideoSettings';
import { hasNativeWindow } from '@/app/platform';
import { gameAudio } from '@/app/services';
import { sfxVolumes } from '@/config/audio';
import { GameSettingsContent } from '@/runtime/ui/GameSettingsContent';

/** Oyun içi duraklatma ekranı ve ortak ayarlar alt yüzeyi. */
export class PauseScreen {
  private readonly scope = new DisposableScope();
  private readonly overlay: HTMLDivElement;
  private readonly panel: Panel;
  private readonly settingsPanel: Panel;
  private readonly resumeButton: Button;
  private readonly restartButton: Button;
  private readonly settingsButton: Button;
  private readonly mainMenuButton: Button;
  private readonly titleText: Text;
  private readonly settingsTitleText: Text;
  private readonly settingsContent: GameSettingsContent;
  private readonly settingsBackButton: Button;
  private readonly settingsCloseButton: IconButton;
  private readonly onLanguageChanged = (): void => {
    this.titleText.setContent(i18next.t('volhell:pause.title'));
    this.resumeButton.setLabel(i18next.t('volhell:pause.resume'));
    this.restartButton.setLabel(i18next.t('volhell:pause.restart'));
    this.settingsButton.setLabel(i18next.t('volhell:pause.settings'));
    this.mainMenuButton.setLabel(i18next.t('volhell:pause.mainMenu'));
    this.settingsTitleText.setContent(i18next.t('volhell:settings.title'));
    this.settingsBackButton.setLabel(i18next.t('volhell:settings.back'));
    this.settingsCloseButton.setLabel(i18next.t('volhell:settings.close'));
  };

  constructor(
    parent: HTMLElement,
    audioSettings: AudioSettings,
    videoSettings: VideoSettings,
    private readonly callbacks: {
      onResume: () => void;
      onRestart: () => void;
      onMainMenu: () => void;
    },
  ) {
    this.overlay = document.createElement('div');
    this.overlay.className = 'vol-pause-overlay';

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

    this.settingsCloseButton = new IconButton('✕', {
      label: i18next.t('volhell:settings.close'),
      onClick: () => this.hideSettings(),
    });
    this.settingsCloseButton.element.classList.add('pause-settings-close');
    this.settingsTitleText = new Text(i18next.t('volhell:settings.title'), {
      variant: 'title',
      tag: 'h1',
    });
    this.settingsContent = new GameSettingsContent({
      audioSettings,
      videoSettings,
      showVideoSettings: !shouldUseTouchControls(),
      canResizeWindow: hasNativeWindow(),
    });
    this.settingsBackButton = new Button(i18next.t('volhell:settings.back'), {
      variant: 'primary',
      onClick: () => this.hideSettings(),
    });
    this.settingsPanel = new Panel({ className: 'pause-panel pause-settings-panel' })
      .add(this.settingsCloseButton)
      .add(this.settingsTitleText)
      .add(this.settingsContent)
      .add(this.settingsBackButton);

    this.overlay.append(this.panel.element, this.settingsPanel.element);
    parent.appendChild(this.overlay);

    i18next.on('languageChanged', this.onLanguageChanged);
    this.scope.addSubscription(() => i18next.off('languageChanged', this.onLanguageChanged));
    this.scope.addDestroyables(
      this.panel,
      this.settingsPanel,
      this.titleText,
      this.settingsTitleText,
      this.resumeButton,
      this.restartButton,
      this.settingsButton,
      this.mainMenuButton,
      this.settingsContent,
      this.settingsBackButton,
      this.settingsCloseButton,
    );
  }

  show(): void {
    this.overlay.classList.add('vol-pause-overlay--visible');
    this.settingsPanel.hide();
    this.panel.show();
  }

  hide(): void {
    this.overlay.classList.remove('vol-pause-overlay--visible');
    this.panel.hide();
    this.settingsPanel.hide();
  }

  isVisible(): boolean {
    return this.overlay.classList.contains('vol-pause-overlay--visible');
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
