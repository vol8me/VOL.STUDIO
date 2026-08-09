/** AudioContext + GainNode / panner / compressor master bus mixer.
 *  Her kaynak kendi kanalıyla bağlanır; böylece crossfade ve
 *  aynı stem id'li farklı track'ler çakışmaz.
 */
export class MusicMixer {
  private readonly channels = new Map<string, { gain: GainNode; panner?: StereoPannerNode }>();
  readonly masterGain: GainNode;
  readonly output: AudioNode;
  readonly compressor?: DynamicsCompressorNode;

  constructor(
    private readonly context: AudioContext,
    options: { compressor?: boolean } = {},
  ) {
    this.masterGain = context.createGain();
    this.masterGain.gain.value = 1;

    if (options.compressor !== false) {
      this.compressor = context.createDynamicsCompressor();
      this.compressor.threshold.value = -24;
      this.compressor.knee.value = 30;
      this.compressor.ratio.value = 12;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.25;
      this.masterGain.connect(this.compressor);
      this.output = this.compressor;
    } else {
      this.output = this.masterGain;
    }
  }

  /** Yeni bir kanal oluşturur. */
  createChannel(id: string, pan = 0): GainNode {
    if (this.channels.has(id)) {
      return this.channels.get(id)!.gain;
    }

    const gain = this.context.createGain();
    gain.gain.value = 0;

    const panner = this.createPanner(gain, pan);
    if (!panner) {
      gain.connect(this.masterGain);
    }
    this.channels.set(id, { gain, panner });
    return gain;
  }

  private createPanner(gain: GainNode, pan: number): StereoPannerNode | undefined {
    if (!('createStereoPanner' in this.context)) return undefined;
    const panner = (
      this.context as AudioContext & { createStereoPanner(): StereoPannerNode }
    ).createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    gain.connect(panner);
    panner.connect(this.masterGain);
    return panner;
  }

  /** Varolan kanalı döner. */
  getChannel(id: string): GainNode | undefined {
    return this.channels.get(id)?.gain;
  }

  /** Kanalı kaldırır. */
  removeChannel(id: string): void {
    const channel = this.channels.get(id);
    if (channel) {
      try {
        channel.gain.disconnect();
      } catch {
        // Zaten ayrılmışsa görmezden gel
      }
      try {
        channel.panner?.disconnect();
      } catch {
        // Zaten ayrılmışsa görmezden gel
      }
      this.channels.delete(id);
    }
  }

  /** Kanal gain'ini belirli bir zamanda hedefe getirir. */
  setChannelGain(id: string, value: number, fadeTime = 0.05, when?: number): void {
    const channel = this.channels.get(id);
    if (!channel) return;

    const now = when ?? this.context.currentTime;
    const clamped = Math.max(0, Math.min(1, value));
    if (fadeTime <= 0.001) {
      channel.gain.gain.cancelScheduledValues(now);
      channel.gain.gain.setValueAtTime(clamped, now);
    } else {
      channel.gain.gain.setTargetAtTime(clamped, now, fadeTime / 3);
    }
  }

  /** Master gain'i ayarlar. */
  setMasterGain(value: number, fadeTime = 0.05): void {
    const clamped = Math.max(0, Math.min(1, value));
    const now = this.context.currentTime;
    if (fadeTime <= 0.001) {
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(clamped, now);
    } else {
      this.masterGain.gain.setTargetAtTime(clamped, now, fadeTime / 3);
    }
  }

  /** Tüm çıkışı kapatır / açar. */
  mute(muted: boolean, fadeTime = 0.05): void {
    this.setMasterGain(muted ? 0 : 1, fadeTime);
  }

  /** Tüm kanalları kaldırır. */
  clear(): void {
    for (const [id, channel] of this.channels) {
      try {
        channel.gain.disconnect();
      } catch {
        // Zaten ayrılmışsa görmezden gel
      }
      try {
        channel.panner?.disconnect();
      } catch {
        // Zaten ayrılmışsa görmezden gel
      }
      this.channels.delete(id);
    }
  }
}
