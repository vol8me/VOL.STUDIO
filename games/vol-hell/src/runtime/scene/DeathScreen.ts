import { Button, Panel, Text, i18next } from '@volstudio/core';

/**
 * Oyuncu ölünce gösterilen ekran — DOM tabanlı overlay.
 * Yeniden başla ve ana menü butonları içerir.
 * Phaser sahnesini durdurur, oyuncu bir seçim yapana kadar bekler.
 */
export class DeathScreen {
  private readonly panel: Panel;
  private readonly overlay: HTMLDivElement;
  private readonly restartButton: Button;
  private readonly mainMenuButton: Button;
  private readonly titleText: Text;
  private readonly onLanguageChanged = (): void => {
    this.titleText.setContent(i18next.t('volhell:death.title'));
    this.restartButton.setLabel(i18next.t('volhell:death.restart'));
    this.mainMenuButton.setLabel(i18next.t('volhell:death.mainMenu'));
  };

  constructor(
    parent: HTMLElement,
    private readonly callbacks: {
      onRestart: () => void;
      onMainMenu: () => void;
    },
  ) {
    this.overlay = document.createElement('div');
    this.overlay.className = 'vol-death-overlay';

    this.titleText = new Text(i18next.t('volhell:death.title'), { variant: 'title', tag: 'h1' });

    this.restartButton = new Button(i18next.t('volhell:death.restart'), {
      variant: 'primary',
      onClick: () => this.callbacks.onRestart(),
    });
    this.mainMenuButton = new Button(i18next.t('volhell:death.mainMenu'), {
      variant: 'danger',
      onClick: () => this.callbacks.onMainMenu(),
    });

    this.panel = new Panel({ className: 'death-panel' })
      .add(this.titleText)
      .add(this.restartButton)
      .add(this.mainMenuButton);

    this.overlay.appendChild(this.panel.element);
    parent.appendChild(this.overlay);

    i18next.on('languageChanged', this.onLanguageChanged);
  }

  show(): void {
    this.overlay.classList.add('vol-death-overlay--visible');
    this.panel.show();
  }

  isVisible(): boolean {
    return this.panel.isVisible();
  }

  destroy(): void {
    i18next.off('languageChanged', this.onLanguageChanged);
    this.restartButton.destroy();
    this.mainMenuButton.destroy();
    this.panel.destroy();
    this.overlay.remove();
  }
}
