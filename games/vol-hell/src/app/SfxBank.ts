import { soundAssets, soundKeys, type SoundEvent } from '@/config/sounds';
import { sfxVoiceConfig, type SfxVoiceLimitConfig } from '@/config/audio';
import { StemLoader } from '@volstudio/core/audio/music';
import { clampFinite, finiteOr, nonNegativeFinite } from '@/runtime/utils/numeric';

interface ActiveVoice {
  readonly key: string;
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  readonly startedAt: number;
  stopping: boolean;
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
  private readonly voiceStates = new Map<string, { active: Set<ActiveVoice>; lastStart: number }>();
  /** Olaylar arası ortak kaynak bütçesi; insertion order en eski sesi verir. */
  private readonly activeVoices = new Set<ActiveVoice>();
  /** Fade ile duranlar dahil, hâlâ Web Audio ağına bağlı bütün kaynaklar. */
  private readonly liveVoices = new Set<ActiveVoice>();
  private released = false;

  constructor(context: AudioContext, destination: AudioNode) {
    this.context = context;
    this.loader = new StemLoader(context);
    this.busGain = context.createGain();
    this.busGain.connect(destination);
  }

  setBusVolume(value: number, fadeTime = 0.05): void {
    if (this.released) return;
    const now = finiteOr(this.context.currentTime, 0);
    const safeValue = clampFinite(value, 0, 1, 0);
    const safeFadeTime = nonNegativeFinite(fadeTime, 0);
    if (safeFadeTime <= 0.001) {
      this.busGain.gain.cancelScheduledValues(now);
      this.busGain.gain.setValueAtTime(safeValue, now);
    } else {
      this.busGain.gain.setTargetAtTime(safeValue, now, safeFadeTime / 3);
    }
  }

  async load(event: SoundEvent): Promise<void> {
    if (this.released) return;
    const key = soundKeys[event];
    if (!key) return;
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

    // release() yüklemeyi iptal edemez; ancak geç tamamlanan bir fetch'in
    // yıkılmış bankayı yeniden doldurmasına da izin verilmez.
    if (this.released) return;

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
    if (this.released) return;
    if (this.context.state === 'closed') return;
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
    if (this.released) return;

    const key = soundKeys[event];
    if (!key) return;
    if (!this.buffers.has(key)) await this.load(event);
    if (this.released) return;

    const variants = this.buffers.get(key);
    if (!variants || variants.length === 0) return;

    const now = finiteOr(this.context.currentTime, 0);
    const limit = this.resolveLimit(event, options);
    const state = this.getVoiceState(key);

    if (limit.minInterval > 0 && now - state.lastStart < limit.minInterval) {
      return;
    }

    if (limit.maxVoices > 0 && state.active.size >= limit.maxVoices) {
      // En eski sesi kısa rampayla bırak; sıfır olmayan örnekte sert `stop()`
      // telefon hoparlöründe klik/cızırtı olarak duyulur.
      const oldest = state.active.values().next().value;
      if (oldest) this.stopVoice(oldest, now);
    }

    if (this.activeVoices.size >= sfxVoiceConfig.globalMaxVoices) {
      const oldest = this.activeVoices.values().next().value;
      if (oldest) this.stopVoice(oldest, now);
    }

    // stopVoice aktif setten hemen çıkarır ama kaynak kısa rampası bitene dek
    // bağlı kalır. Fade kuyruğu doygunsa yeni sesi düşürmek, kaynak sayısını
    // büyütmekten veya rampayı sert kesip yeniden klik üretmekten güvenlidir.
    if (this.liveVoices.size >= sfxVoiceConfig.globalMaxLiveVoices) return;

    const buffer = variants[Math.floor(Math.random() * variants.length)];
    if (!buffer) return;

    const source = this.context.createBufferSource();
    source.buffer = buffer;

    const gain = this.context.createGain();
    gain.gain.value = clampFinite(options.volume ?? 1, 0, 1, 1);

    const pitchVar = nonNegativeFinite(options.pitchVar ?? 0, 0);
    if (pitchVar > 0) {
      const cents = (Math.random() * 2 - 1) * pitchVar;
      source.detune.value = cents;
    }

    const voice: ActiveVoice = { key, source, gain, startedAt: now, stopping: false };
    source.onended = () => this.finalizeVoice(voice);

    try {
      source.connect(gain);
      gain.connect(this.busGain);
      source.start();
    } catch (error) {
      this.disconnectVoice(voice);
      throw error;
    }

    state.active.add(voice);
    this.activeVoices.add(voice);
    this.liveVoices.add(voice);
    state.lastStart = now;
  }

