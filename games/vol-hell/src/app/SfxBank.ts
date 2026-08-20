import { soundAssets, soundKeys, type SoundEvent } from '@/config/sounds';
import { StemLoader } from '@volstudio/core/audio/music';

/** SFX ses olayı başına ses sınırı. */
export interface SfxVoiceLimit {
  /** Aynı anda çalabilecek maksimum ses sayısı. */
  maxVoices: number;
  /** Aynı olay için iki çalma arasındaki minimum süre (saniye). */
  minInterval: number;
}

/** SFX için varyasyonlu AudioBuffer havuzu.
 *  Çok hızlı tetiklenen SFX'leri (ateş, hasar) kısıtlar,
 *  böylece onlarca üst üste ses ve clipping oluşmaz.
 */
export class SfxBank {
  private readonly context: AudioContext;
  private readonly loader: StemLoader;
  private readonly buffers = new Map<string, AudioBuffer[]>();
  /** Devam eden yüklemeler — aynı ses için tekrar fetch'i önler. */
  private readonly pendingLoads = new Map<string, Promise<void>>();
  private readonly busGain: GainNode;
  private readonly voiceStates = new Map<
    string,
    { active: Set<AudioBufferSourceNode>; lastStart: number }
  >();
  private readonly voiceLimits: Partial<Record<SoundEvent, SfxVoiceLimit>> = {
    // Slider `input` olayında tek bir sürükleme onlarca blip üretir;
    // limit olmadan hepsi üst üste binip makineli tüfek sesi verir.
    menuBlip: { maxVoices: 2, minInterval: 0.06 },
    fire: { maxVoices: 3, minInterval: 0.05 },
    dash: { maxVoices: 2, minInterval: 0.1 },
    hurt: { maxVoices: 2, minInterval: 0.08 },
    enemyHit: { maxVoices: 4, minInterval: 0.04 },
    enemyDeath: { maxVoices: 3, minInterval: 0.05 },
    bulletBounce: { maxVoices: 3, minInterval: 0.05 },
    fluxPickup: { maxVoices: 3, minInterval: 0.04 },
    turretFire: { maxVoices: 4, minInterval: 0.08 },
    telegraph: { maxVoices: 4, minInterval: 0.03 },
    eliteSpawn: { maxVoices: 1, minInterval: 0.2 },
    bossSpawn: { maxVoices: 1, minInterval: 0.2 },
    bossEnrage: { maxVoices: 1, minInterval: 0.2 },
    bossDown: { maxVoices: 1, minInterval: 0.2 },
    waveStart: { maxVoices: 1, minInterval: 0.2 },
    waveClear: { maxVoices: 1, minInterval: 0.2 },
    levelUp: { maxVoices: 1, minInterval: 0.2 },
  };

  constructor(context: AudioContext, destination: AudioNode) {
    this.context = context;
    this.loader = new StemLoader(context);
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

    const pending = this.pendingLoads.get(key);
    if (pending) return pending;

    const task = this.loadIntoCache(event, key).finally(() => {
      this.pendingLoads.delete(key);
    });
    this.pendingLoads.set(key, task);
    return task;
  }

  private async loadIntoCache(event: SoundEvent, key: string): Promise<void> {
    const paths = soundAssets[event];
    // `StemLoader.loadFromUrl` fetch + content-type kontrolü + decode yapar;
    // .ogg başarısız olursa .mp3 fallback'i tek yerden sağlar (music/loader.ts).
    const tasks = paths.map((path) => this.loader.loadFromUrl(path));

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
        // Set'ten HEMEN silinir; onended asenkron oldugu icin ona birakilirsa
        // aktif sayisi kisa sureligine maxVoices'i asar ve sayac yanlis olur.
        state.active.delete(oldest);
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

  /** Tüm aktif SFX seslerini durdurur. Sahne geçişlerinde ses sızıntısını önler. */
  stopAll(): void {
    const now = this.context.currentTime;
    for (const state of this.voiceStates.values()) {
      for (const source of state.active) {
        try {
          source.stop(now);
        } catch {
          // Zaten bitmek üzereyse görmezden gel
        }
      }
      state.active.clear();
    }
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
    let state = this.voiceStates.get(key);
    if (!state) {
      state = { active: new Set(), lastStart: 0 };
      this.voiceStates.set(key, state);
    }
    return state;
  }

  release(): void {
    this.stopAll();
    this.buffers.clear();
    this.voiceStates.clear();
    this.pendingLoads.clear();
  }
}
