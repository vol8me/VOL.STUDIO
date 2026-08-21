import type {
  ActiveStem,
  LoopTimingMismatch,
  CrossfadeOptions,
  MusicEngineOptions,
  MusicState,
  MusicTrack,
  PlayOptions,
  Stem,
  StopOptions,
} from './types';
import { MusicMixer } from './mixer';
import { MusicScheduler } from './scheduler';
import { StemLoader } from './loader';
import { resolveStemGain } from './gain-resolver';

/**
 * `loopEnd` ile dosya süresi arasında kabul edilen fark (saniye).
 *
 * Kodlayıcılar (OGG/MP3) blok hizalaması yüzünden birkaç milisaniyelik fark
 * bırakabilir; eşik bunun altındaki gürültüyü susturur ama gerçek bir
 * ayrışmayı (bölüm eksik, parça erken sarıyor) geçirmez.
 */
const LOOP_DURATION_TOLERANCE = 0.05;

/** Web Audio API tabanlı müzik motoru.
 *  Önceden üretilmiş OGG/MP3 stem'leri senkron çalar, adaptive gain ve crossfade destekler. */
export class MusicEngine {
  readonly context: AudioContext;
  readonly mixer: MusicMixer;
  readonly loader: StemLoader;

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
  /** Doğal bitiş dinleyicileri — playlist ilerlemesi buna bağlanır. */
  private readonly trackEndHandlers = new Set<(trackId: string) => void>();
  /** Zamanlama ayrışması bildirimi; verilmezse konsola yazılır. */
  private readonly onTimingMismatch?: (info: LoopTimingMismatch) => void;
  /** Aynı stem için tekrar tekrar uyarmamak adına bildirilenler. */
  private readonly reportedMismatches = new Set<string>();

  constructor(options: MusicEngineOptions = {}) {
    if (options.audioContext) {
      this.context = options.audioContext;
    } else if (typeof globalThis.AudioContext !== 'undefined') {
      this.context = new globalThis.AudioContext();
    } else {
      const webkitCtor = (globalThis as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
      if (typeof webkitCtor === 'function') {
        this.context = new webkitCtor();
      } else {
        throw new Error('AudioContext desteklenmiyor. Browser veya fake context gerekli.');
      }
    }

    this.mixer = new MusicMixer(this.context, { compressor: options.compressor });
    this.mixer.output.connect(options.destination ?? this.context.destination);
    this.loader = new StemLoader(this.context);
    this.lookahead = Math.max(0.01, options.lookaheadSeconds ?? 0.1);
    this.onTimingMismatch = options.onTimingMismatch;
    this.masterVolume = Math.max(0, Math.min(1, options.masterVolume ?? 1));
    this.mixer.setMasterGain(this.masterVolume, 0);
  }

  /**
   * Zamanlama ayrışmasını BİR KEZ bildirir (stem başına).
   *
   * Her loop turunda tekrarlamak konsolu doldurup asıl bilgiyi gömerdi.
   */
  private reportTimingMismatch(info: LoopTimingMismatch): void {
    const key = `${info.trackId}:${info.stemId}`;
    if (this.reportedMismatches.has(key)) return;
    this.reportedMismatches.add(key);

    if (this.onTimingMismatch) {
      this.onTimingMismatch(info);
      return;
    }
    console.warn(
      `[MusicEngine] "${info.trackId}" / "${info.stemId}": loopEnd ` +
        `${info.configuredEnd.toFixed(3)} s ama dosya ${info.actualDuration.toFixed(3)} s. ` +
        'Config ile üretim ayrışmış; parça erken sarar ya da bir bölüm hiç duyulmaz.',
    );
  }

  /** Track'i buffer'ları ile önceden yükler.
   *  Bir stem yüklenemezse diğerlerini engellemez, sadece uyarır. */
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
    // Aynı parça zaten çalıyorsa yeniden başlatılmaz; verilen state uygulanır.
    if (this.isPlaying && this.currentTrackId === trackId) {
      if (options.state) this.setState(options.state);
      return;
    }

    const track = this.tracks.get(trackId);
    if (!track) throw new Error(`Track bulunamadı: ${trackId}`);
    await this.loadTrack(track);

    if (this.isPlaying) {
      this.stop({ fadeOut: 0.05 });
    }

    this.currentTrackId = trackId;
    this.currentTrack = track;
    this.scheduler = new MusicScheduler(track.bpm, track.timeSignature ?? [4, 4]);
    this.state = { ...track.defaultState, ...options.state };
    this.trackStartTime = this.context.currentTime + this.lookahead;

    for (const stem of track.stems) {
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
      active.stoppedByEngine = true;
      this.mixer.setChannelGain(active.channelId, 0, fadeOut, now);
      if (active.source) {
        try {
          active.source.stop(stopTime);
        } catch {
          // Zaten durdurulmuşsa görmezden gel
        }
      }
    }

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
      // Bar hizalı geçiş: `earliest` anındaki kesirli bar numarasını al,
      // tam bar sınırına floor'la ve `bars` kadar ileri taşı. Kesirli kısım
      // atılır — geçiş her zaman tam bar başında başlar, yarım bar beklenmez.
      const bars = Math.max(1, options.bars);
      const earliest = now + duration;
      const currentBar = this.scheduler.getBarAtTime(earliest, this.trackStartTime);
      const targetBar = Math.floor(currentBar) + bars;
      transitionTime = this.scheduler.getTimeAtBar(targetBar, this.trackStartTime);
    } else {
      // Bar hizalaması istenmediyse geçiş hemen başlar.
      transitionTime = now;
    }

