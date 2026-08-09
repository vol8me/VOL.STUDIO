import type { SaveManager } from '@volstudio/core';
import { audioConfig } from '@/config/audio';

/** Persist edilen ses ayarları. */
export interface AudioSettingsData {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  ambientVolume: number;
  muted: boolean;
  screenShakeEnabled: boolean;
  screenShakeIntensity: number;
}

const STORAGE_KEY = 'vol-hell:audio-settings';

/** Yeni alanlar eklendiğinde eski kayıtları varsayılanlarla tamamla. */
function mergeWithDefaults(stored: Partial<AudioSettingsData> | undefined): AudioSettingsData {
  return {
    masterVolume: stored?.masterVolume ?? audioConfig.masterVolume,
    sfxVolume: stored?.sfxVolume ?? audioConfig.sfxVolume,
    musicVolume: stored?.musicVolume ?? audioConfig.musicVolume,
    ambientVolume: stored?.ambientVolume ?? audioConfig.ambientVolume,
    muted: stored?.muted ?? audioConfig.muted,
    screenShakeEnabled: stored?.screenShakeEnabled ?? audioConfig.screenShakeEnabled,
    screenShakeIntensity: stored?.screenShakeIntensity ?? audioConfig.screenShakeIntensity,
  };
}

/**
 * Ses ayarlarını SaveManager üzerinden persist eder.
 * Ayar değişince GameAudio'ya anında uygulanır.
 */
export class AudioSettings {
  private data: AudioSettingsData = mergeWithDefaults(undefined);
  private readonly listeners = new Set<(data: AudioSettingsData) => void>();

  constructor(private readonly saveManager: SaveManager) {}

  async load(): Promise<void> {
    const stored = await this.saveManager.load<Partial<AudioSettingsData>>(STORAGE_KEY, {});
    this.data = mergeWithDefaults(stored);
  }

  private async persist(): Promise<void> {
    await this.saveManager.save(STORAGE_KEY, this.data);
  }

  getMasterVolume(): number {
    return this.data.masterVolume;
  }

  getSfxVolume(): number {
    return this.data.sfxVolume;
  }

  getMusicVolume(): number {
    return this.data.musicVolume;
  }

  getAmbientVolume(): number {
    return this.data.ambientVolume;
  }

  isMuted(): boolean {
    return this.data.muted;
  }

  isScreenShakeEnabled(): boolean {
    return this.data.screenShakeEnabled;
  }

  getScreenShakeIntensity(): number {
    return this.data.screenShakeIntensity;
  }

  getData(): AudioSettingsData {
    return { ...this.data };
  }

  async setMasterVolume(volume: number): Promise<void> {
    this.data.masterVolume = Math.max(0, Math.min(1, volume));
    await this.persistAndNotify();
  }

  async setSfxVolume(volume: number): Promise<void> {
    this.data.sfxVolume = Math.max(0, Math.min(1, volume));
    await this.persistAndNotify();
  }

  async setMusicVolume(volume: number): Promise<void> {
    this.data.musicVolume = Math.max(0, Math.min(1, volume));
    await this.persistAndNotify();
  }

  async setAmbientVolume(volume: number): Promise<void> {
    this.data.ambientVolume = Math.max(0, Math.min(1, volume));
    await this.persistAndNotify();
  }

  async setMuted(muted: boolean): Promise<void> {
    this.data.muted = muted;
    await this.persistAndNotify();
  }

  async setScreenShakeEnabled(enabled: boolean): Promise<void> {
    this.data.screenShakeEnabled = enabled;
    await this.persistAndNotify();
  }

  async setScreenShakeIntensity(intensity: number): Promise<void> {
    this.data.screenShakeIntensity = Math.max(0, Math.min(1, intensity));
    await this.persistAndNotify();
  }

  onChange(listener: (data: AudioSettingsData) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async persistAndNotify(): Promise<void> {
    this.notify();
    try {
      await this.persist();
    } catch (err) {
      console.warn('[AudioSettings] Ayarlar kaydedilemedi:', err);
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.data);
    }
  }
}
