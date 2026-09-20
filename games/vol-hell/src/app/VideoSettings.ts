import { PersistedObservableState, type SaveManager } from '@volstudio/core';
import { reportPersistenceFailure } from '@/app/settingsPersistence';
import { GraphicsQuality } from '@volstudio/core';
import {
  GRAPHICS_QUALITY_ATTRIBUTE,
  getResolutionPreset,
  videoConfig,
  type DisplayMode,
  type GraphicsQualityLevel,
  type GraphicsQualityProfile,
  type ResolutionPreset,
} from '@/config/video';

export interface VideoSettingsData {
  displayMode: DisplayMode;
  resolution: string;
  graphicsQuality: GraphicsQualityLevel;
}

/**
 * Artık var olmayan kademelerin karşılığı.
 *
 * Kalite üç kademeden ikiye indi. Kayıtlı `'balanced'` değerini tanımayıp
 * varsayılana düşmek de mümkündü, ama o zaman orta kademeyi seçmiş bir
 * oyuncunun tercihi sessizce YÜKSEĞE atlar; dengeli seçen kişi ucuz tarafı
 * istemiştir, düşüğe götürmek niyete daha yakındır.
 */
const LEGACY_QUALITY_ALIASES: Readonly<Record<string, GraphicsQualityLevel>> = {
  balanced: 'low',
  medium: 'low',
  ultra: 'high',
};

const STORAGE_KEY = 'vol-hell:video-settings';

function isDisplayMode(value: unknown): value is DisplayMode {
  return value === 'windowed' || value === 'fullscreen';
}

function toGraphicsQuality(value: unknown): GraphicsQualityLevel | undefined {
  if (typeof value !== 'string') return undefined;
  if (Object.prototype.hasOwnProperty.call(videoConfig.quality, value)) {
    return value as GraphicsQualityLevel;
  }
  return Object.prototype.hasOwnProperty.call(LEGACY_QUALITY_ALIASES, value)
    ? LEGACY_QUALITY_ALIASES[value]
    : undefined;
}

function mergeWithDefaults(stored: unknown): VideoSettingsData {
  const raw =
    typeof stored === 'object' && stored !== null
      ? (stored as Partial<Record<keyof VideoSettingsData, unknown>>)
      : {};
  const resolution =
    typeof raw.resolution === 'string' && getResolutionPreset(raw.resolution)
      ? raw.resolution
      : videoConfig.defaultResolution;

  return {
    displayMode: isDisplayMode(raw.displayMode) ? raw.displayMode : videoConfig.defaultDisplayMode,
    resolution,
    graphicsQuality: toGraphicsQuality(raw.graphicsQuality) ?? videoConfig.defaultGraphicsQuality,
  };
}

/** Kalıcı masaüstü görüntü tercihlerinin tek doğruluk kaynağı. */
export class VideoSettings {
  /**
   * Kalite kademesinin CANLI kaydı — CORE mekanizması.
   *
   * Profil okuması (`getGraphicsProfile()`) her karede yapılabilir ve DOM
   * yansıması (`data-vol-graphics`) CSS'in pahalı efektleri kapatmasını
   * sağlar. Kalıcılık bu sınıfın, kademe mekanizması CORE'un işidir.
   */
  private readonly quality: GraphicsQuality<GraphicsQualityLevel, GraphicsQualityProfile>;
  private readonly persisted: PersistedObservableState<VideoSettingsData>;
  private readonly listeners = new Set<(data: VideoSettingsData) => void>();
  private disposed = false;

