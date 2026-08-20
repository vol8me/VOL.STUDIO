/** AudioContext + GainNode / panner / compressor master bus mixer.
 *  Her kaynak kendi kanalıyla bağlanır; böylece crossfade ve
 *  aynı stem id'li farklı track'ler çakışmaz.
 */
/**
 * Bir AudioParam'ı hedefe lineer rampa ile götürür.
 *
 * `setTargetAtTime` üstel olduğundan hedefe asla varmaz: `fadeTime` sonunda
 * hedefin yalnızca %95'ine gelinir; fade-out'ta kaynak −26 dB'deyken kesilirse
 * duyulur tık oluşur. Lineer rampa hedefe tam varır.
 *
 * `cancelAndHoldAtTime` varsa kullanılır; gelecekteki bir ana zamanlanan
 * geçişte o andaki değeri sabitleyip oradan rampalamak gerekir.
 */
function rampParam(param: AudioParam, value: number, when: number, fadeTime: number): void {
  if (fadeTime <= 0.001) {
    param.cancelScheduledValues(when);
    param.setValueAtTime(value, when);
    return;
  }

  const holdable = param as AudioParam & { cancelAndHoldAtTime?: (t: number) => void };
  if (typeof holdable.cancelAndHoldAtTime === 'function') {
    holdable.cancelAndHoldAtTime(when);
  } else {
    param.cancelScheduledValues(when);
    param.setValueAtTime(param.value, when);
  }
  param.linearRampToValueAtTime(value, when + fadeTime);
}

export class MusicMixer {
  private readonly channels = new Map<string, { gain: GainNode; panner?: StereoPannerNode }>();
  readonly masterGain: GainNode;
  readonly output: AudioNode;
  readonly compressor?: DynamicsCompressorNode;
  /** Sustur/aç için saklanan seviye — mute(false) buraya döner, 1.0'a değil. */
  private unmutedGain = 1;
  private muted = false;

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

  /** Kanal gain'ini belirli bir zamanda hedefe getirir. Rampa hedefe tam varır. */
  setChannelGain(id: string, value: number, fadeTime = 0.05, when?: number): void {
    const channel = this.channels.get(id);
    if (!channel) return;

    const now = when ?? this.context.currentTime;
    rampParam(channel.gain.gain, Math.max(0, Math.min(1, value)), now, fadeTime);
  }

  /** Master gain'i ayarlar. Sustur/aç bu değeri hatırlar. */
  setMasterGain(value: number, fadeTime = 0.05): void {
    const clamped = Math.max(0, Math.min(1, value));
    this.unmutedGain = clamped;
    if (this.muted) return;
    rampParam(this.masterGain.gain, clamped, this.context.currentTime, fadeTime);
  }

  /**
   * Tüm çıkışı kapatır / açar.
   *
   * Açarken ayarlanan seviyeye (`unmutedGain`) döner; son master gain değeri korunur.
   */
  mute(muted: boolean, fadeTime = 0.05): void {
    this.muted = muted;
    rampParam(
      this.masterGain.gain,
      muted ? 0 : this.unmutedGain,
      this.context.currentTime,
      fadeTime,
    );
  }

  /** Sustur/aç dışındaki ayarlanmış master seviyesi. */
  getMasterGain(): number {
    return this.unmutedGain;
  }

  /** Tüm kanalları kaldırır. */
  clear(): void {
    for (const channel of this.channels.values()) {
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
    }
    this.channels.clear();
  }
}
