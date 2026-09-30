import type { VirtualActionSource } from '@volstudio/core';
import { i18next } from '@volstudio/core/i18n';
import { HoldButton, Icon, IconButton } from '@volstudio/core/ui';
import type { TestAction } from '@/input/bindings';

type TapAction = 'pause' | 'zoomIn' | 'zoomOut';

/**
 * Dokunmatik düğmeler: CORE `HoldButton` (hızlanma, basılı tutulur) ve CORE
 * `IconButton` (zoom, duraklatma). Basışlar `VirtualActionSource`a yazılır;
 * dokunmatik sağlayıcının eylemleriyle aynı karede birleşir, tek karelik
 * dokunuş mandalla korunur. Çubuklar Phaser tarafında CORE `TouchController`
 * tarafından çizilir.
 */
export class TouchControls {
  readonly element: HTMLElement;
  private readonly boost: HoldButton;
  private readonly buttons: Array<[IconButton, TapAction]> = [];

  constructor(private readonly source: VirtualActionSource<TestAction>) {
    this.element = document.createElement('div');
    this.element.className = 'vt-hud__touch';
    this.element.dataset.testid = 'touch-controls';
    this.boost = new HoldButton({
      label: i18next.t('voltest:touch.boost'),
      icon: new Icon({ name: 'chevron-up' }).element,
      size: 76,
      onPress: () => source.press('boost'),
      onRelease: () => source.release('boost'),
    });
    this.boost.element.classList.add('vt-hud__boost');
    this.boost.element.dataset.testid = 'touch-boost';

    const tap = (action: TapAction, icon: string | Node, className: string): IconButton => {
      const button = new IconButton(icon, {
        label: i18next.t(`voltest:touch.${action}`),
        size: 'lg',
        onClick: () => {
          source.press(action);
          source.release(action);
        },
      });
      button.element.classList.add(className);
      button.element.dataset.testid = `touch-${action}`;
      this.buttons.push([button, action]);
      return button;
    };
    const pause = tap('pause', new Icon({ name: 'pause' }).element, 'vt-hud__pause');
    const zoomIn = tap('zoomIn', '+', 'vt-hud__zoom-in');
    const zoomOut = tap('zoomOut', '−', 'vt-hud__zoom-out');
    this.element.append(pause.element, zoomIn.element, zoomOut.element, this.boost.element);
  }

  refreshLabels(): void {
    this.boost.element.setAttribute('aria-label', i18next.t('voltest:touch.boost'));
    for (const [button, action] of this.buttons) {
      button.setLabel(i18next.t(`voltest:touch.${action}`));
    }
  }

  setVisible(visible: boolean): void {
    this.element.hidden = !visible;
    if (!visible) this.source.clear();
  }

  destroy(): void {
    this.boost.destroy();
    for (const [button] of this.buttons) button.destroy();
    this.source.clear();
    this.element.remove();
  }
}