  constructor(saveManager: SaveManager) {
    const initial = mergeWithDefaults(undefined);
    this.quality = new GraphicsQuality<GraphicsQualityLevel, GraphicsQualityProfile>({
      levels: videoConfig.quality,
      initial: initial.graphicsQuality,
      reflect:
        typeof document === 'undefined'
          ? undefined
          : { element: document.documentElement, attribute: GRAPHICS_QUALITY_ATTRIBUTE },
    });
    this.persisted = new PersistedObservableState<VideoSettingsData>({
      store: saveManager,
      key: STORAGE_KEY,
      initial,
      parse: mergeWithDefaults,
      clone: (data) => ({ ...data }),
      equals: (left, right) =>
        left.displayMode === right.displayMode &&
        left.resolution === right.resolution &&
        left.graphicsQuality === right.graphicsQuality,
      onError: (error, operation) => {
        if (operation === 'save') reportPersistenceFailure(STORAGE_KEY, error);
      },
      onListenerError: (error) => {
        console.warn('[VideoSettings] Ayar dinleyicisi hata verdi:', error);
      },
    });
    this.persisted.subscribe((data) => {
      this.quality.setLevel(data.graphicsQuality);
      this.notify(data);
    });
  }

  /** Kalite kademeleri — UI seçim listesi bundan türetilir. */
  getGraphicsLevels(): readonly GraphicsQualityLevel[] {
    return this.quality.getLevels();
  }

  /** Geçerli kademenin bütün knob'ları. Her karede güvenle okunur. */
  getGraphicsProfile(): GraphicsQualityProfile {
    return this.quality.getProfile();
  }

  async load(): Promise<void> {
    await this.persisted.load();
  }

  getData(): VideoSettingsData {
    return this.persisted.get();
  }

  getDisplayMode(): DisplayMode {
    return this.getData().displayMode;
  }

  getResolutionId(): string {
    return this.getData().resolution;
  }

  getResolution(): ResolutionPreset {
    return (
      getResolutionPreset(this.getData().resolution) ??
      // Config sözleşmesi bozulursa bile runtime'da undefined pencere boyutu
      // taşımamak için varsayılanın ilk preset yedeği vardır.
      getResolutionPreset(videoConfig.defaultResolution) ??
      videoConfig.resolutions[0]
    );
  }

  getGraphicsQuality(): GraphicsQualityLevel {
    return this.getData().graphicsQuality;
  }

  getMaxDpr(): number {
    return this.getGraphicsProfile().maxDpr;
  }

  getRenderScale(): number {
    return this.getGraphicsProfile().renderScale;
  }

  getParticleScale(): number {
    return this.getGraphicsProfile().particleScale;
  }

  getParticleLifespanScale(): number {
    return this.getGraphicsProfile().particleLifespanScale;
  }

  areBulletTrailsEnabled(): boolean {
    return this.getGraphicsProfile().bulletTrails;
  }

  areEntityStrokesEnabled(): boolean {
    return this.getGraphicsProfile().entityStrokes;
  }

  areGroundIndicatorsEnabled(): boolean {
    return this.getGraphicsProfile().groundIndicators;
  }

  setDisplayMode(displayMode: DisplayMode): Promise<void> {
    if (!isDisplayMode(displayMode)) return Promise.resolve();
    return this.update({ displayMode });
  }

  setResolution(resolution: string): Promise<void> {
    if (!getResolutionPreset(resolution)) return Promise.resolve();
    return this.update({ resolution });
  }

  setGraphicsQuality(graphicsQuality: GraphicsQualityLevel): Promise<void> {
    if (!this.quality.isLevel(graphicsQuality)) return Promise.resolve();
    return this.update({ graphicsQuality });
  }

  onChange(listener: (data: VideoSettingsData) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async flush(): Promise<void> {
    await this.persisted.flush();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.clear();
    this.persisted.dispose();
    this.quality.destroy();
  }

  private update(patch: Partial<VideoSettingsData>): Promise<void> {
    if (this.disposed) return Promise.resolve();
    return this.persisted.set((current) => ({ ...current, ...patch })).catch(() => undefined);
  }

  private notify(snapshot: VideoSettingsData): void {
    for (const listener of this.listeners) {
      try {
        listener({ ...snapshot });
      } catch (error) {
        console.warn('[VideoSettings] Ayar dinleyicisi hata verdi:', error);
      }
    }
  }
}
