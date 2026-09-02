import {
  Button,
  IconButton,
  Panel,
  ScrollView,
  Text,
  i18next,
  shouldUseTouchControls,
} from '@volstudio/core';
import { BaseScene } from './BaseScene';
import { pushBackHandler } from '@volstudio/core';
import { hasNativeWindow } from '@/app/platform';
import { audioSettings, gameAudio, videoSettings } from '@/app/services';
import { sfxVolumes } from '@/config';
import { GameSettingsContent } from '@/runtime/ui/GameSettingsContent';

export class SettingsScene extends BaseScene {
  private panel!: Panel;
  private scrollSurface!: ScrollView;
  private backButton!: Button;
  private closeButton!: IconButton;
  private titleText!: Text;
  private content!: GameSettingsContent;
  /** Android geri tuşu işleyicisinin kaydını kaldırır. */
  private stopBackHandler: (() => void) | null = null;

  constructor() {
    super({ key: 'Settings' });
  }

  protected override onLanguageChanged(): void {
    this.titleText.setContent(i18next.t('volhell:settings.title'));
    this.backButton.setLabel(i18next.t('volhell:settings.back'));
    this.closeButton.setLabel(i18next.t('volhell:settings.back'));
  }

  protected createScene(): void {
    this.backButton = new Button(i18next.t('volhell:settings.back'), {
      onClick: () => this.goBack(),
    });
    this.closeButton = new IconButton('✕', {
      label: i18next.t('volhell:settings.back'),
      onClick: () => this.goBack(),
    });
    this.closeButton.element.classList.add('vol-settings-close');

    this.stopBackHandler?.();
    this.stopBackHandler = pushBackHandler(() => {
      this.goBack();
      return true;
    });

    this.titleText = new Text(i18next.t('volhell:settings.title'), {
      variant: 'title',
      tag: 'h1',
    });
    this.content = new GameSettingsContent({
      audioSettings,
      videoSettings,
      showVideoSettings: !shouldUseTouchControls(),
      canResizeWindow: hasNativeWindow(),
    });
    this.panel = new Panel({ className: 'settings-panel' })
      .add(this.titleText)
      .add(this.content)
      .add(this.backButton);

    this.scrollSurface = new ScrollView({ direction: 'vertical' });
    this.scrollSurface.element.classList.add('settings-scroll-surface');
    this.scrollSurface.add(this.panel);
    this.ui.mount(this.scrollSurface.element);
    this.ui.mount(this.closeButton.element);
    this.showOnNextFrame(() => this.panel.show());
  }

  private goBack(): void {
    void gameAudio.playSfx('back', { volume: sfxVolumes.back });
    this.scene.start('MainMenu');
  }

  protected override onSceneShutdown(): void {
    this.stopBackHandler?.();
    this.stopBackHandler = null;
    this.closeButton.destroy();
    this.backButton.destroy();
    this.content.destroy();
    this.titleText.destroy();
    this.panel.destroy();
    this.scrollSurface.destroy();
  }
}
