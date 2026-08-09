import type { MusicScheduler } from './scheduler';
import type { Instrument, MelodicPhrase } from './instrument';

/** `MelodicEngine` çalma seçenekleri. */
export interface MelodicPlayOptions {
  /** Çalınacağı AudioContext zamanı. Verilmezse hemen. */
  when?: number;
  /** Track zamanı içinde hangi beat'te başlayacağı. `when` ile beraber verilmez. */
  beat?: number;
  /** Gain (0-1). Varsayılan 1. */
  gain?: number;
  /** Loop yapar mı? Varsayılan false. */
  loop?: boolean;
}

/** `MusicEngine` için melodik fraze çalıcı.
 *  `Instrument` şablonlarını alır, bar/beat grid'e hizalar ve `AudioContext` üzerinde buffer olarak çalar.
 */
export class MelodicEngine {
  private readonly context: AudioContext;
  private readonly destination: AudioNode;
  private scheduler?: MusicScheduler;
  private trackStartTime = 0;
  private readonly sources = new Set<AudioBufferSourceNode>();
  private readonly gains = new Set<GainNode>();

  constructor(context: AudioContext, destination: AudioNode) {
    this.context = context;
    this.destination = destination;
  }

  /** Bağlı olduğu `MusicScheduler` ve track başlangıç zamanını ayarlar. */
  setScheduler(scheduler: MusicScheduler | undefined, trackStartTime: number): void {
    this.scheduler = scheduler;
    this.trackStartTime = trackStartTime;
  }

  /** Bir fraze enstrümanla çalar veya planlar.
   *  Eğer track aktifse `beat` bar/beat grid'e göre hesaplanır.
   */
  playPhrase(
    phrase: MelodicPhrase,
    instrument: Instrument,
    options: MelodicPlayOptions = {},
  ): number {
    const result = instrument.renderPhrase(phrase);
    const buffer = this.toAudioBuffer(result);
    const when = this.resolveWhen(options);

    const gainNode = this.context.createGain();
    gainNode.gain.setValueAtTime(0, when);
    gainNode.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, options.gain ?? 1)), when + 0.01);
    gainNode.connect(this.destination);
    this.gains.add(gainNode);

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = options.loop ?? false;
    source.connect(gainNode);
    source.start(when, 0);
    this.sources.add(source);

    source.onended = () => {
      this.sources.delete(source);
      gainNode.disconnect();
      this.gains.delete(gainNode);
    };

    return when;
  }

  /** Track'in şu anki bağlamına göre en uygun beat sınırında zaman döner. */
  getNextBeatTime(beat: number): number {
    if (!this.scheduler) return this.context.currentTime + beat * this.beatDuration(60);

    const now = this.context.currentTime;
    const beatDuration = this.scheduler.beatDuration;
    const targetTime = this.trackStartTime + beat * beatDuration;
    if (targetTime >= now) return targetTime;

    // Track zaten ilerlediyse şu anki beat'ten sonraki ilk sınırda başla.
    const elapsed = Math.max(0, now - this.trackStartTime);
    const nextBeat = Math.ceil(elapsed / beatDuration);
    return this.trackStartTime + nextBeat * beatDuration;
  }

  /** Tüm aktif melodik kaynakları durdurur. */
  stopAll(fadeOut = 0.1): void {
    const now = this.context.currentTime;
    for (const gain of this.gains) {
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + fadeOut);
    }
    const stopTime = now + fadeOut;
    for (const source of this.sources) {
      try {
        source.stop(stopTime);
      } catch {
        // ignore
      }
    }
  }

  private resolveWhen(options: MelodicPlayOptions): number {
    if (options.when !== undefined) return options.when;
    if (options.beat !== undefined && this.scheduler) {
      return this.getNextBeatTime(options.beat);
    }
    return this.context.currentTime + 0.01;
  }

  private toAudioBuffer(result: { channels: Float32Array[]; sampleRate: number }): AudioBuffer {
    const buffer = this.context.createBuffer(
      result.channels.length,
      result.channels[0]?.length ?? 0,
      result.sampleRate,
    );
    for (let i = 0; i < result.channels.length; i++) {
      const channel = buffer.getChannelData(i);
      const data = result.channels[i];
      for (let j = 0; j < data.length; j++) {
        channel[j] = data[j]!;
      }
    }
    return buffer;
  }

  private beatDuration(bpm: number): number {
    return 60 / bpm;
  }
}
