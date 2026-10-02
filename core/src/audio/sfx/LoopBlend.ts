import { DisposableScope } from '../../lifecycle/DisposableScope';
import { StemLoader } from '../music/loader';
import { clamp, clamp01 } from '../../math/interpolation';
import { finiteOr, requireFinite } from '../../math/numeric';

export interface LoopBlendLayer {
  readonly url: string;
  /** Katmanın karışım eksenindeki yeri [0, 1] (ör. rölanti 0, tam devir 1). */
  readonly at: number;
  /** Üretildiği perde; hedef perde aynı birimle verilir. */
  readonly pitch?: number;
}

export interface LoopBlendOptions {
  /**
   * Kazanç, hız, pan ve karışım değişimlerinin zaman sabiti (s). Parametreler
   * her karede güncellenir; yumuşatma olmadan adım adım değişen kazanç
   * duyulur tıklar üretir.
   */
  smoothingSeconds?: number;
}

interface LayerVoice {
  readonly at: number;
  readonly pitch: number | undefined;
  readonly buffer: AudioBuffer;
  readonly gain: GainNode;
  source: AudioBufferSourceNode | null;
}

const DEFAULT_SMOOTHING_SECONDS = 0.06;

/** Düğümü `scope`'a bağlar; scope kapanırken bağlantısı sessizce çözülür. */
function ownNode<T extends AudioNode>(scope: DisposableScope, node: T): T {
  scope.add({ dispose: () => disconnectQuietly(node) });
  return node;
}

/** Bozuk bir düğüm, diğerlerinin temizliğini durdurmaz. */
function disconnectQuietly(node: AudioNode): void {
  try {
    node.disconnect();
  } catch {
    // Bkz. yukarıdaki açıklama.
  }
}

/**
 * Eşit güçlü çapraz geçiş ağırlıkları. `level` iki komşu katmanın arasında
 * cos/sin ile paylaşılır (toplam güç sabit); uçların ötesi uçtaki katmandır.
 * `positions` artan sırada olmalıdır.
 */
export function loopBlendWeights(positions: readonly number[], level: number): number[] {
  const weights = positions.map(() => 0);
  if (positions.length === 0) return weights;
  const x = finiteOr(level, 0);
  if (x <= positions[0]) {
    weights[0] = 1;
    return weights;
  }
  const last = positions.length - 1;
  if (x >= positions[last]) {
    weights[last] = 1;
    return weights;
  }
  for (let index = 0; index < last; index++) {
    const from = positions[index];
    const to = positions[index + 1];
    if (x < from || x > to) continue;
    const t = to > from ? (x - from) / (to - from) : 0;
    weights[index] = Math.cos((t * Math.PI) / 2);
    weights[index + 1] = Math.sin((t * Math.PI) / 2);
    return weights;
  }
  return weights;
}

/** Eşit güçlü karışan döngüler; hedef perde katman başına üretim perdesine oranlanır. */
export class LoopBlend {
  private readonly loader: StemLoader;
  private readonly loading = new AbortController();
  private readonly output: GainNode;
  private readonly panner: StereoPannerNode | null;
  private readonly smoothing: number;
  private layers: LayerVoice[] = [];
  private pending: Promise<void> | null = null;
  private level = 0;
  private rate = 1;
  private pitch: number | null = null;
  private playing = false;
  private released = false;

  constructor(
    private readonly context: AudioContext,
    destination: AudioNode,
    private readonly sources: readonly LoopBlendLayer[],
    options: LoopBlendOptions = {},
  ) {
    if (sources.length === 0) throw new Error('LoopBlend: en az bir katman gerekli');
    for (const layer of sources) {
      requireFinite(layer.at, 'LoopBlend at');
      if (layer.at < 0 || layer.at > 1) throw new RangeError('LoopBlend at [0, 1] içinde olmalı');
    }
    if (
      sources.some(
        (layer) => layer.pitch !== undefined && (!Number.isFinite(layer.pitch) || layer.pitch <= 0),
      )
    ) {
      throw new Error('LoopBlend: pitch sonlu ve pozitif olmalı');
    }
    this.smoothing = requireFinite(
      options.smoothingSeconds ?? DEFAULT_SMOOTHING_SECONDS,
      'LoopBlend smoothingSeconds',
    );
    if (this.smoothing <= 0) throw new RangeError('LoopBlend smoothingSeconds pozitif olmalı');
    this.loader = new StemLoader(context);
    // Çıkış zinciri kurulurken hata olursa yarım kalan düğümler sahipsiz
    // kalmasın diye hepsi tek scope'ta toplanır.
    const staging = new DisposableScope();
    let output: GainNode;
    let panner: StereoPannerNode | null;
    try {
      output = ownNode(staging, context.createGain());
      output.gain.value = 0;
      panner =
        typeof context.createStereoPanner === 'function'
          ? ownNode(staging, context.createStereoPanner())
          : null;
      if (panner) {
        output.connect(panner);
        panner.connect(destination);
      } else {
        output.connect(destination);
      }
    } catch (error) {
      staging.dispose();
      throw error;
    }
    this.output = output;
    this.panner = panner;
  }

