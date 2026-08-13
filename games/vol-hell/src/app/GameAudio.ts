import { MusicEngine, SidechainDucker } from '@volstudio/core';
import type { AudioSettings, AudioSettingsData } from '@/app/AudioSettings';
import { soundAssets, type SoundEvent } from '@/config/sounds';
import { sfxDucking } from '@/config/audio';
import type { MusicTrack, MusicState } from '@volstudio/core/audio/music';
import { SfxBank } from './SfxBank';

/** Oyunun merkezi ses yöneticisi. Müzik, ambiyans ve SFX aynı AudioContext'te.
 *  Master çıkışta limiter; çok sayıda SFX üst üste geldiğinde clipping'i önler.
 */
export class GameAudio {
  readonly context: AudioContext;
  readonly music: MusicEngine;
  readonly ambient: MusicEngine;
  readonly sfx: SfxBank;
  private readonly masterGain: GainNode;
  private readonly limiter: DynamicsCompressorNode;
  private readonly musicDucker: SidechainDucker;
  private readonly ambientDucker: SidechainDucker;
  private readonly settings: AudioSettings;
  private readonly unsubscribe: () => void;
  private readonly cleanupResume: () => void;

  constructor(settings: AudioSettings) {
    this.settings = settings;
    const Ctx =
      globalThis.AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    // Guard olmadan `new undefined()` TypeError'u bootstrap'in modül gövdesinde
    // patlar ve hata ekranı devreye giremeden beyaz ekran bırakır.
    if (!Ctx) {
      throw new Error('Web Audio API desteklenmiyor; ses altyapısı başlatılamadı.');
    }
    this.context = new Ctx();

    this.masterGain = this.context.createGain();

    // Master limiter: ani peak'leri yakalar, dijital clipping'den korur.
    this.limiter = this.context.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 1;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.1;
    this.masterGain.connect(this.limiter);
    this.limiter.connect(this.context.destination);

    this.musicDucker = new SidechainDucker(this.context, this.masterGain);
    this.ambientDucker = new SidechainDucker(this.context, this.masterGain);

    this.music = this.createMusicBus(settings.getMusicVolume(), this.musicDucker.gain);
    this.ambient = this.createMusicBus(
      settings.getMusicVolume() * settings.getAmbientVolume(),
      this.ambientDucker.gain,
    );
    this.sfx = new SfxBank(this.context, this.masterGain);

    this.apply(settings.getData());
    this.unsubscribe = settings.onChange((data) => this.apply(data));
    this.cleanupResume = this.setupResume();
  }

  private createMusicBus(initialVolume: number, destination: AudioNode): MusicEngine {
    const engine = new MusicEngine({
      audioContext: this.context,
      masterVolume: initialVolume,
      compressor: true,
    });
    engine.mixer.output.disconnect();
    engine.mixer.output.connect(destination);
    return engine;
  }

