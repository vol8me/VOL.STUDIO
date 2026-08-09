import { DirectionButton } from './DirectionButton';
import { i18next } from '../../systems/I18n';

export type DPadDirection = 'up' | 'down' | 'left' | 'right';

export interface DPadOptions {
  /** Bir yön basıldığında (ilk temas anında, tekrar tekrar değil) çağrılır. */
  onDirectionDown?: (direction: DPadDirection) => void;
  /** Bir yön bırakıldığında çağrılır. */
  onDirectionUp?: (direction: DPadDirection) => void;
  size?: number;
}

const DIRECTIONS: DPadDirection[] = ['up', 'down', 'left', 'right'];
const DIRECTION_I18N_KEYS = {
  up: 'core:dpad.up',
  down: 'core:dpad.down',
  left: 'core:dpad.left',
  right: 'core:dpad.right',
} as const;

/**
 * Klasik 4 yönlü retro/platformer yön kontrolcüsü — dört bağımsız
 * `DirectionButton`'ı sabit bir haç düzeninde bir araya getiren kompozisyon.
 * Joystick'in analog modelinden farkı: DPad tamamen dijitaldir (her yön
 * basılı/bırakılmış). Çoklu dokunmayı destekler: iki bitişik yöne aynı anda
 * basılırsa çapraz hareket, her ikisi için ayrı `onDirectionDown` tetiklenerek
 * doğal ortaya çıkar.
 */
export class DPad {
  readonly element: HTMLDivElement;
  private readonly buttons = new Map<DPadDirection, DirectionButton>();
  private readonly activeDirections = new Set<DPadDirection>();
  private readonly onDirectionDownHandler?: (direction: DPadDirection) => void;
  private readonly onDirectionUpHandler?: (direction: DPadDirection) => void;
  private readonly onLanguageChanged = (): void => {
    for (const [direction, button] of this.buttons) {
      button.setLabel(i18next.t(DIRECTION_I18N_KEYS[direction]));
    }
  };

  constructor(options: DPadOptions = {}) {
    this.onDirectionDownHandler = options.onDirectionDown;
    this.onDirectionUpHandler = options.onDirectionUp;

    this.element = document.createElement('div');
    this.element.className = 'vol-dpad';
    if (options.size) {
      this.element.style.setProperty('--vol-dpad-size', `${options.size}px`);
    }

    for (const direction of DIRECTIONS) {
      const button = new DirectionButton({
        arrow: direction,
        label: i18next.t(DIRECTION_I18N_KEYS[direction]),
        onPress: () => this.setActive(direction, true),
        onRelease: () => this.setActive(direction, false),
      });
      button.element.classList.add(`vol-dpad__slot--${direction}`);
      this.buttons.set(direction, button);
      this.element.appendChild(button.element);
    }

    i18next.on('languageChanged', this.onLanguageChanged);
  }

  /** Bir yönün şu an basılı olup olmadığını döner. */
  isPressed(direction: DPadDirection): boolean {
    return this.activeDirections.has(direction);
  }

  /** Şu an basılı olan tüm yönleri döner. */
  getActiveDirections(): DPadDirection[] {
    return [...this.activeDirections];
  }

  destroy(): void {
    i18next.off('languageChanged', this.onLanguageChanged);
    for (const button of this.buttons.values()) button.destroy();
    this.element.remove();
  }

  private setActive(direction: DPadDirection, active: boolean): void {
    if (active) {
      this.activeDirections.add(direction);
      this.onDirectionDownHandler?.(direction);
    } else {
      this.activeDirections.delete(direction);
      this.onDirectionUpHandler?.(direction);
    }
  }
}
