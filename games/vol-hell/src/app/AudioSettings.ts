import type { SaveManager } from '@volstudio/core';
import { reportPersistenceFailure } from '@/app/settingsPersistence';
import { DisposableScope, type CancellableDisposable } from '@volstudio/core/lifecycle';
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
  private data: AudioSettingsData = mergeWithDefaults(undefined);
  private readonly listeners = new Set<(data: AudioSettingsData) => void>();
  private readonly lifecycle = new DisposableScope();
  private persistTimer: CancellableDisposable | null = null;
  private pendingPersist: Promise<void> | null = null;
  private pendingResolve: ((value: void | PromiseLike<void>) => void) | null = null;
  /** Yazıları sıraya alır; flush sırasında iki ayar kaydı yarışmaz. */
  private persistQueue: Promise<void> = Promise.resolve();
  private disposed = false;
  private loadGeneration = 0;
  private readonly boundFlush = (): void => void this.flush();

  constructor(private readonly saveManager: SaveManager) {
    if (typeof window !== 'undefined') {
      this.lifecycle.addListener(window, 'beforeunload', this.boundFlush);
    }
  }

  async load(): Promise<void> {
    const generation = ++this.loadGeneration;
    const stored = await this.saveManager.load<unknown>(STORAGE_KEY, {});
    if (this.disposed || generation !== this.loadGeneration) return;
    this.data = mergeWithDefaults(stored);
    // GameAudio, açılıştan önce veya sonra yüklenmiş olabilir. Kayıtlı
    // snapshot'ı setter'lar gibi yayınlamazsak ses varsayılan gain'de kalır ve
    // kullanıcı slider'a dokunana kadar kapalı müzik yeniden açılır.
    this.notify();
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
    if (this.disposed) return Promise.resolve();
    this.pendingPersist ??= new Promise<void>((resolve) => {
      this.pendingResolve = resolve;
      this.persistTimer = this.lifecycle.addTimeout(() => {
        this.persistTimer = null;
        this.commitPendingPersist();
      }, PERSIST_DEBOUNCE_MS);
    });

    return this.pendingPersist;
  }

  /** Bekleyen yazmayı hemen diske indirir (kapanış, sahne geçişi). */
  async flush(): Promise<void> {
    if (this.persistTimer !== null) {
      this.persistTimer.cancel();
      this.persistTimer = null;
      this.commitPendingPersist();
    }

    // Timer daha önce çalıştıysa yazma hâlâ kuyrukta olabilir. Sadece timer'ı
    // kontrol etmek, beforeunload/scene geçişinde son kaydı yarıda bırakırdı.
    await this.persistQueue;
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

  isHapticsEnabled(): boolean {
    return this.data.hapticsEnabled;
  }

  getData(): AudioSettingsData {
    return { ...this.data };
  }

  async setMasterVolume(volume: number): Promise<void> {
    this.data.masterVolume = safeVolume(volume, this.data.masterVolume);
    await this.persistAndNotify();
  }

  async setSfxVolume(volume: number): Promise<void> {
    this.data.sfxVolume = safeVolume(volume, this.data.sfxVolume);
    await this.persistAndNotify();
  }

  async setMusicVolume(volume: number): Promise<void> {
    this.data.musicVolume = safeVolume(volume, this.data.musicVolume);
    await this.persistAndNotify();
  }

  async setAmbientVolume(volume: number): Promise<void> {
    this.data.ambientVolume = safeVolume(volume, this.data.ambientVolume);
    await this.persistAndNotify();
  }

  async setMuted(muted: boolean): Promise<void> {
    this.data.muted = safeFlag(muted, this.data.muted);
    await this.persistAndNotify();
  }

  async setScreenShakeEnabled(enabled: boolean): Promise<void> {
    this.data.screenShakeEnabled = safeFlag(enabled, this.data.screenShakeEnabled);
    await this.persistAndNotify();
  }

  async setHapticsEnabled(enabled: boolean): Promise<void> {
    this.data.hapticsEnabled = safeFlag(enabled, this.data.hapticsEnabled);
    await this.persistAndNotify();
  }

  async setScreenShakeIntensity(intensity: number): Promise<void> {
    this.data.screenShakeIntensity = safeVolume(intensity, this.data.screenShakeIntensity);
    await this.persistAndNotify();
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
    this.loadGeneration++;
    if (this.persistTimer !== null) {
      this.persistTimer.cancel();
      this.persistTimer = null;
      // Bekleyen setter promise'leri asılı kalmasın; kapanışta son snapshot
      // yine sıraya alınır. `dispose()` artık sessizce yazmayı düşürmez.
      this.commitPendingPersist();
    }
    this.disposed = true;
    this.listeners.clear();
    this.lifecycle.dispose();
  }

  private async persistAndNotify(): Promise<void> {
    if (this.disposed) return;
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
      try {
        listener(snapshot);
      } catch (error) {
        // Bir UI dinleyicisinin hatası diğer dinleyicileri ve persist'i
        // engellememeli; ayar değişikliği yine de kalıcı olmalıdır.
        console.warn('[AudioSettings] Ayar dinleyicisi hata verdi:', error);
      }
    }
  }

  /** Debounce beklemesini bitirip güncel snapshot'ı yazma kuyruğuna alır. */
  private commitPendingPersist(): void {
    this.persistTimer = null;
    if (this.pendingPersist === null) return;

    const resolve = this.pendingResolve;
    this.pendingResolve = null;
    this.pendingPersist = null;

    // Canlı `this.data` referansı yerine snapshot al: timer açıldıktan sonra
    // gelen yeni bir ayar, önceki yazının içeriğini geriye dönük değiştirmesin.
    const snapshot = { ...this.data };
    const write = this.persistQueue.then(() => this.saveManager.save(STORAGE_KEY, snapshot));
    // Hata YUTULMAZ: tek kapıdan konsola, teşhis akışına ve abonelere taşınır.
    this.persistQueue = write.catch((error: unknown) => {
      reportPersistenceFailure(STORAGE_KEY, error);
    });
    resolve?.(write);
  }
}