    // Eski stem'leri transition sonunda durdur; gain güncellemelerinden muaf tut.
    for (const active of this.activeStems.values()) {
      active.fadingOut = true;
      active.stoppedByEngine = true;
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

    for (const stem of track.stems) {
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
    this.mixer.clear();
    this.mixer.output.disconnect();

    // Decode edilmiş AudioBuffer'lar parça başına megabaytlar tutabiliyor;
    // dispose sonrası bunları elde tutmanın anlamı yok.
    this.buffers.clear();
    this.tracks.clear();
  }

  private startStem(stem: Stem, buffer: AudioBuffer, when: number): void {
    const channelId = `${stem.id}__${this.stemCounter++}`;
    const gain = this.mixer.createChannel(channelId);
    gain.gain.setValueAtTime(0, when);

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = stem.loop !== false;

    // loopStart/loopEnd sonsuz veya negatifse Web Audio sessizce tüm buffer'a
    // düşürür; burada pozitif-sonlu aralığa çekilerek belirtilen loop korunur.
    const configuredEnd = this.currentTrack?.loopEnd;
    const loopEnd =
      configuredEnd !== undefined && Number.isFinite(configuredEnd) && configuredEnd > 0
        ? Math.min(configuredEnd, buffer.duration)
        : buffer.duration;

    // Yapılandırılan uzunluk ile DOSYANIN gerçek uzunluğu ayrışırsa bildir.
    //
    // Kelepçeleme tek başına yetmez çünkü SESSİZDİR: config 91 s derken dosya
    // 60 s ise parça sessizce erken sarar, tersi durumda bestenin bir bölümü
    // hiç duyulmaz. İki sayı ayrı yerlerde üretildiği için (config vs. üretim
    // script'i) bu ayrışma gerçek bir olasılıktır ve duyulmadan fark edilmez.
    if (configuredEnd !== undefined && Number.isFinite(configuredEnd) && configuredEnd > 0) {
      const drift = Math.abs(configuredEnd - buffer.duration);
      if (drift > LOOP_DURATION_TOLERANCE) {
        this.reportTimingMismatch({
          trackId: this.currentTrackId ?? '(bilinmiyor)',
          stemId: stem.id,
          configuredEnd,
          actualDuration: buffer.duration,
        });
      }
    }

    if (this.currentTrack?.loopStart !== undefined) {
      const configuredStart = this.currentTrack.loopStart;
      const start = Number.isFinite(configuredStart) ? configuredStart : 0;
      source.loopStart = Math.max(0, Math.min(start, loopEnd - 1e-3));
    }
    if (configuredEnd !== undefined && Number.isFinite(configuredEnd)) {
      source.loopEnd = loopEnd;
    }

    source.connect(gain);
    source.start(when, 0);

    const ownerTrackId = this.currentTrackId;

    source.onended = () => {
      const active = this.activeStems.get(channelId);
      try {
        source.disconnect();
        gain.disconnect();
      } catch {
        // Zaten ayrılmışsa görmezden gel
      } finally {
        this.activeStems.delete(channelId);
        this.mixer.removeChannel(channelId);
      }
      // Motorun kendi durdurduğu stem "parça bitti" saymaz; yalnızca sonuna
      // kadar çalıp kendiliğinden biten loop'suz stem sayar.
      if (active?.stoppedByEngine) return;
      if (ownerTrackId === undefined || ownerTrackId !== this.currentTrackId) return;
      try {
        this.notifyTrackEndIfDone(ownerTrackId);
      } catch (error) {
        // notifyTrackEndIfDone handler'ları çağırır; handler hatası
        // onended'yi patlatmamalı (Web Audio senkron çağırır, unhandled olur).
        console.error('[MusicEngine] trackEnd bildirimi sırasında hata:', error);
      }
    };

    this.activeStems.set(channelId, {
      stem,
      channelId,
      source,
      gain,
      buffer,
      startTime: when,
      trackId: ownerTrackId,
    });
  }

  /**
   * Çalan parça KENDİLİĞİNDEN bittiğinde çağrılır (stop/crossfade değil).
   * Playlist ilerlemesi buna bağlanır. Aboneliği kaldıran fonksiyon döner.
   */
  onTrackEnd(handler: (trackId: string) => void): () => void {
    this.trackEndHandlers.add(handler);
    return () => this.trackEndHandlers.delete(handler);
  }

  /** Parçanın tüm stem'leri bittiyse bitişi duyurur. */
  private notifyTrackEndIfDone(trackId: string): void {
    for (const active of this.activeStems.values()) {
      if (active.trackId === trackId && !active.stoppedByEngine) return;
    }
    this.isPlaying = false;
    this.currentTrackId = undefined;
    this.currentTrack = undefined;
    this.scheduler = undefined;
    for (const handler of [...this.trackEndHandlers]) {
      try {
        handler(trackId);
      } catch (error) {
        console.warn('[MusicEngine] onTrackEnd dinleyicisi hata verdi:', error);
      }
    }
  }

  private updateGains(fadeTime = 0.1, when?: number): void {
    if (!this.scheduler) return;

    const now = when ?? this.context.currentTime;

    for (const active of this.activeStems.values()) {
      if (active.fadingOut) continue;
      const targetGain = resolveStemGain(active.stem, this.state);
      this.mixer.setChannelGain(active.channelId, targetGain, fadeTime, now);
    }
  }
}
