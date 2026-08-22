import { DisposableScope, IconButton } from '@volstudio/core';
import { t } from './dom';

/** Görünür düğme ve F11'i aynı Fullscreen API akışına bağlar. */
export class FullscreenControl {
  readonly element: HTMLButtonElement;
  private readonly button: IconButton;
  private readonly lifecycle = new DisposableScope();

  constructor(private readonly target: HTMLElement = document.documentElement) {
    this.button = new IconButton('⛶', {
      size: 'sm',
      label: t('fullscreen.enter'),
      onClick: () => this.toggle(),
    });
    this.element = this.button.element;
    this.element.dataset.control = 'fullscreen';

    const onKeydown = (rawEvent: Event): void => {
      const event = rawEvent as KeyboardEvent;
      if (event.key !== 'F11') return;
      event.preventDefault();
      void this.toggle();
    };
    const onFullscreenChange = (): void => this.render();
    this.lifecycle.addListener(window, 'keydown', onKeydown);
    this.lifecycle.addListener(document, 'fullscreenchange', onFullscreenChange);
    this.render();
  }

  destroy(): void {
    this.lifecycle.dispose();
    this.button.destroy();
  }

  private async toggle(): Promise<void> {
    if (document.fullscreenElement) {
      await document.exitFullscreen?.();
    } else if (this.target.requestFullscreen) {
      await this.target.requestFullscreen();
    }
    this.render();
  }

  private render(): void {
    const active = document.fullscreenElement !== null;
    this.button.setIcon(active ? '↙' : '⛶');
    this.button.setLabel(t(active ? 'fullscreen.exit' : 'fullscreen.enter'));
    this.element.setAttribute('aria-pressed', String(active));
    this.button.setDisabled(!active && typeof this.target.requestFullscreen !== 'function');
  }
}