  get loaded(): boolean {
    return this.layers.length > 0;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** Katmanları çözer; düşen katman atlanır, kalanlarla karışım sürer. */
  load(): Promise<void> {
    if (this.released || this.loaded) return Promise.resolve();
    this.pending ??= this.loadLayers().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async loadLayers(): Promise<void> {
    const ordered = [...this.sources].sort((a, b) => a.at - b.at);
    const decoded = await Promise.all(
      ordered.map(async (layer) => {
        try {
          const buffer = await this.loader.loadFromUrl(layer.url, { signal: this.loading.signal });
          return { ...layer, buffer };
        } catch (error) {
          if (!this.released) console.warn(`[LoopBlend] katman yüklenemedi: ${layer.url}`, error);
          return null;
        }
      }),
    );
    if (this.released) return;
    // Katman kazançları EDİNİLDİĞİ AN sahipliğe alınır: ikinci bir kurulum
    // kırılırsa ilk katman da bağlantısız bırakılmaz.
    const staging = new DisposableScope();
    let layers: LayerVoice[];
    try {
      layers = decoded.flatMap((layer): LayerVoice[] => {
        if (!layer) return [];
        const gain = ownNode(staging, this.context.createGain());
        gain.gain.value = 0;
        gain.connect(this.output);
        return [
          {
            at: clamp01(layer.at),
            pitch: layer.pitch,
            buffer: layer.buffer,
            gain,
            source: null,
          },
        ];
      });
    } catch (error) {
      staging.dispose();
      throw error;
    }
    this.layers = layers;
    this.applyWeights(true);
    if (this.playing) this.startSources();
  }

  /** Döngüyü başlatır; yükleme bitmediyse yükleme bitince başlar. */
  start(): void {
    if (this.released || this.playing) return;
    this.playing = true;
    this.startSources();
  }

  stop(): void {
    this.playing = false;
    for (const layer of this.layers) this.stopSource(layer);
  }

  /** Karışım eksenindeki konum [0, 1]. */
  setLevel(level: number): void {
    this.level = clamp01(finiteOr(level, 0));
    this.applyWeights(false);
  }

  /** Genel kazanç [0, 1]. */
  setGain(value: number): void {
    this.ramp(this.output.gain, clamp01(finiteOr(value, 0)));
  }

  /** Bütün katmanların çalma hızı (perde) çarpanı. */
  setRate(value: number): void {
    this.pitch = null;
    this.rate = clamp(finiteOr(value, 1), 0.25, 4);
    for (const layer of this.layers) {
      if (layer.source) this.ramp(layer.source.playbackRate, this.rate);
    }
  }

  /** Hedef perde; üretim perdesi tanımlı katmanların hızı [0.5, 2] ile sınırlıdır. */
  setPitch(value: number): void {
    if (this.released || !Number.isFinite(value) || value <= 0) return;
    this.pitch = value;
    for (const layer of this.layers) {
      if (layer.source) this.ramp(layer.source.playbackRate, this.layerRate(layer));
    }
  }

  /** Stereo konum [-1 sol, 1 sağ]; panner yoksa yok sayılır. */
  setPan(value: number): void {
    if (this.panner) this.ramp(this.panner.pan, clamp(finiteOr(value, 0), -1, 1));
  }

  dispose(): void {
    if (this.released) return;
    this.released = true;
    this.loading.abort();
    this.stop();
    const scope = new DisposableScope();
    for (const layer of this.layers) ownNode(scope, layer.gain);
    ownNode(scope, this.output);
    if (this.panner) ownNode(scope, this.panner);
    scope.dispose();
    this.layers = [];
  }

  private startSources(): void {
    try {
      for (const layer of this.layers) {
        if (layer.source) continue;
        const source = this.context.createBufferSource();
        layer.source = source;
        source.buffer = layer.buffer;
        source.loop = true;
        source.playbackRate.value = this.layerRate(layer);
        source.connect(layer.gain);
        source.start();
      }
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  private layerRate(layer: LayerVoice): number {
    return this.pitch !== null && layer.pitch !== undefined
      ? clamp(this.pitch / layer.pitch, 0.5, 2)
      : this.rate;
  }

  private stopSource(layer: LayerVoice): void {
    const source = layer.source;
    if (!source) return;
    layer.source = null;
    try {
      source.stop();
    } catch {
      // Başlamamış kaynak `stop()`ta fırlatabilir; söküm bunun için durmaz.
    }
    disconnectQuietly(source);
  }

  private applyWeights(immediate: boolean): void {
    const weights = loopBlendWeights(
      this.layers.map((layer) => layer.at),
      this.level,
    );
    this.layers.forEach((layer, index) => {
      const weight = weights[index] ?? 0;
      if (immediate) layer.gain.gain.value = weight;
      else this.ramp(layer.gain.gain, weight);
    });
  }

  private ramp(param: AudioParam, value: number): void {
    if (this.released) return;
    const now = finiteOr(this.context.currentTime, 0);
    param.setTargetAtTime(value, now, this.smoothing);
  }
}
