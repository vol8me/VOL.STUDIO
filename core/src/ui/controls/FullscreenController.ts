import { DisposableScope } from '../../lifecycle';

interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

interface FullscreenTarget extends Element {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

export interface FullscreenControllerOptions {
  /** Tam ekrana alınacak kök; verilmezse document.documentElement kullanılır. */
  target?: Element;
  /** Tarayıcı/WebView durumu değiştiğinde çağrılır. */
  onChange?: (active: boolean) => void;
  /** API yoksa veya istek reddedilirse çağrılır; hata UI'a taşınmaz. */
  onError?: (error: unknown) => void;
  /**
   * F11/toggle niyetini native pencere gibi haricî bir sahibin yönetmesine
   * verir. Verildiğinde DOM Fullscreen API doğrudan çağrılmaz.
   */
  onToggleRequest?: () => Promise<void> | void;
}

/**
 * F11 ve programatik tam ekranın ortak CORE sözleşmesi.
 *
 * Tarayıcı F11'i kendi penceresine ayırabilir; bu durumda web uygulaması
 * `keydown` olayı alamaz ve tarayıcının yerel davranışı korunur. Tauri
 * WebView'larında ise olay uygulamaya gelir ve aynı isteği Fullscreen API'ye
 * yönlendirir. WebKit isimleri Android WebView uyumluluğu için yedektir.
 */
export class FullscreenController {
  private readonly scope = new DisposableScope();
  private readonly target: FullscreenTarget;
  private readonly onChange?: (active: boolean) => void;
  private readonly onError?: (error: unknown) => void;
  private readonly onToggleRequest?: () => Promise<void> | void;
  private destroyed = false;

  constructor(options: FullscreenControllerOptions = {}) {
    this.target = (options.target ?? document.documentElement) as FullscreenTarget;
    this.onChange = options.onChange;
    this.onError = options.onError;
    this.onToggleRequest = options.onToggleRequest;

    this.scope.addListener(document, 'fullscreenchange', this.handleFullscreenChange);
    this.scope.addListener(document, 'webkitfullscreenchange', this.handleFullscreenChange);
    // Capture aşaması, showcase/game UI içindeki bir buton veya Phaser input
    // handler'ının F11'i durdurmasından önce uygulamaya erişim verir.
    this.scope.addListener(window, 'keydown', this.handleKeydown, true);
  }

  isFullscreen(): boolean {
    return getFullscreenElement() !== null;
  }

  async toggle(): Promise<void> {
    if (this.destroyed) return;
    if (this.onToggleRequest) {
      try {
        await this.onToggleRequest();
      } catch (error) {
        this.reportError(error);
      }
      return;
    }

    await this.setFullscreen(!this.isFullscreen());
  }

  /** İstenen DOM tam ekran durumunu idempotent biçimde uygular. */
  async setFullscreen(active: boolean): Promise<void> {
    if (this.destroyed || active === this.isFullscreen()) return;
    const doc = document as FullscreenDocument;
    try {
      if (!active) {
        const exit = doc.exitFullscreen?.bind(doc) ?? doc.webkitExitFullscreen?.bind(doc);
        if (!exit) {
          this.reportError(new Error('Fullscreen çıkışı desteklenmiyor.'));
          return;
        }
        await exit();
        return;
      }

      const request =
        this.target.requestFullscreen?.bind(this.target) ??
        this.target.webkitRequestFullscreen?.bind(this.target);
      if (!request) {
        this.reportError(new Error('Fullscreen API desteklenmiyor.'));
        return;
      }
      await request();
    } catch (error) {
      this.reportError(error);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scope.dispose();
  }

  private readonly handleFullscreenChange = (): void => {
    if (!this.destroyed) this.onChange?.(this.isFullscreen());
  };

  private readonly handleKeydown = (event: Event): void => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key !== 'F11' && keyboardEvent.code !== 'F11') return;
    // WebView'da F11'in işletim sistemi/tarayıcı menüsüne kaçmasını önle.
    // Tarayıcı olayı hiç vermiyorsa yerel tarayıcı F11 davranışı bozulmaz.
    keyboardEvent.preventDefault();
    if (!keyboardEvent.repeat) void this.toggle();
  };

  private reportError(error: unknown): void {
    this.onError?.(error);
  }
}

function getFullscreenElement(): Element | null {
  const doc = document as FullscreenDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}