  private finalizeVoice(voice: ActiveVoice): void {
    this.voiceStates.get(voice.key)?.active.delete(voice);
    this.activeVoices.delete(voice);
    this.liveVoices.delete(voice);
    this.disconnectVoice(voice);
  }

  private disconnectVoice(voice: ActiveVoice): void {
    try {
      voice.source.disconnect();
    } catch {
      // Kaynak bağlanmadan start() hata verdiyse disconnect de hata verebilir.
    }
    try {
      voice.gain.disconnect();
    } catch {
      // Aynı onended bazı WebView sürümlerinde ikinci kez bildirilebiliyor.
    }
  }

  /** Sesi sıfıra doğru çok kısa rampalayıp dalga biçimini kesmeden durdurur. */
  private stopVoice(voice: ActiveVoice, now = finiteOr(this.context.currentTime, 0)): void {
    if (voice.stopping) return;
    voice.stopping = true;

    // Sayaçlar hemen boşalır; `onended` yalnızca düğüm temizliğini tamamlar.
    this.voiceStates.get(voice.key)?.active.delete(voice);
    this.activeVoices.delete(voice);

    const fade = nonNegativeFinite(sfxVoiceConfig.stopFadeSeconds, 0);
    try {
      const currentGain = clampFinite(voice.gain.gain.value, 0, 1, 0);
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(currentGain, now);
      if (fade > 0) {
        voice.gain.gain.linearRampToValueAtTime(0, now + fade);
      }
      voice.source.stop(now + fade);
    } catch {
      // Çoktan bitmiş kaynakta stop() InvalidStateError verebilir; sayısal
      // sahiplik yukarıda bırakıldı, onended/disconnect güvenli biçimde gelir.
      try {
        voice.source.stop(now);
      } catch {
        // Zaten bitmiş.
      }
    }
  }

  /** Belirli bir event'in tüm aktif seslerini durdurur.
   *  Killing blow'da hit seslerinin tail'ini death sesine karışmadan önce keser. */
  stopEvent(event: SoundEvent): void {
    const key = soundKeys[event];
    const state = this.voiceStates.get(key);
    if (!state) return;
    const now = finiteOr(this.context.currentTime, 0);
    for (const voice of [...state.active]) this.stopVoice(voice, now);
  }

  /** Tüm aktif SFX seslerini kısa fade ile durdurur; sahne geçişi klik üretmez. */
  stopAll(): void {
    const now = finiteOr(this.context.currentTime, 0);
    for (const voice of [...this.activeVoices]) this.stopVoice(voice, now);
  }

  /** UI geçiş seslerini koruyarak gameplay seslerini temizler. */
  stopAllExcept(events: readonly SoundEvent[]): void {
    const keepKeys = new Set<string>(events.map((event) => soundKeys[event]));
    const now = finiteOr(this.context.currentTime, 0);
    for (const voice of [...this.activeVoices]) {
      if (!keepKeys.has(voice.key)) this.stopVoice(voice, now);
    }
  }

  private resolveLimit(
    event: SoundEvent,
    options: { maxVoices?: number; minInterval?: number },
  ): SfxVoiceLimitConfig {
    const defaults = sfxVoiceConfig.eventLimits[event] ?? sfxVoiceConfig.defaultLimit;
    const defaultMaxVoices = defaults.maxVoices;
    const defaultMinInterval = defaults.minInterval;
    return {
      maxVoices: Math.floor(
        clampFinite(
          options.maxVoices ?? defaultMaxVoices,
          0,
          Number.MAX_SAFE_INTEGER,
          defaultMaxVoices,
        ),
      ),
      minInterval: nonNegativeFinite(options.minInterval ?? defaultMinInterval, defaultMinInterval),
    };
  }

  private getVoiceState(key: string): { active: Set<ActiveVoice>; lastStart: number } {
    let state = this.voiceStates.get(key);
    if (!state) {
      // currentTime=0'da minInterval ilk sesi yanlışlıkla susturmamalı.
      state = { active: new Set(), lastStart: -Infinity };
      this.voiceStates.set(key, state);
    }
    return state;
  }

  release(): void {
    if (this.released) return;
    this.released = true;
    this.stopAll();
    for (const voice of this.liveVoices) {
      // Uygulama kapanışında AudioContext de kapanır; bekleyen onended'e
      // güvenmeden node bağlantılarını hemen bırak.
      voice.source.onended = null;
      this.disconnectVoice(voice);
    }
    this.buffers.clear();
    this.voiceStates.clear();
    this.activeVoices.clear();
    this.liveVoices.clear();
    this.pendingLoads.clear();
  }
}
