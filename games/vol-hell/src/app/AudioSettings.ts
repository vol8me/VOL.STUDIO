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
    screenShakeIntensity: safeVolume(raw.screenShakeIntensity, audioConfig.screenShakeIntensity),
  };
}

/**
 * Ses ayarlarını SaveManager üzerinden persist eder.
 * Ayar değişince GameAudio'ya anında uygulanır.
 */
export class AudioSettings {
  private data: AudioSettingsData = mergeWithDefaults(undefined);
  private readonly listeners = new Set<(data: AudioSettingsData) => void>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPersist: Promise<void> | null = null;
  private readonly boundFlush = (): void => void this.flush();

  constructor(private readonly saveManager: SaveManager) {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.boundFlush);
    }
  }

  async load(): Promise<void> {
    const stored = await this.saveManager.load<unknown>(STORAGE_KEY, {});
    this.data = mergeWithDefaults(stored);
  }

  /**
   * Yazımı geciktirip birleştirir. Slider `input` olayını dinlediği için tek bir
   * sürükleme onlarca set*() çağrısı üretiyor; her biri ayrı bir localStorage
   * yazması (senkron) veya Tauri store disk yazması olurdu.
   *
   * Dönen promise gerçek yazma tamamlanınca çözülür — çağıranın hata görme
   * sözleşmesi korunur.
   */
  private persist(): Promise<void> {
    this.pendingPersist ??= new Promise<void>((resolve) => {
      this.persistTimer = setTimeout(() => {
        this.persistTimer = null;
        this.pendingPersist = null;
        resolve(this.saveManager.save(STORAGE_KEY, this.data));
      }, PERSIST_DEBOUNCE_MS);
    });

    return this.pendingPersist;
  }

  /** Bekleyen yazmayı hemen diske indirir (kapanış, sahne geçişi). */
  async flush(): Promise<void> {
    if (this.persistTimer === null) return;
    clearTimeout(this.persistTimer);
    this.persistTimer = null;
    this.pendingPersist = null;
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

  /**
   * Bekleyen debounce timer'ını iptal eder ve dinleyicileri temizler.
   * Bileşen yok edilirken çağrılmalı; devam eden persist promise'ine sahip
   * çıkmaz — çağıran istersen önce `flush()` çağırır.
   */
  dispose(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.pendingPersist = null;
    this.listeners.clear();
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.boundFlush);
    }
  }

  private async persistAndNotify(): Promise<void> {
    this.notify();
    try {
      await this.persist();
    } catch (err) {
      console.warn('[AudioSettings] Ayarlar kaydedilemedi:', err);
    }
  }

  /** Dinleyicilere KOPYA verilir — getData() ile ayni sozlesme; canli referans
   *  bir dinleyicinin ayarlari farkinda olmadan mutasyona ugratmasina izin verirdi. */
  private notify(): void {
    const snapshot = this.getData();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
