import type {
  ActiveStem,
  CrossfadeOptions,
  MusicContext,
  MusicEngineOptions,
  MusicState,
  MusicTrack,
  PlayOptions,
  Stem,
  StingerOptions,
  StopOptions,
} from './types';
import { MusicMixer } from './mixer';
import { MusicScheduler } from './scheduler';
import { StemLoader } from './loader';
import { resolveStemGain } from './gain-resolver';
import type { Instrument } from './instrument';
import type { MelodicPhrase } from './instrument';
import { MelodicEngine } from './melodic';
import type { MelodicPlayOptions } from './melodic';

/** Web Audio API tabanlı profesyonel müzik motoru.
 *  Stem'leri senkron çalar, adaptive gain ve crossfade destekler.
 */
export class MusicEngine {
  readonly context: AudioContext;
  readonly mixer: MusicMixer;
  readonly loader: StemLoader;
  readonly melodic: MelodicEngine;

  private readonly tracks = new Map<string, MusicTrack>();
  private readonly buffers = new Map<string, AudioBuffer>();
  private activeStems = new Map<string, ActiveStem>();

  private currentTrackId?: string;
  private currentTrack?: MusicTrack;
  private scheduler?: MusicScheduler;
  private trackStartTime = 0;
  private isPlaying = false;
  private masterVolume = 1;
  private isMuted = false;
  private state: MusicState = {};
  private lookahead: number;
  private stemCounter = 0;

