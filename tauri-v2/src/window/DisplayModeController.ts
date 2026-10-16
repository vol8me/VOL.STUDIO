import { FullscreenController } from '@volstudio/core/platform';
import { DisposableScope } from '@volstudio/core/lifecycle';
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
  /** Pencereli kipte uygulanacak içerik boyutu; verilmezse ya da `undefined` dönerse boyuta dokunulmaz. */
  readonly getWindowedSize?: () => { readonly width: number; readonly height: number } | undefined;
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
  private applyFailure: { error: unknown } | null = null;
  private preferenceFailure: { error: unknown } | null = null;
  private readonly preferenceWrites = new Set<Promise<void>>();
  private preferenceGeneration = 0;
  private applyingFullscreen = false;
  private readonly scope = new DisposableScope();
  /** Pencereye en son uygulanan boyut: tercih deposundaki başka bir değişim pencereyi yeniden ortalamaz. */
  private appliedSize: string | null = null;
  private startup: Promise<void> | null = null;
  private destroyed = false;

  constructor(private readonly options: DisplayModeControllerOptions) {
    this.window = options.windowAdapter ?? new TauriWindowAdapter();
    this.onError =
      options.onError ??
      ((error) => console.warn('[DisplayModeController] Görüntü kipi uygulanamadı:', error));
    const native = this.window.isAvailable();
    this.fullscreen = this.scope.addDestroyable(
      new FullscreenController({
        target: options.target,
        onToggleRequest: native ? () => this.toggleNative() : undefined,
        onChange: native ? undefined : (active) => this.syncMode(active),
        onError: (error) => this.recordApplyError(error),
      }),
    );
  }

  hasNativeWindow(): boolean {
    return this.window.isAvailable();
  }

  start(): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    return (this.startup ??= this.startInternal().catch((error: unknown) => {
      this.destroy();
      throw error;
    }));
  }

  private async startInternal(): Promise<void> {
    this.scope.addSubscription(this.options.subscribe(() => void this.apply()));
    await this.apply();
    if (this.destroyed || !this.window.isAvailable()) return;

    try {
      const stop = await this.window.onFullscreenChange((active) => {
        this.syncMode(active);
      });
      this.scope.addSubscription(stop);
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
    let pending: Promise<void>;
    do {
      pending = this.applyQueue;
      await Promise.all([pending, ...this.preferenceWrites]);
    } while (pending !== this.applyQueue || this.preferenceWrites.size > 0);
    if (this.preferenceFailure) throw this.preferenceFailure.error;
    if (this.applyFailure) throw this.applyFailure.error;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.applyGeneration++;
    this.scope.dispose();
  }

  private apply(): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    const generation = ++this.applyGeneration;
    const run = this.applyQueue
      .then(() => this.applyLatest(generation))
      .catch((error: unknown) => this.recordApplyError(error));
    this.applyQueue = run;
    return run;
  }

  private async applyLatest(generation: number): Promise<void> {
    if (this.isStale(generation)) return;
    this.applyFailure = null;
    const wantsFullscreen = this.options.getMode() === 'fullscreen';

    if (!this.window.isAvailable()) {
      this.applyingFullscreen = true;
      try {
        await this.fullscreen.setFullscreen(wantsFullscreen);
      } finally {
        this.applyingFullscreen = false;
      }
      return;
    }

    const isFullscreen = await this.window.isFullscreen();
    if (this.isStale(generation)) return;
    if (isFullscreen !== wantsFullscreen) {
      this.applyingFullscreen = true;
      try {
        await this.window.setFullscreen(wantsFullscreen);
      } finally {
        this.applyingFullscreen = false;
      }
      // Tam ekrandan çıkış ve girişte pencere boyutu sistemin elindedir: pencereliye dönünce yeniden uygulanır.
      this.appliedSize = null;
    }
    if (this.isStale(generation) || wantsFullscreen) return;

    const size = this.options.getWindowedSize?.();
    if (!size) {
      this.appliedSize = null;
      return;
    }
    const key = `${size.width}x${size.height}`;
    if (key === this.appliedSize) return;
    await this.window.setResolution(size.width, size.height);
    this.appliedSize = key;
  }

  private recordApplyError(error: unknown): void {
    this.applyFailure = { error };
    try {
      this.onError(error);
    } catch (reportError) {
      console.warn('[DisplayModeController] Görüntü kipi tanısı başarısız:', error, reportError);
    }
  }

  private syncMode(active: boolean): void {
    // Kendi gecikmeli pencere olayımız daha yeni kullanıcı niyetini kalıcı tercihten silemez.
    if (this.destroyed || this.applyingFullscreen) return;
    const pending = this.persistMode(toMode(active))
      .catch((error: unknown) => {
        try {
          this.onError(error);
        } catch {
          // Tanı hatası kuyruk sözleşmesini bozamaz.
        }
      })
      .finally(() => this.preferenceWrites.delete(pending));
    this.preferenceWrites.add(pending);
  }

  private async persistMode(mode: DisplayMode): Promise<void> {
    const generation = ++this.preferenceGeneration;
    try {
      await this.options.setMode(mode);
      if (generation === this.preferenceGeneration) this.preferenceFailure = null;
    } catch (error) {
      if (generation === this.preferenceGeneration) this.preferenceFailure = { error };
      throw error;
    }
  }

  private isStale(generation: number): boolean {
    return this.destroyed || generation !== this.applyGeneration;
  }

  private async toggleNative(): Promise<void> {
    if (this.destroyed) return;
    const generation = ++this.applyGeneration;
    const run = this.applyQueue
      .then(async () => {
        if (this.isStale(generation)) return;
        const active = await this.window.isFullscreen();
        if (this.isStale(generation)) return;
        await this.persistMode(toMode(!active));
        if (!this.destroyed) void this.apply();
      })
      .catch((error: unknown) => this.recordApplyError(error));
    this.applyQueue = run;
    // setMode aboneliği aynı kuyruğa yeni uygulama ekleyebilir; kuyruğun
    // içinden flush beklemek uygulamayı kendi kendisine kilitler.
    await run;
    await this.flush();
  }
}

function toMode(fullscreen: boolean): DisplayMode {
  return fullscreen ? 'fullscreen' : 'windowed';
}
