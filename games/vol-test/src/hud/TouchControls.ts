import type { VirtualActionSource, VirtualStickSource } from '@volstudio/core';
import { i18next } from '@volstudio/core/i18n';
import { HoldButton, Icon, IconButton, Joystick, type IconName } from '@volstudio/core/ui';
import type { TestAction } from '@/input/bindings';

type TapAction = 'pause' | 'zoomIn' | 'zoomOut';
type HoldAction = 'boost' | 'brake';

/** Joystick yarıçapı (CSS px): başparmak için rahat, kısa ekranda sığar. */
const JOYSTICK_RADIUS = 60;

/**
 * Dokunmatik kontroller: iki sabit CORE `Joystick` (sol hareket, sağ nişan ve
 * ateş), CORE `HoldButton` (hızlanma ve fren, basılı tutulur) ve CORE `IconButton`
 * (zoom, duraklatma). Joystick'ler `VirtualStickSource`a, düğmeler
 * `VirtualActionSource`a yazar; ikisi dokunmatik sağlayıcıda aynı karede
 * birleşir. Joystick ölü bölgesi 0'dır: ölü bölge sağlayıcıda bir kez uygulanır.
 */
export class TouchControls {
  readonly element: HTMLElement;
  private readonly holds: Array<[HoldButton, HoldAction]>;
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
    const hold = (action: HoldAction, icon: IconName): [HoldButton, HoldAction] => {
      const button = new HoldButton({
        label: i18next.t(`voltest:touch.${action}`),
        icon: new Icon({ name: icon }).element,
        size: 76,
        onPress: () => source.press(action),
        onRelease: () => source.release(action),
      });
      button.element.classList.add(`vt-hud__${action}`);
      button.element.dataset.testid = `touch-${action}`;
      return [button, action];
    };
    this.holds = [hold('boost', 'chevron-up'), hold('brake', 'stop')];

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
      ...this.holds.map(([button]) => button.element),
    );
  }

  refreshLabels(): void {
    for (const [button, action] of this.holds) {
      button.element.setAttribute('aria-label', i18next.t(`voltest:touch.${action}`));
    }
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
    for (const [button] of this.holds) button.destroy();
    for (const joystick of this.joysticks) joystick.destroy();
    for (const [button] of this.buttons) button.destroy();
    this.source.clear();
    this.sticks.clear();
    this.element.remove();
  }
}
