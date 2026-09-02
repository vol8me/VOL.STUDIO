import {
  DisposableScope,
  MusicEngine,
  SoundBank,
  clamp01,
  observeAppVisibility,
} from '@volstudio/core';
import {
  arachnidAmbienceTrack,
  arachnidAudioConfig,
  arachnidSoundAssets,
  type ArachnidSoundEvent,
} from '@/config/audio';

type SoundBankPort = Pick<SoundBank, 'register' | 'loadAll' | 'play' | 'setBusVolume' | 'dispose'>;
type AmbiencePort = Pick<MusicEngine, 'loadTrack' | 'play' | 'dispose'>;

export interface ArachnidAudioOptions {
  /** Testte Web Audio yüzeyini enjekte etmek için. */
  context?: AudioContext;
  soundBank?: SoundBankPort;
  ambience?: AmbiencePort;
}

export interface ArachnidAudioPort {
  play(event: ArachnidSoundEvent, intensity?: number): void;
}

/**
 * VOL.ARACHNID'in tek ses yaşam döngüsü.
 *
 * SFX ve ambiyans aynı AudioContext/master limiter'ı paylaşır. Dosyalar açılışta
 * arka planda decode edilir; AudioContext ve ambiyans yalnız ilk gerçek kullanıcı
 * etkileşiminde başlar — Android WebView'ın autoplay kapısı böyle aşılır.
 */
export class ArachnidAudio implements ArachnidAudioPort {
  private readonly context: AudioContext;
  private readonly masterGain: GainNode;
  private readonly limiter: DynamicsCompressorNode;
  private readonly soundBank: SoundBankPort;
  private readonly ambience: AmbiencePort;
  private readonly lifecycle = new DisposableScope();
  private readonly unlockScope = new DisposableScope();
  private preparePromise: Promise<void> | null = null;
  private ambienceReady = false;
  private unlocked = false;
  private ambienceStarted = false;
  private destroyed = false;

  constructor(options: ArachnidAudioOptions = {}) {
    this.context = options.context ?? createAudioContext();
    this.masterGain = this.context.createGain();
    this.limiter = this.context.createDynamicsCompressor();

    const { limiter } = arachnidAudioConfig;
    this.limiter.threshold.value = limiter.thresholdDb;
    this.limiter.knee.value = limiter.kneeDb;
    this.limiter.ratio.value = limiter.ratio;
    this.limiter.attack.value = limiter.attackSeconds;
    this.limiter.release.value = limiter.releaseSeconds;
    this.masterGain.gain.value = arachnidAudioConfig.masterVolume;
    this.masterGain.connect(this.limiter);
    this.limiter.connect(this.context.destination);

    this.soundBank =
      options.soundBank ??
      new SoundBank(this.context, this.masterGain, {
        maxVoices: arachnidAudioConfig.maxVoices,
        maxVoicesPerSound: arachnidAudioConfig.maxVoicesPerSound,
        minRetriggerMs: arachnidAudioConfig.minRetriggerMs,
      });
    this.soundBank.setBusVolume(arachnidAudioConfig.sfxVolume);
    for (const [event, urls] of Object.entries(arachnidSoundAssets)) {
      this.soundBank.register(event, urls);
    }

    this.ambience =
      options.ambience ??
      new MusicEngine({
        audioContext: this.context,
        destination: this.masterGain,
        masterVolume: arachnidAudioConfig.ambienceVolume,
        compressor: false,
      });

    this.armUnlock();
    this.lifecycle.addSubscription(
      observeAppVisibility((state) => {
        if (state === 'background') {
          if (this.context.state === 'running') void this.suspend();
          return;
        }
        if (this.unlocked && this.context.state === 'suspended') void this.resumeAndStart();
      }),
    );
    // Decode açılışı bloke etmez; ilk olay gelmeden buffer'ların hazır olma
    // olasılığını artırır. Her dosyanın hatası kendi katmanında izole edilir.
    void this.prepare();
  }

  play(event: ArachnidSoundEvent, intensity = 1): void {
    if (this.destroyed) return;
    const mix = arachnidAudioConfig.events[event];
    try {
      this.soundBank.play(event, {
        gain: mix.gain * clamp01(Number.isFinite(intensity) ? intensity : 0),
        rateJitter: mix.rateJitter,
      });
    } catch (error) {
      // Tek bir WebAudio node hatası oyun döngüsünü durdurmamalı.
      console.warn(`[ArachnidAudio] "${event}" sesi çalınamadı:`, error);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unlockScope.dispose();
    this.lifecycle.dispose();
    this.soundBank.dispose();
    this.ambience.dispose();
    this.masterGain.disconnect();
    this.limiter.disconnect();
    if (this.context.state !== 'closed') {
      void this.context.close().catch((error: unknown) => {
        console.warn('[ArachnidAudio] AudioContext kapatılamadı:', error);
      });
    }
  }

  private armUnlock(): void {
    const unlock = (): void => {
      if (this.unlocked || this.destroyed) return;
      this.unlocked = true;
      this.unlockScope.dispose();
      void this.resumeAndStart();
    };
    for (const event of ['pointerdown', 'touchstart', 'keydown'] as const) {
      this.unlockScope.addListener(window, event, unlock, { passive: true });
    }
  }

  private prepare(): Promise<void> {
    if (this.preparePromise) return this.preparePromise;
    this.preparePromise = Promise.all([
      this.soundBank.loadAll().catch((error: unknown) => {
        console.warn('[ArachnidAudio] SFX ön-yüklemesi tamamlanamadı:', error);
      }),
      this.ambience
        .loadTrack(arachnidAmbienceTrack)
        .then((loaded) => {
          this.ambienceReady = loaded;
        })
        .catch((error: unknown) => {
          console.warn('[ArachnidAudio] Ambiyans yüklenemedi:', error);
        }),
    ]).then(() => undefined);
    return this.preparePromise;
  }

  private async resumeAndStart(): Promise<void> {
    try {
      if (this.context.state === 'suspended') await this.context.resume();
      await this.prepare();
      if (this.destroyed || this.ambienceStarted || !this.ambienceReady) return;
      await this.ambience.play(arachnidAmbienceTrack.id, { fadeIn: 1.2 });
      if (!this.destroyed) this.ambienceStarted = true;
    } catch (error) {
      // Ses hiçbir zaman oyunu durduracak bir hata yüzeyi değildir; sonraki
      // foreground olayı yeniden resume etmeyi deneyebilir.
      console.warn('[ArachnidAudio] Ses başlatılamadı:', error);
    }
  }

  private async suspend(): Promise<void> {
    try {
      await this.context.suspend();
    } catch (error) {
      console.warn('[ArachnidAudio] AudioContext askıya alınamadı:', error);
    }
  }
}

function createAudioContext(): AudioContext {
  const Context =
    globalThis.AudioContext ??
    (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Context) throw new Error('Web Audio API desteklenmiyor.');
  return new Context();
}

/** Web Audio olmayan bir ortam oyunu değil, yalnız ses katmanını kaybeder. */
export function createArachnidAudio(): ArachnidAudio | null {
  try {
    return new ArachnidAudio();
  } catch (error) {
    console.warn('[ArachnidAudio] Ses altyapısı kurulamadı:', error);
    return null;
  }
}
