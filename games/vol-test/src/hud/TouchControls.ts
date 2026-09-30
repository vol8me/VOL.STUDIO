import type { VirtualActionSource, VirtualStickSource } from '@volstudio/core';
import { i18next } from '@volstudio/core/i18n';
import { HoldButton, Icon, IconButton, Joystick } from '@volstudio/core/ui';
import type { TestAction } from '@/input/bindings';

type TapAction = 'pause' | 'zoomIn' | 'zoomOut';

/** Joystick yarıçapı (CSS px): başparmak için rahat, kısa ekranda sığar. */
const JOYSTICK_RADIUS = 60;

/**
 * Dokunmatik kontroller: iki sabit CORE `Joystick` (sol hareket, sağ nişan ve
 * ateş), CORE `HoldButton` (hızlanma, basılı tutulur) ve CORE `IconButton`
 * (zoom, duraklatma). Joystick'ler `VirtualStickSource`a, düğmeler
 * `VirtualActionSource`a yazar; ikisi dokunmatik sağlayıcıda aynı karede
 * birleşir. Joystick ölü bölgesi 0'dır: ölü bölge sağlayıcıda bir kez uygulanır.
 */
export class TouchControls {
  readonly element: HTMLElement;
  private readonly boost: HoldButton;
  private readonly joysticks: Joystick[];
  private readonly buttons: Array<[IconButton, TapAction]> = [];

  constructor(
    private readonly source: VirtualActionSource<TestAction>,
    private readonly sticks: VirtualStickSource,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'vt-hud__touch';
    this.element.dataset.testid = 'touch-controls';
    this.joysticks = (['move', 'aim'] as const).map((stick) => {
      const joystick = new Joystick({
        radius: JOYSTICK_RADIUS,
        deadZone: 0,
        onMove: (vector) => sticks.set(stick, vector.x, vector.y),
        onRelease: () => sticks.release(stick),
      });
      joystick.element.classList.add(`vt-hud__stick-${stick}`);
      joystick.element.dataset.testid = `stick-${stick}`;
      return joystick;
    });
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
    this.element.append(
      ...this.joysticks.map((joystick) => joystick.element),
      pause.element,
      zoomIn.element,
      zoomOut.element,
      this.boost.element,
    );
  }

  refreshLabels(): void {
    this.boost.element.setAttribute('aria-label', i18next.t('voltest:touch.boost'));
    for (const [button, action] of this.buttons) {
      button.setLabel(i18next.t(`voltest:touch.${action}`));
    }
  }

  setVisible(visible: boolean): void {
    this.element.hidden = !visible;
    if (!visible) {
      this.source.clear();
      this.sticks.clear();
    }
  }

  destroy(): void {
    this.boost.destroy();
    for (const joystick of this.joysticks) joystick.destroy();
    for (const [button] of this.buttons) button.destroy();
    this.source.clear();
    this.sticks.clear();
    this.element.remove();
  }
}
