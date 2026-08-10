import { MusicEngine, SidechainDucker } from '@volstudio/core';
import type { AudioSettings, AudioSettingsData } from '@/app/AudioSettings';
import { soundAssets, soundKeys, type SoundEvent } from '@/config/sounds';
import { sfxDucking } from '@/config/audio';
import type { MusicTrack, MusicState } from '@volstudio/core/audio/music';

/** SFX ses olayı başına ses sınırı. */
interface SfxVoiceLimit {
  /** Aynı anda çalabilecek maksimum ses sayısı. */
  maxVoices: number;
  /** Aynı olay için iki çalma arasındaki minimum süre (saniye). */
  minInterval: number;
}

/** SFX için varyasyonlu AudioBuffer havuzu.
 *  Çok hızlı tetiklenen SFX'leri (ateş, hasar) kısıtlar,
 *  böylece onlarca üst üste ses ve clipping oluşmaz.
 */
class SfxBank {
  private readonly context: AudioContext;
  private readonly buffers = new Map<string, AudioBuffer[]>();
  private readonly busGain: GainNode;
  private readonly voiceStates = new Map<
    string,
    { active: Set<AudioBufferSourceNode>; lastStart: number }
  >();
  private readonly voiceLimits: Partial<Record<SoundEvent, SfxVoiceLimit>> = {
    fire: { maxVoices: 3, minInterval: 0.05 },
    dash: { maxVoices: 2, minInterval: 0.1 },
    hurt: { maxVoices: 2, minInterval: 0.08 },
    enemyHit: { maxVoices: 4, minInterval: 0.04 },
    enemyDeath: { maxVoices: 3, minInterval: 0.05 },
    bulletBounce: { maxVoices: 3, minInterval: 0.05 },
  };

  constructor(context: AudioContext, destination: AudioNode) {
    this.context = context;
    this.busGain = context.createGain();
    this.busGain.connect(destination);
  }

  setBusVolume(value: number, fadeTime = 0.05): void {
    const now = this.context.currentTime;
    if (fadeTime <= 0.001) {
      this.busGain.gain.cancelScheduledValues(now);
      this.busGain.gain.setValueAtTime(value, now);
    } else {
      this.busGain.gain.setTargetAtTime(value, now, fadeTime / 3);
    }
  }

  async load(event: SoundEvent): Promise<void> {
    const key = soundKeys[event];
    if (this.buffers.has(key)) return;

    const paths = soundAssets[event];
    const tasks = paths.map(async (path) => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`SFX yüklenemedi: ${path} (${response.status})`);
      const contentType = response.headers.get('content-type');
      if (contentType && !contentType.includes('audio') && !contentType.includes('octet-stream')) {
        throw new Error(`SFX geçersiz içerik: ${path} (${contentType})`);
      }
      const arrayBuffer = await response.arrayBuffer();
      try {
        return await this.context.decodeAudioData(arrayBuffer);
      } catch (err) {
        throw new Error(
          `SFX decode hatası: ${path} — ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });

    // allSettled: bir dosya eksik/bozuksa diğerleri yine de yüklenir.
    // Promise.all kullansaydık tek 404 tüm SFX'i bozardı.
    const results = await Promise.allSettled(tasks);
    const buffers = results
      .filter((r): r is PromiseFulfilledResult<AudioBuffer> => r.status === 'fulfilled')
      .map((r) => r.value);

    // Boş olsa bile cache'le — her play çağrısında tekrar fetch denemesini önler.
    this.buffers.set(key, buffers);

    if (buffers.length === 0) {
      console.warn(`[SfxBank] ${event}: tüm dosyalar başarısız, ses çalınamayacak`);
    } else if (buffers.length < paths.length) {
      console.warn(`[SfxBank] ${event}: ${paths.length - buffers.length} dosya atlandı`);
    }
  }

  async play(
    event: SoundEvent,
    options: { volume?: number; pitchVar?: number; maxVoices?: number; minInterval?: number } = {},
  ): Promise<void> {
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    const key = soundKeys[event];
    if (!this.buffers.has(key)) await this.load(event);

    const variants = this.buffers.get(key);
    if (!variants || variants.length === 0) return;

    const now = this.context.currentTime;
    const limit = this.resolveLimit(event, options);
    const state = this.getVoiceState(key);

    if (limit.minInterval > 0 && now - state.lastStart < limit.minInterval) {
      return;
    }

    if (limit.maxVoices > 0 && state.active.size >= limit.maxVoices) {
      // En eski sesi durdur; böylece en yeni ses duyulur.
      const oldest = state.active.values().next().value;
      if (oldest) {
        try {
          oldest.stop(now);
        } catch {
          // Zaten bitmek üzereyse görmezden gel
        }
      }
    }

    const buffer = variants[Math.floor(Math.random() * variants.length)];
    if (!buffer) return;

    const source = this.context.createBufferSource();
    source.buffer = buffer;

    const gain = this.context.createGain();
    gain.gain.value = Math.max(0, options.volume ?? 1);

    if (options.pitchVar && options.pitchVar !== 0) {
      const cents = (Math.random() * 2 - 1) * options.pitchVar;
      source.detune.value = cents;
    }

    source.connect(gain);
    gain.connect(this.busGain);
    source.start();

    state.active.add(source);
    state.lastStart = now;

    source.onended = () => {
      state.active.delete(source);
      try {
        gain.disconnect();
      } catch {
        // ignore
      }
    };
  }

  /** Belirli bir event'in tüm aktif seslerini durdurur.
   *  Killing blow'da hit seslerinin tail'ini death sesine karışmadan önce keser. */
  stopEvent(event: SoundEvent): void {
    const key = soundKeys[event];
    const state = this.voiceStates.get(key);
    if (!state) return;
    const now = this.context.currentTime;
    for (const source of state.active) {
      try {
        source.stop(now);
      } catch {
        // Zaten bitmek üzereyse görmezden gel
      }
    }
    state.active.clear();
  }

  private resolveLimit(
    event: SoundEvent,
    options: { maxVoices?: number; minInterval?: number },
  ): SfxVoiceLimit {
    const defaults = this.voiceLimits[event];
    return {
      maxVoices: options.maxVoices ?? defaults?.maxVoices ?? 0,
      minInterval: options.minInterval ?? defaults?.minInterval ?? 0,
    };
  }

  private getVoiceState(key: string): { active: Set<AudioBufferSourceNode>; lastStart: number } {
    if (!this.voiceStates.has(key)) {
      this.voiceStates.set(key, { active: new Set(), lastStart: 0 });
    }
    return this.voiceStates.get(key)!;
  }

  release(): void {
    this.buffers.clear();
    this.voiceStates.clear();
  }
}

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
        void this.context.resume();
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
          void this.context.suspend();
        }
      } else if (this.context.state === 'suspended') {
        void this.context.resume();
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

  dispose(): void {
    this.unsubscribe();
    this.cleanupResume();
    this.music.dispose();
    this.ambient.dispose();
    this.musicDucker.dispose();
    this.ambientDucker.dispose();
    this.sfx.release();
    this.masterGain.disconnect();
    this.limiter.disconnect();
  }
}
