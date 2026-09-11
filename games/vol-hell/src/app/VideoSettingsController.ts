import { DisplayModeController, type DisplayWindow } from '@volstudio/tauri-v2';
import type { VideoSettings, VideoSettingsData } from './VideoSettings';

export interface VideoSettingsControllerOptions {
  target?: Element;
  windowAdapter?: DisplayWindow;
  onError?: (error: unknown) => void;
}

/**
 * Kalıcı görüntü tercihini uygular: pencere / tam ekran kipi ve pencere boyutu
 * ortak `DisplayModeController`ın, grafik kalitesi Phaser resize yüzeyinin
 * işidir. Uygulama ömründe TEK örnek yaşar; F11 listener'ı sahne geçişlerinde
 * çoğalmaz.
 */
export class VideoSettingsController {
  private readonly displayMode: DisplayModeController;
  private stopSettings: (() => void) | null = null;
  private lastGraphicsQuality: string | null = null;
  private started = false;
  private destroyed = false;

  constructor(
    private readonly settings: VideoSettings,
    options: VideoSettingsControllerOptions = {},
  ) {
    this.displayMode = new DisplayModeController({
      getMode: () => settings.getDisplayMode(),
      setMode: (mode) => settings.setDisplayMode(mode),
      subscribe: (listener) => settings.onChange(() => listener()),
      getWindowedSize: () => settings.getResolution(),
      target: options.target,
      windowAdapter: options.windowAdapter,
      onError:
        options.onError ??
        ((error) => console.warn('[VideoSettingsController] Görüntü ayarı uygulanamadı:', error)),
    });
  }

  async start(): Promise<void> {
    if (this.started || this.destroyed) return;
    this.started = true;
    this.stopSettings = this.settings.onChange((data) => this.applyGraphics(data));
    this.applyGraphics(this.settings.getData());
    await this.displayMode.start();
  }

  /** Test/release kapanışı için bekleyen native uygulamaları tüketir. */
  flush(): Promise<void> {
    return this.displayMode.flush();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopSettings?.();
    this.stopSettings = null;
    this.displayMode.destroy();
  }

  private applyGraphics(data: VideoSettingsData): void {
    if (this.lastGraphicsQuality === data.graphicsQuality) return;
    this.lastGraphicsQuality = data.graphicsQuality;
    // DOM yansıması (`data-vol-graphics`) CORE `GraphicsQuality` tarafından
    // `VideoSettings` içinde yazılır; burada yalnız RENDER yüzeyi tetiklenir.
    //
    // Yeniden boyutlandırma olayı, `ViewportManager`ın `maxDpr` ve
    // `renderScale` sağlayıcılarını yeniden okumasını sağlar: canvas backing
    // store'u ve kamera yakınlaştırması yeni kademeye göre kurulur. Partikül
    // sayısı/ömrü, iz ve kenar çizgisi anahtarları ise ilgili sistemler
    // tarafından canlı okunur, ek tetikleme gerektirmez.
    window.dispatchEvent(new Event('resize'));
  }
}
