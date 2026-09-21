import { PersistedObservableState, type SaveManager } from '@volstudio/core';
import { reportPersistenceFailure } from '@/app/settingsPersistence';
import { DisposableScope } from '@volstudio/core/lifecycle';
import { audioConfig } from '@/config/audio';

/** Persist edilen ses ayarları. */
export interface AudioSettingsData {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  ambientVolume: number;
  muted: boolean;
  screenShakeEnabled: boolean;
  hapticsEnabled: boolean;
  screenShakeIntensity: number;
}

const STORAGE_KEY = 'vol-hell:audio-settings';

/** Ayar yazımlarının depoya en fazla bu sıklıkta inmesi sağlanır (ms). */
const PERSIST_DEBOUNCE_MS = 120;

/**
 * 0-1 aralığında sonlu bir sayıysa kendisi, değilse yedek. `??` yetmez: elle
 * düzenlenmiş bir kayıttaki string veya NaN doğrudan geçip
 * `gain.setTargetAtTime()`'a ulaşır ve sesi kalıcı olarak kapatır.
 */
function safeVolume(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function safeFlag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Yeni alanlar eklendiğinde eski kayıtları varsayılanlarla tamamlar ve tipleri doğrular. */
function mergeWithDefaults(stored: unknown): AudioSettingsData {
  const raw =
    typeof stored === 'object' && stored !== null
      ? (stored as Partial<Record<keyof AudioSettingsData, unknown>>)
      : {};

  return {
    masterVolume: safeVolume(raw.masterVolume, audioConfig.masterVolume),
    sfxVolume: safeVolume(raw.sfxVolume, audioConfig.sfxVolume),
    musicVolume: safeVolume(raw.musicVolume, audioConfig.musicVolume),
    ambientVolume: safeVolume(raw.ambientVolume, audioConfig.ambientVolume),
    muted: safeFlag(raw.muted, audioConfig.muted),
    screenShakeEnabled: safeFlag(raw.screenShakeEnabled, audioConfig.screenShakeEnabled),
    hapticsEnabled: safeFlag(raw.hapticsEnabled, audioConfig.hapticsEnabled),
    screenShakeIntensity: safeVolume(raw.screenShakeIntensity, audioConfig.screenShakeIntensity),
  };
}

/**
 * Ses ayarlarını SaveManager üzerinden persist eder.
 * Ayar değişince GameAudio'ya anında uygulanır.
 */
export class AudioSettings {
  private readonly persisted: PersistedObservableState<AudioSettingsData>;
  private readonly listeners = new Set<(data: AudioSettingsData) => void>();
  private readonly lifecycle = new DisposableScope();
  private disposed = false;
  private readonly boundFlush = (): void => void this.flush();

  constructor(saveManager: SaveManager) {
    this.persisted = new PersistedObservableState<AudioSettingsData>({
      store: saveManager,
      key: STORAGE_KEY,
      initial: mergeWithDefaults(undefined),
      parse: mergeWithDefaults,
      clone: (data) => ({ ...data }),
      equals: (left, right) =>
        left.masterVolume === right.masterVolume &&
        left.sfxVolume === right.sfxVolume &&
        left.musicVolume === right.musicVolume &&
        left.ambientVolume === right.ambientVolume &&
        left.muted === right.muted &&
        left.screenShakeEnabled === right.screenShakeEnabled &&
        left.hapticsEnabled === right.hapticsEnabled &&
        left.screenShakeIntensity === right.screenShakeIntensity,
      debounceMs: PERSIST_DEBOUNCE_MS,
      onError: (error, operation) => {
        if (operation === 'save') reportPersistenceFailure(STORAGE_KEY, error);
      },
    });
    this.persisted.subscribe((data) => this.notify(data));
    if (typeof window !== 'undefined') {
      this.lifecycle.addListener(window, 'beforeunload', this.boundFlush);
    }
  }

  async load(): Promise<void> {
    await this.persisted.load();
  }

  /** Bekleyen yazmayı hemen diske indirir (kapanış, sahne geçişi). */
  async flush(): Promise<void> {
    await this.persisted.flush();
  }

  getMasterVolume(): number {
    return this.getData().masterVolume;
  }

  getSfxVolume(): number {
    return this.getData().sfxVolume;
  }

  getMusicVolume(): number {
    return this.getData().musicVolume;
  }

  getAmbientVolume(): number {
    return this.getData().ambientVolume;
  }

  isMuted(): boolean {
    return this.getData().muted;
  }

  isScreenShakeEnabled(): boolean {
    return this.getData().screenShakeEnabled;
  }

  getScreenShakeIntensity(): number {
    return this.getData().screenShakeIntensity;
  }

  isHapticsEnabled(): boolean {
    return this.getData().hapticsEnabled;
  }

  getData(): AudioSettingsData {
    return this.persisted.get();
  }

  async setMasterVolume(volume: number): Promise<void> {
    await this.update({ masterVolume: safeVolume(volume, this.getMasterVolume()) });
  }

  async setSfxVolume(volume: number): Promise<void> {
    await this.update({ sfxVolume: safeVolume(volume, this.getSfxVolume()) });
  }

  async setMusicVolume(volume: number): Promise<void> {
    await this.update({ musicVolume: safeVolume(volume, this.getMusicVolume()) });
  }

  async setAmbientVolume(volume: number): Promise<void> {
    await this.update({ ambientVolume: safeVolume(volume, this.getAmbientVolume()) });
  }

  async setMuted(muted: boolean): Promise<void> {
    await this.update({ muted: safeFlag(muted, this.isMuted()) });
  }

  async setScreenShakeEnabled(enabled: boolean): Promise<void> {
    await this.update({ screenShakeEnabled: safeFlag(enabled, this.isScreenShakeEnabled()) });
  }

  async setHapticsEnabled(enabled: boolean): Promise<void> {
    await this.update({ hapticsEnabled: safeFlag(enabled, this.isHapticsEnabled()) });
  }

  async setScreenShakeIntensity(intensity: number): Promise<void> {
    await this.update({
      screenShakeIntensity: safeVolume(intensity, this.getScreenShakeIntensity()),
    });
  }

  onChange(listener: (data: AudioSettingsData) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Bekleyen debounce timer'ını iptal eder ve dinleyicileri temizler.
   * Bileşen yok edilirken çağrılmalı; bekleyen snapshot'ı da sıraya alır ve
   * setter promise'lerini açıkta bırakmaz.
   */
  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
    this.persisted.dispose();
    this.lifecycle.dispose();
  }

  private async update(patch: Partial<AudioSettingsData>): Promise<void> {
    if (this.disposed) return;
    try {
      await this.persisted.update((current) => ({ ...current, ...patch }));
    } catch (err) {
      console.warn('[AudioSettings] Ayarlar kaydedilemedi:', err);
    }
  }

  /** Dinleyicilere kopya verilir; canlı referans ayarları dışarıdan mutasyona açardı. */
  private notify(snapshot: AudioSettingsData): void {
    for (const listener of this.listeners) {
      try {
        listener({ ...snapshot });
      } catch (error) {
        // Bir UI dinleyicisinin hatası diğer dinleyicileri ve persist'i
        // engellememeli; ayar değişikliği yine de kalıcı olmalıdır.
        console.warn('[AudioSettings] Ayar dinleyicisi hata verdi:', error);
      }
    }
  }
}