  constructor(options: MusicEngineOptions = {}) {
    if (options.audioContext) {
      this.context = options.audioContext;
    } else if (typeof globalThis.AudioContext !== 'undefined') {
      this.context = new globalThis.AudioContext();
    } else if (
      typeof (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext !==
      'undefined'
    ) {
      this.context = new (
        globalThis as { webkitAudioContext?: typeof AudioContext }
      ).webkitAudioContext!();
    } else {
      throw new Error('AudioContext desteklenmiyor. Browser veya fake context gerekli.');
    }

    this.mixer = new MusicMixer(this.context, { compressor: options.compressor });
    this.mixer.output.connect(this.context.destination);
    this.loader = new StemLoader(this.context);
    this.melodic = new MelodicEngine(this.context, this.mixer.output);
    this.lookahead = Math.max(0.01, options.lookaheadSeconds ?? 0.1);
    this.masterVolume = Math.max(0, Math.min(1, options.masterVolume ?? 1));
    this.mixer.setMasterGain(this.masterVolume, 0);
  }

  /** Track'i buffer'ları ile önceden yükler.
   *  Bir stem yüklenemezse diğerlerini engellemez, sadece uyarır.
   */
  async loadTrack(track: MusicTrack): Promise<void> {
    this.tracks.set(track.id, track);
    const tasks = track.stems.map(async (stem) => {
      if (this.buffers.has(stem.id)) return;
      try {
        if (stem.buffer) {
          this.buffers.set(stem.id, stem.buffer);
        } else if (stem.src) {
          const buffer = await this.loader.loadFromUrl(stem.src);
          this.buffers.set(stem.id, buffer);
        }
      } catch (err) {
        console.warn(`[MusicEngine] Stem yüklenemedi: ${stem.id}`, err);
      }
    });
    await Promise.all(tasks);
  }

  /** Belirtilen track'i çalmaya başlar. */
  async play(trackId: string, options: PlayOptions = {}): Promise<void> {
    if (this.isPlaying && this.currentTrackId === trackId) return;

    const track = this.tracks.get(trackId);
    if (!track) throw new Error(`Track bulunamadı: ${trackId}`);
    await this.loadTrack(track);

    // Aktif kaynak varsa durdur
    if (this.isPlaying) {
      this.stop({ fadeOut: 0.05 });
    }

    this.currentTrackId = trackId;
    this.currentTrack = track;
    this.scheduler = new MusicScheduler(track.bpm, track.timeSignature ?? [4, 4]);
    this.state = { ...track.defaultState, ...options.state };
    this.trackStartTime = this.context.currentTime + this.lookahead;
    this.melodic.setScheduler(this.scheduler, this.trackStartTime);

    for (const stem of track.stems) {
      if (stem.stinger) continue;
      const buffer = this.buffers.get(stem.id);
      if (!buffer) {
        console.warn(`[MusicEngine] Stem buffer bulunamadı: ${stem.id}`);
        continue;
      }
      this.startStem(stem, buffer, this.trackStartTime);
    }

    this.isPlaying = true;
    this.updateGains(options.fadeIn ?? 0.3, this.trackStartTime);

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  /** Çalmayı durdurur. */
  stop(options: StopOptions = {}): void {
    if (!this.isPlaying) return;

    const fadeOut = options.fadeOut ?? 0.5;
    const now = this.context.currentTime;
    const stopTime = now + fadeOut;

    for (const active of this.activeStems.values()) {
      this.mixer.setChannelGain(active.channelId, 0, fadeOut, now);
      if (active.source) {
        try {
          active.source.stop(stopTime);
        } catch {
          // Zaten durdurulmuşsa görmezden gel
        }
      }
    }

    this.melodic.stopAll(fadeOut);
    this.melodic.setScheduler(undefined, 0);

    this.isPlaying = false;
    this.currentTrackId = undefined;
    this.currentTrack = undefined;
    this.scheduler = undefined;
    this.activeStems = new Map();
  }

  /** Verilen track'e bar sınırında crossfade yapar. */
  async crossfadeTo(trackId: string, duration = 2, options: CrossfadeOptions = {}): Promise<void> {
    const track = this.tracks.get(trackId);
    if (!track) throw new Error(`Track bulunamadı: ${trackId}`);
    await this.loadTrack(track);

    const now = this.context.currentTime;
    let transitionTime: number;

    if (options.bars && this.scheduler) {
      // Geçiş, en erken now+duration sonrası bars kadar sonraki bar sınırında başlar.
      const bars = Math.max(1, options.bars);
      const earliest = now + duration;
      const currentBar = this.scheduler.getBarAtTime(earliest, this.trackStartTime);
      const targetBar = Math.floor(currentBar) + bars;
      transitionTime = this.scheduler.getTimeAtBar(targetBar, this.trackStartTime);
    } else {
      transitionTime = now + duration;
    }

    // Eski stem'leri transition sonunda durdur; gain güncellemelerinden muaf tut.
    for (const active of this.activeStems.values()) {
      active.fadingOut = true;
      this.mixer.setChannelGain(active.channelId, 0, duration, transitionTime);
      if (active.source) {
        try {
          active.source.stop(transitionTime + duration);
        } catch {
          // ignore
        }
      }
    }

    // Yeni track'i başlat
    this.currentTrackId = trackId;
    this.currentTrack = track;
    this.scheduler = new MusicScheduler(track.bpm, track.timeSignature ?? [4, 4]);
    this.state = { ...track.defaultState, ...options.state };
    this.trackStartTime = transitionTime;
    this.melodic.setScheduler(this.scheduler, this.trackStartTime);

    for (const stem of track.stems) {
      if (stem.stinger) continue;
      const buffer = this.buffers.get(stem.id);
      if (!buffer) {
        console.warn(`[MusicEngine] Stem buffer bulunamadı: ${stem.id}`);
        continue;
      }
      this.startStem(stem, buffer, transitionTime);
    }

    this.isPlaying = true;
    this.updateGains(duration, transitionTime);
  }

  /** State günceller ve stem gain'lerini yeniden hesaplar. */
  setState(state: MusicState, fadeTime = 0.2): void {
    this.state = { ...this.state, ...state };
    this.updateGains(fadeTime);
  }

  /** Yoğunluk (0-1) ayarlar. */
  setIntensity(value: number, fadeTime = 0.2): void {
    this.state.intensity = Math.max(0, Math.min(1, value));
    this.updateGains(fadeTime);
  }

  /** Gerilim (0-1) ayarlar. */
  setTension(value: number, fadeTime = 0.2): void {
    this.state.tension = Math.max(0, Math.min(1, value));
    this.updateGains(fadeTime);
  }

  /** Boss fazı ayarlar. */
  setBossPhase(phase: number | string, fadeTime = 0.2): void {
    this.state.bossPhase = phase;
    this.updateGains(fadeTime);
  }

  /** Lokasyon / sahne state'i ayarlar. */
  setLocation(location: string, fadeTime = 0.2): void {
    this.state.location = location;
    this.updateGains(fadeTime);
  }

  /** Master ses seviyesini ayarlar. */
  setMasterVolume(value: number, fadeTime = 0.05): void {
    this.masterVolume = Math.max(0, Math.min(1, value));
    if (!this.isMuted) {
      this.mixer.setMasterGain(this.masterVolume, fadeTime);
    }
  }

  /** Tüm müziği susturur / açar. */
  mute(muted: boolean, fadeTime = 0.2): void {
    this.isMuted = muted;
    this.mixer.setMasterGain(muted ? 0 : this.masterVolume, fadeTime);
  }

  /** One-shot stinger çalar. */
  async triggerStinger(stemId: string, options: StingerOptions = {}): Promise<void> {
    const track = this.currentTrack;
    const stem = track?.stems.find((s) => s.id === stemId);

    let buffer: AudioBuffer | undefined = this.buffers.get(stemId);
    if (!buffer && stem?.buffer) buffer = stem.buffer;
    if (!buffer && stem?.src) {
      buffer = await this.loader.loadFromUrl(stem.src);
    }
    if (!buffer) {
      throw new Error(`Stinger buffer bulunamadı: ${stemId}`);
    }

    const channelId = `__stinger__${stemId}__${this.stemCounter++}`;
    const gain = this.mixer.createChannel(channelId);
    const now = this.context.currentTime;
    const when = options.when ?? now;

    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(options.volume ?? 1, when + 0.01);

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = false;
    source.connect(gain);
    source.start(when, 0);

    source.onended = () => {
      try {
        source.disconnect();
        gain.disconnect();
      } finally {
        this.mixer.removeChannel(channelId);
      }
    };
  }

  /** Bir melodik fraze enstrümanla çalar; track grid'ine hizalanır. */
  playPhrase(
    phrase: MelodicPhrase,
    instrument: Instrument,
    options: MelodicPlayOptions = {},
  ): number {
    if (!this.scheduler) {
      throw new Error('Fraze çalmak için aktif track gerekli.');
    }
    return this.melodic.playPhrase(phrase, instrument, options);
  }

  /** Aktif bir stem'in anlık gain değerini döner (debug / UI için). */
  getStemGain(stemId: string): number {
    let newest: ActiveStem | undefined;
    for (const active of this.activeStems.values()) {
      if (active.stem.id === stemId) {
        if (!newest || active.startTime >= newest.startTime) {
          newest = active;
        }
      }
    }
    return newest?.gain.gain.value ?? 0;
  }

  /** Son hesaplanan hedef gain'i döner. */
  getTargetStemGain(stemId: string): number {
    if (!this.scheduler) return 0;

    let newest: ActiveStem | undefined;
    for (const active of this.activeStems.values()) {
      if (active.stem.id === stemId) {
        if (!newest || active.startTime >= newest.startTime) {
          newest = active;
        }
      }
    }

    if (!newest) return 0;
    const ctx = this.scheduler.getContext(this.context.currentTime, this.trackStartTime);
    return resolveStemGain(newest.stem, this.state, ctx);
  }

  /** Şu anki çalma bağlamını döner. */
  getCurrentContext(): MusicContext {
    if (!this.scheduler) {
      throw new Error('Aktif track yok');
    }
    return this.scheduler.getContext(this.context.currentTime, this.trackStartTime);
  }

  /** Track ve state bilgilerini döner. */
  getCurrentState(): {
    trackId?: string;
    state: MusicState;
    playing: boolean;
  } {
    return {
      trackId: this.currentTrackId,
      state: { ...this.state },
      playing: this.isPlaying,
    };
  }

  /** Tüm kaynakları temizler. */
  dispose(): void {
    const toDispose = [...this.activeStems.values()];
    this.stop({ fadeOut: 0 });
    for (const active of toDispose) {
      try {
        active.source?.stop();
      } catch {
        // Zaten durdurulmuşsa görmezden gel
      }
      try {
        active.source?.disconnect();
      } catch {
        // Zaten ayrılmışsa görmezden gel
      }
      this.mixer.removeChannel(active.channelId);
    }
    this.melodic.stopAll(0);
    this.mixer.clear();
    this.mixer.output.disconnect();
  }

  private startStem(stem: Stem, buffer: AudioBuffer, when: number): void {
    const channelId = `${stem.id}__${this.stemCounter++}`;
    const gain = this.mixer.createChannel(channelId, stem.pan ?? 0);
    gain.gain.setValueAtTime(0, when);

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = stem.loop !== false;

    if (this.currentTrack?.loopStart !== undefined) {
      source.loopStart = this.currentTrack.loopStart;
    }
    if (this.currentTrack?.loopEnd !== undefined) {
      source.loopEnd = Math.min(this.currentTrack.loopEnd, buffer.duration);
    }

    source.connect(gain);
    source.start(when, 0);

    source.onended = () => {
      try {
        source.disconnect();
        gain.disconnect();
      } catch {
        // Zaten ayrılmışsa görmezden gel
      } finally {
        this.activeStems.delete(channelId);
        this.mixer.removeChannel(channelId);
      }
    };

    this.activeStems.set(channelId, { stem, channelId, source, gain, buffer, startTime: when });
  }

  private updateGains(fadeTime = 0.1, when?: number): void {
    if (!this.scheduler) return;

    const now = when ?? this.context.currentTime;
    const ctx = this.scheduler.getContext(now, this.trackStartTime);

    for (const active of this.activeStems.values()) {
      if (active.fadingOut) continue;
      const targetGain = resolveStemGain(active.stem, this.state, ctx);
      this.mixer.setChannelGain(active.channelId, targetGain, fadeTime, now);
    }
  }
}
