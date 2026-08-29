import { FullscreenController } from '@volstudio/core';
import { TauriWindowAdapter } from '@volstudio/tauri-v2';
import type { VideoSettings, VideoSettingsData } from './VideoSettings';

export interface VideoSettingsControllerOptions {
  target?: Element;
  windowAdapter?: TauriWindowAdapter;
  onError?: (error: unknown) => void;
}

/**
 * Kalıcı görüntü tercihini DOM fullscreen, Tauri penceresi ve Phaser resize
 * yüzeyine uygular. Uygulama ömründe TEK örnek yaşar; F11 listener'ı sahne
 * geçişlerinde çoğalmaz.
 */
export class VideoSettingsController {
  private readonly windowAdapter: TauriWindowAdapter;
  private readonly fullscreen: FullscreenController;
  private readonly onError: (error: unknown) => void;
  private stopSettings: (() => void) | null = null;
  private stopNativeWatch: (() => void) | null = null;
  private applyQueue: Promise<void> = Promise.resolve();
  private applyGeneration = 0;
  private lastGraphicsQuality: string | null = null;
  private started = false;
  private destroyed = false;

  constructor(
    private readonly settings: VideoSettings,
    options: VideoSettingsControllerOptions = {},
  ) {
    this.windowAdapter = options.windowAdapter ?? new TauriWindowAdapter();
    this.onError =
      options.onError ??
      ((error) => console.warn('[VideoSettingsController] Görüntü ayarı uygulanamadı:', error));
    this.fullscreen = new FullscreenController({
      target: options.target,
      onToggleRequest: this.windowAdapter.isAvailable()
        ? () => this.toggleNativeFullscreen()
        : undefined,
      onChange: this.windowAdapter.isAvailable()
        ? undefined
        : (active) => void this.settings.setDisplayMode(active ? 'fullscreen' : 'windowed'),
      onError: this.onError,
    });
  }

  async start(): Promise<void> {
    if (this.started || this.destroyed) return;
    this.started = true;
    this.stopSettings = this.settings.onChange((data) => {
      void this.requestApply(data);
    });

    await this.requestApply(this.settings.getData());
    if (this.destroyed || !this.windowAdapter.isAvailable()) return;

    try {
      const stop = await this.windowAdapter.onFullscreenChange((active) => {
        if (!this.destroyed) {
          void this.settings.setDisplayMode(active ? 'fullscreen' : 'windowed');
        }
      });
      if (this.destroyed) stop();
      else this.stopNativeWatch = stop;
    } catch (error) {
      this.onError(error);
    }
  }

  /** Test/release kapanışı için bekleyen native uygulamaları tüketir. */
  async flush(): Promise<void> {
    await this.applyQueue;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.applyGeneration++;
    this.stopNativeWatch?.();
    this.stopNativeWatch = null;
    this.stopSettings?.();
    this.stopSettings = null;
    this.fullscreen.destroy();
  }

  private requestApply(data: VideoSettingsData): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    this.applyGraphics(data);
    const generation = ++this.applyGeneration;
    const apply = this.applyQueue
      .then(() => this.applyWindow(data, generation))
      .catch((error: unknown) => this.onError(error));
    this.applyQueue = apply;
    return apply;
  }

  private applyGraphics(data: VideoSettingsData): void {
    if (this.lastGraphicsQuality === data.graphicsQuality) return;
    this.lastGraphicsQuality = data.graphicsQuality;
    document.documentElement.dataset.volGraphicsQuality = data.graphicsQuality;
    // ViewportManager maxDpr sağlayıcısını yeniden okur; EffectManager ise
    // particleScale'i her patlamada canlı okur.
    window.dispatchEvent(new Event('resize'));
  }

  private async applyWindow(data: VideoSettingsData, generation: number): Promise<void> {
    if (this.destroyed || generation !== this.applyGeneration) return;
    const wantsFullscreen = data.displayMode === 'fullscreen';

    if (!this.windowAdapter.isAvailable()) {
      await this.fullscreen.setFullscreen(wantsFullscreen);
      return;
    }

    const isFullscreen = await this.windowAdapter.isFullscreen();
    if (this.destroyed || generation !== this.applyGeneration) return;
    if (isFullscreen !== wantsFullscreen) {
      await this.windowAdapter.setFullscreen(wantsFullscreen);
    }
    if (this.destroyed || generation !== this.applyGeneration || wantsFullscreen) return;

    const resolution = this.settings.getResolution();
    await this.windowAdapter.setResolution(resolution.width, resolution.height);
  }

  private async toggleNativeFullscreen(): Promise<void> {
    if (this.destroyed) return;
    const active = await this.windowAdapter.isFullscreen();
    await this.settings.setDisplayMode(active ? 'windowed' : 'fullscreen');
    await this.flush();
  }
}
