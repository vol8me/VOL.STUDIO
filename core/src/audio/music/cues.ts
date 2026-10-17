import type { MusicMixer } from './mixer';
import type { StemLoader } from './loader';
import type { MusicCue } from './types';

interface ActiveCue {
  readonly channelId: string;
  readonly source: AudioBufferSourceNode;
  /** Motor durdurdu: doğal bitiş bildirimi yapılmaz. */
  cancelled: boolean;
}

/**
 * Tek seferlik cue'ların (giriş, bitiş, stinger, geçiş) yükleyicisi ve
 * oynatıcısı. Loop stem'lerinden ayrı tutulur: cue döngüye girmez, gain
 * haritası almaz ve state değişiminden etkilenmez; motor yalnız NE ZAMAN
 * çalacağına karar verir.
 */
export class MusicCuePlayer {
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly active = new Map<string, ActiveCue>();
  private readonly loadController = new AbortController();
  private counter = 0;

  constructor(
    private readonly context: AudioContext,
    private readonly mixer: MusicMixer,
    private readonly loader: StemLoader,
  ) {}

  /** Önbellek anahtarı stem'lerle aynı kural: `src` içerik, `buffer` parça kapsamlı. */
  private key(trackId: string, cue: MusicCue): string {
    return cue.src ? `src:${cue.src}` : `cue:${trackId}:${cue.id}`;
  }

  /** Cue'yu yükler; başarısızlık parçayı düşürmez, yalnız o cue çalınamaz. */
  async load(trackId: string, cue: MusicCue): Promise<boolean> {
    const { signal } = this.loadController;
    if (signal.aborted) return false;
    const key = this.key(trackId, cue);
    if (this.buffers.has(key)) return true;
    try {
      if (cue.buffer) this.buffers.set(key, cue.buffer);
      else if (cue.src) {
        const buffer = await this.loader.loadFromUrl(cue.src, { signal });
        if (signal.aborted) return false;
        this.buffers.set(key, buffer);
      } else return false;
      return true;
    } catch (err) {
      if (signal.aborted) return false;
      console.warn(`[MusicEngine] Cue yüklenemedi: ${cue.id}`, err);
      return false;
    }
  }

  has(trackId: string, cue: MusicCue): boolean {
    return this.buffers.has(this.key(trackId, cue));
  }

  /** Cue'yu `when` anında bir kez başlatır; bitişte `onEnded` çağrılır. */
  start(trackId: string, cue: MusicCue, when: number, gain: number, onEnded?: () => void): void {
    const buffer = this.buffers.get(this.key(trackId, cue));
    if (!buffer) throw new Error(`Cue yüklenmemiş: ${cue.id}`);
    const channelId = `cue:${cue.id}__${this.counter++}`;
    const channel = this.mixer.createChannel(channelId);
    channel.gain.setValueAtTime(gain, when);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = false;
    source.connect(channel);
    source.start(when, 0);
    const active: ActiveCue = { channelId, source, cancelled: false };
    source.onended = () => {
      try {
        source.disconnect();
        channel.disconnect();
      } catch {
        // Zaten ayrılmışsa görmezden gel
      } finally {
        this.active.delete(channelId);
        this.mixer.removeChannel(channelId);
      }
      if (!active.cancelled) onEnded?.();
    };
    this.active.set(channelId, active);
  }

  /** Çalan bütün cue'ları `fadeOut` içinde söndürüp keser; kesilen cue bitiş bildirmez. */
  stopAll(now: number, fadeOut = 0): void {
    for (const cue of this.active.values()) {
      cue.cancelled = true;
      this.mixer.setChannelGain(cue.channelId, 0, fadeOut, now);
      try {
        cue.source.stop(now + fadeOut);
      } catch {
        // Zaten durdurulmuşsa görmezden gel
      }
    }
  }

  dispose(): void {
    if (this.loadController.signal.aborted) return;
    this.loadController.abort();
    this.stopAll(0);
    for (const cue of this.active.values()) this.mixer.removeChannel(cue.channelId);
    this.active.clear();
    this.buffers.clear();
  }
}
