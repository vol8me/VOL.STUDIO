import type { SaveManager } from '@volstudio/core';

/** Persist edilen ses ayarları. */
export interface AudioSettingsData {
  sfxVolume: number;
  muted: boolean;
}

const STORAGE_KEY = 'vol-hell:audio-settings';

const DEFAULTS: AudioSettingsData = {
  sfxVolume: 0.7,
  muted: false,
};

/**
 * Ses ayarlarını SaveManager üzerinden persist eder.
 * Ayar değişince AudioManager'a anında uygulanır.
 */
export class AudioSettings {
  private data: AudioSettingsData = { ...DEFAULTS };
  private readonly listeners = new Set<(data: AudioSettingsData) => void>();

  constructor(private readonly saveManager: SaveManager) {}

  async load(): Promise<void> {
    this.data = await this.saveManager.load(STORAGE_KEY, DEFAULTS);
  }

  private async persist(): Promise<void> {
    await this.saveManager.save(STORAGE_KEY, this.data);
  }

  getSfxVolume(): number {
    return this.data.sfxVolume;
  }

  isMuted(): boolean {
    return this.data.muted;
  }

  async setSfxVolume(volume: number): Promise<void> {
    this.data.sfxVolume = Math.max(0, Math.min(1, volume));
    await this.persist();
    this.notify();
  }

  async setMuted(muted: boolean): Promise<void> {
    this.data.muted = muted;
    await this.persist();
    this.notify();
  }

  /** Ayar değişiminde çağrılır — AudioManager bu olaya abone olur. */
  onChange(listener: (data: AudioSettingsData) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.data);
    }
  }
}
