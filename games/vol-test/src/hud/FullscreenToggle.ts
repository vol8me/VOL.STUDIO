import { i18next } from '@volstudio/core/i18n';
import { FullscreenController } from '@volstudio/core/platform';
import { Icon, IconButton } from '@volstudio/core/ui';

/**
 * Tarayıcıda tam ekran düğmesi: CORE `IconButton` ve `FullscreenController`.
 * Native kabuk pencere kipini kendisi yönettiği için orada kurulmaz.
 */
export class FullscreenToggle {
  readonly element: HTMLElement;
  private readonly controller: FullscreenController | null;
  private readonly button: IconButton;

  constructor(toggle?: () => unknown) {
    this.controller = toggle ? null : new FullscreenController();
    this.button = new IconButton(new Icon({ name: 'fullscreen' }).element, {
      label: i18next.t('voltest:hud.fullscreen'),
      onClick: () => {
        if (toggle) toggle();
        else void this.controller?.toggle();
      },
    });
    this.element = this.button.element;
    this.element.classList.add('vt-hud__fullscreen');
  }

  refreshLabels(): void {
    this.button.setLabel(i18next.t('voltest:hud.fullscreen'));
  }

  destroy(): void {
    this.button.destroy();
    this.controller?.destroy();
  }
}
