import { FullscreenController } from '@volstudio/core/ui';
import { TauriWindowAdapter } from './TauriWindowAdapter';

export type DisplayMode = 'windowed' | 'fullscreen';

/** Uygulayıcının native pencereden istediği yüzey; testte sahtesi verilir. */
export type DisplayWindow = Pick<
  TauriWindowAdapter,
  'isAvailable' | 'isFullscreen' | 'setFullscreen' | 'setResolution' | 'onFullscreenChange'
>;

export interface DisplayModeControllerOptions {
  /** Kalıcı tercih; her uygulamada GÜNCEL değer okunur. */
  readonly getMode: () => DisplayMode;
  /** F11'den, pencere yöneticisinden ya da DOM tam ekranından gelen değişimi tercihe yazar. */
  readonly setMode: (mode: DisplayMode) => Promise<void> | void;
  /** Tercih değişince çağrılacak dinleyiciyi bağlar; aboneliği kaldıran fonksiyonu döner. */
  readonly subscribe: (listener: () => void) => () => void;
  /** Pencereli kipte uygulanacak içerik boyutu; verilmezse boyuta dokunulmaz. */
  readonly getWindowedSize?: () => { readonly width: number; readonly height: number };
  /** Native pencere yoksa DOM tam ekranına alınacak kök. */
  readonly target?: Element;
  readonly windowAdapter?: DisplayWindow;
  readonly onError?: (error: unknown) => void;
}

/**
 * Pencere / tam ekran tercihini uygular: native pencere varsa Tauri'ye, yoksa DOM
 * tam ekranına. F11 aynı yoldan geçer; dışarıdan gelen değişim tercihe geri
 * yazılır, böylece ayar ekranı her zaman gerçeği gösterir.
 *
 * Uygulamalar sıraya girer ve yalnız EN SON istek pencereye dokunur: art arda iki
 * değişimde eskisinin geç dönen cevabı yenisini ezmez. Tercihin nerede saklandığı
 * çağıranın işidir.
 */
export class DisplayModeController {
  private readonly window: DisplayWindow;
  private readonly fullscreen: FullscreenController;
  private readonly onError: (error: unknown) => void;
  private applyQueue: Promise<void> = Promise.resolve();
  private applyGeneration = 0;
  private stopPreference: (() => void) | null = null;
  private stopNativeWatch: (() => void) | null = null;
  private started = false;
  private destroyed = false;

  constructor(private readonly options: DisplayModeControllerOptions) {
    this.window = options.windowAdapter ?? new TauriWindowAdapter();
    this.onError =
      options.onError ??
      ((error) => console.warn('[DisplayModeController] Görüntü kipi uygulanamadı:', error));
    const native = this.window.isAvailable();
    this.fullscreen = new FullscreenController({
      target: options.target,
      onToggleRequest: native ? () => this.toggleNative() : undefined,
      onChange: native ? undefined : (active) => void options.setMode(toMode(active)),
      onError: this.onError,
    });
  }

  hasNativeWindow(): boolean {
    return this.window.isAvailable();
  }

  async start(): Promise<void> {
    if (this.started || this.destroyed) return;
    this.started = true;
    this.stopPreference = this.options.subscribe(() => void this.apply());
    await this.apply();
    if (this.destroyed || !this.window.isAvailable()) return;

    try {
      const stop = await this.window.onFullscreenChange((active) => {
        if (!this.destroyed) void this.options.setMode(toMode(active));
      });
      if (this.destroyed) stop();
      else this.stopNativeWatch = stop;
    } catch (error) {
      this.onError(error);
    }
  }

  /** F11 ile aynı niyet: gerçek durumu tersine çevirir. */
  toggle(): Promise<void> {
    return this.fullscreen.toggle();
  }

  /** Bekleyen uygulamaları tüketir. */
  async flush(): Promise<void> {
    await this.applyQueue;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.applyGeneration++;
    this.stopNativeWatch?.();
    this.stopNativeWatch = null;
    this.stopPreference?.();
    this.stopPreference = null;
    this.fullscreen.destroy();
  }

  private apply(): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    const generation = ++this.applyGeneration;
    const run = this.applyQueue
      .then(() => this.applyLatest(generation))
      .catch((error: unknown) => this.onError(error));
    this.applyQueue = run;
    return run;
  }

  private async applyLatest(generation: number): Promise<void> {
    if (this.isStale(generation)) return;
    const wantsFullscreen = this.options.getMode() === 'fullscreen';

    if (!this.window.isAvailable()) {
      await this.fullscreen.setFullscreen(wantsFullscreen);
      return;
    }

    const isFullscreen = await this.window.isFullscreen();
    if (this.isStale(generation)) return;
    if (isFullscreen !== wantsFullscreen) {
      await this.window.setFullscreen(wantsFullscreen);
    }
    if (this.isStale(generation) || wantsFullscreen) return;

    const size = this.options.getWindowedSize?.();
    if (size) await this.window.setResolution(size.width, size.height);
  }

  private isStale(generation: number): boolean {
    return this.destroyed || generation !== this.applyGeneration;
  }

  private async toggleNative(): Promise<void> {
    if (this.destroyed) return;
    const active = await this.window.isFullscreen();
    await this.options.setMode(toMode(!active));
    await this.flush();
  }
}

function toMode(fullscreen: boolean): DisplayMode {
  return fullscreen ? 'fullscreen' : 'windowed';
}