  private setupResume(): () => void {
    const resume = (): void => {
      if (this.context.state === 'suspended') {
        this.context.resume().catch(() => {
          // Context kapatılmış veya başka bir sebeple resume edilememişse görmezden gel.
        });
      }
    };

    // İlk kullanıcı etkileşiminde context'i çalıştır; daha fazla olay dinleyerek mobil/safari uyumluluğu artır.
    const events = ['pointerdown', 'touchstart', 'keydown', 'click'] as const;
    for (const event of events) {
      window.addEventListener(event, resume, { once: true });
    }

    // Sekme arka planda sesi durdur, öne gelince devam et; pil/performans için.
    const handleVisibility = (): void => {
      if (document.hidden) {
        if (this.context.state === 'running') {
          this.context.suspend().catch(() => {
            // Context kapatılmışsa görmezden gel.
          });
        }
      } else if (this.context.state === 'suspended') {
        this.context.resume().catch(() => {
          // Context kapatılmışsa görmezden gel.
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      for (const event of events) {
        window.removeEventListener(event, resume);
      }
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }

  /** Tüm SFX'leri önceden yükler. Bir dosya bozuksa diğerlerini engellemez. */
  async loadAllSfx(): Promise<void> {
    const events = Object.keys(soundAssets) as SoundEvent[];
    await Promise.all(
      events.map(async (event) => {
        try {
          await this.sfx.load(event);
        } catch (err) {
          console.warn(`[GameAudio] SFX yüklenemedi: ${event}`, err);
        }
      }),
    );
  }

  async playSfx(
    event: SoundEvent,
    options?: {
      volume?: number;
      pitchVar?: number;
      maxVoices?: number;
      minInterval?: number;
      /** Bu event çalmadan önce durdurulacak event'ler.
       *  Örn: enemyDeath çalarken enemyHit tail'ini keser — ses kirliliğini önler. */
      stopEvents?: SoundEvent[];
    },
  ): Promise<void> {
    if (this.settings.isMuted()) return;
    try {
      // Önce durdurulacak event'leri kes — killing blow'da hit tail'ini temizler.
      if (options?.stopEvents) {
        for (const stopEvent of options.stopEvents) {
          this.sfx.stopEvent(stopEvent);
        }
      }
      await this.sfx.play(event, options);
      this.duckForSfx(event);
    } catch (err) {
      console.warn(`[GameAudio] SFX çalınamadı: ${event}`, err);
    }
  }

  private duckForSfx(event: SoundEvent): void {
    const profile = sfxDucking[event];
    if (!profile) return;
    if (profile.music) this.musicDucker.duck(profile.music);
    if (profile.ambient) this.ambientDucker.duck(profile.ambient);
  }

  async loadMusic(track: MusicTrack): Promise<void> {
    await this.music.loadTrack(track);
  }

  async playMusic(
    trackId: string,
    options?: { fadeIn?: number; crossfade?: boolean },
  ): Promise<void> {
    if (this.settings.isMuted()) return;
    try {
      if (options?.crossfade) {
        await this.music.crossfadeTo(trackId, options.fadeIn ?? 2, { state: {} });
      } else {
        await this.music.play(trackId, { fadeIn: options?.fadeIn });
      }
    } catch (err) {
      console.warn(`[GameAudio] Müzik çalınamadı: ${trackId}`, err);
    }
  }

  stopMusic(fadeOut = 2): void {
    this.music.stop({ fadeOut });
  }

  /** Tüm aktif SFX seslerini anında durdurur. */
  stopAllSfx(): void {
    this.sfx.stopAll();
  }

  /** Müzik state'ini günceller; dikey adaptive layering (stem gain map) buradan tetiklenir. */
  setMusicState(state: MusicState, fadeTime = 0.5): void {
    this.music.setState(state, fadeTime);
  }

  async loadAmbient(track: MusicTrack): Promise<void> {
    await this.ambient.loadTrack(track);
  }

  async playAmbient(
    trackId: string,
    options?: { fadeIn?: number; crossfade?: boolean },
  ): Promise<void> {
    if (this.settings.isMuted()) return;
    try {
      if (options?.crossfade) {
        await this.ambient.crossfadeTo(trackId, options.fadeIn ?? 2, { state: {} });
      } else {
        await this.ambient.play(trackId, { fadeIn: options?.fadeIn });
      }
    } catch (err) {
      console.warn(`[GameAudio] Ambiyans çalınamadı: ${trackId}`, err);
    }
  }

  stopAmbient(fadeOut = 2): void {
    this.ambient.stop({ fadeOut });
  }

  private apply(data: AudioSettingsData): void {
    const master = data.muted ? 0 : data.masterVolume;
    const now = this.context.currentTime;
    this.masterGain.gain.setTargetAtTime(master, now, 0.05);

    this.sfx.setBusVolume(data.sfxVolume, 0.05);
    this.music.setMasterVolume(data.musicVolume, 0.05);
    // Ambiyans, müzik slider'ına bağlı olarak kapanmalı:
    // "Müzik" tüm arka plan müziğini, "Ambiyans" sadece ambiyansın göreceli seviyesini ayarlar.
    this.ambient.setMasterVolume(data.musicVolume * data.ambientVolume, 0.05);
  }

  /**
   * Tum ses kaynaklarini birakir ve AudioContext'i kapatir. Tarayicida
   * escanli AudioContext sayisi sinirli; kapatmadan birakmak sayfa yasam
   * dongusu boyunca sizinti yaratir.
   */
  async dispose(): Promise<void> {
    this.unsubscribe();
    this.cleanupResume();
    this.music.dispose();
    this.ambient.dispose();
    this.musicDucker.dispose();
    this.ambientDucker.dispose();
    this.sfx.release();
    this.masterGain.disconnect();
    this.limiter.disconnect();

    if (this.context.state !== 'closed') {
      try {
        await this.context.close();
      } catch (err) {
        console.warn('[GameAudio] AudioContext kapatilamadi:', err);
      }
    }
  }
}
