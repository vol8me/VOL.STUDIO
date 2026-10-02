import { DisposableScope } from '../../lifecycle/DisposableScope';
import { StemLoader } from '../music/loader';
import { clamp, clamp01 } from '../../math/interpolation';
import { finiteOr, requireFinite } from '../../math/numeric';
import { createRandom, type Random } from '../../random/random';

export interface SoundBankOptions {
  /** Aynı anda çalabilecek toplam ses sayısı. */
  maxVoices?: number;
  /** Tek bir kimlik için eşzamanlı ses sayısı. */
  maxVoicesPerSound?: number;
  /** Aynı kimliğin iki tetiklemesi arasındaki en kısa süre (ms). */
  minRetriggerMs?: number;
  /** Varyant seçimi ve perde sapması için kaynak; verilmezse deterministiktir. */
  random?: Random;
}

export interface PlayOptions {
  /** Bu tetikleme için kazanç çarpanı [0,1]. */
  gain?: number;
  /** Oynatma hızı çarpanı; perdeyi de kaydırır. */
  rate?: number;
  /**
   * Perde sapmasının yarı genişliği (oran). 0.06 → her tetikleme
   * ±%6 arasında rastgele bir hızda çalar.
   */
  rateJitter?: number;
  /**
   * Stereo konum [-1 sol, 1 sağ]. Konumsal ses için tüketici dinleyiciye
   * göre hesaplar; tarayıcı `StereoPannerNode` taşımıyorsa yok sayılır.
   */
  pan?: number;
}

interface Voice {
  readonly id: string;
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  readonly panner: StereoPannerNode | null;
}

const DEFAULTS = {
  maxVoices: 24,
  maxVoicesPerSound: 4,
  minRetriggerMs: 0,
} as const;

/**
 * Varyantlı tek-atış ses bankası.
 *
 * Bir sesin TEK bir örneği, saniyede birkaç kez çalındığında makine gibi
 * okunur; canlı bir kaynakta iki tetikleme asla birebir aynı değildir. Banka
 * her kimlik için birden çok varyant taşır, aralarından seçer ve perdeyi
 * hafifçe kaydırır.
 *
 * Ses BÜTÇESİ iki kademelidir: kimlik başına ve toplam. Sınır dolduğunda EN
 * ESKİ ses düşürülür — sınırsız bir banka, yoğun bir karede onlarca üst üste
 * kaynak açıp hem clipping hem de duyulur bir gecikme üretir.
 *
 * CORE'da yaşar çünkü hiçbir oyun kelimesi taşımaz: kimlikler, dosyalar ve ne
 * zaman çalınacağı tüketicinin sözlüğüdür.
 */
export class SoundBank {
  private readonly context: AudioContext;
  private readonly loader: StemLoader;
  private readonly loading = new AbortController();
  private readonly busGain: GainNode;
  private readonly options: Required<Omit<SoundBankOptions, 'random'>>;
  private readonly random: Random;
  private readonly sources = new Map<string, readonly string[]>();
  private readonly buffers = new Map<string, AudioBuffer[]>();
  private readonly pending = new Map<string, Promise<void>>();
  private readonly lastPlayedAt = new Map<string, number>();
  /** Ekleme sırası korunur: en eski ses ilk düşürülendir. */
  private readonly voices = new Set<Voice>();
  private released = false;

  constructor(context: AudioContext, destination: AudioNode, options: SoundBankOptions = {}) {
    const maxVoices = requireFinite(options.maxVoices ?? DEFAULTS.maxVoices, 'maxVoices');
    const maxVoicesPerSound = requireFinite(
      options.maxVoicesPerSound ?? DEFAULTS.maxVoicesPerSound,
      'maxVoicesPerSound',
    );
    const minRetriggerMs = requireFinite(
      options.minRetriggerMs ?? DEFAULTS.minRetriggerMs,
      'minRetriggerMs',
    );
    if (
      !Number.isInteger(maxVoices) ||
      maxVoices < 1 ||
      !Number.isInteger(maxVoicesPerSound) ||
      maxVoicesPerSound < 1 ||
      minRetriggerMs < 0
    ) {
      throw new RangeError(
        'Ses bütçeleri pozitif tam sayı, tekrar süresi negatif olmayan sayı olmalı',
      );
    }
    this.context = context;
    this.loader = new StemLoader(context);
    this.busGain = context.createGain();
    try {
      this.busGain.connect(destination);
    } catch (error) {
      // Constructor tamamlanamadı; sahipliğe geçmeden edinilen düğüm
      // bağlantısız kalmamalı.
      this.disconnectQuietly(this.busGain);
      throw error;
    }
    this.options = {
      maxVoices,
      maxVoicesPerSound,
      minRetriggerMs,
    };
    this.random = options.random ?? createRandom();
  }

  /** Bir kimliği varyant URL'lerine bağlar. Yükleme `load()` ile yapılır. */
  register(id: string, urls: readonly string[]): void {
    if (urls.length === 0) throw new Error(`SoundBank: "${id}" için en az bir varyant gerekli`);
    this.sources.set(id, [...urls]);
  }

  /** Kayıtlı tüm sesleri yükler; bir varyantın düşmesi diğerlerini engellemez. */
  async loadAll(): Promise<void> {
    await Promise.all([...this.sources.keys()].map((id) => this.load(id)));
  }

  /**
   * Bir kimliğin varyantlarını yükler. Aynı kimliğe eşzamanlı çağrılar TEK bir
   * yüklemede birleşir; aksi halde ilk karede tetiklenen birkaç çağrı aynı
   * dosyayı defalarca indirirdi.
   */
  async load(id: string): Promise<void> {
    if (this.released || this.buffers.has(id)) return;
    const urls = this.sources.get(id);
    if (!urls) return;

    const existing = this.pending.get(id);
    if (existing) return existing;

    const task = this.decodeVariants(id, urls).finally(() => this.pending.delete(id));
    this.pending.set(id, task);
    return task;
  }

  /** Yüklü mü? Yüklenmemiş bir kimlik sessizce atlanır. */
  isLoaded(id: string): boolean {
    return (this.buffers.get(id)?.length ?? 0) > 0;
  }

  /** Ses yolunun genel seviyesi [0,1]. */
  setBusVolume(value: number): void {
    if (this.released) return;
    const now = finiteOr(this.context.currentTime, 0);
    this.busGain.gain.setValueAtTime(clamp01(finiteOr(value, 0)), now);
  }

  /**
   * Bir sesi çalar. Yüklü değilse ya da bütçe doluysa sessizce atlanır —
   * ses, oynanışı durdurmaya değmeyecek bir yan üründür.
   */
  play(id: string, options: PlayOptions = {}): void {
    if (this.released) return;
    const variants = this.buffers.get(id);
    if (!variants || variants.length === 0) return;

    const now = finiteOr(this.context.currentTime, 0) * 1000;
    const last = this.lastPlayedAt.get(id);
    if (last !== undefined && now - last < this.options.minRetriggerMs) return;

    this.enforceBudget(id);

    const index = Math.min(variants.length - 1, Math.floor(this.random.next() * variants.length));
    const buffer = variants[index];
    if (!buffer) return;
    const jitter = Math.max(0, finiteOr(options.rateJitter ?? 0, 0));
    const rate = clamp(
      finiteOr(options.rate ?? 1, 1) * (1 + this.random.bipolar() * jitter),
      0.05,
      8,
    );

    this.createVoice(
      id,
      buffer,
      rate,
      clamp01(finiteOr(options.gain ?? 1, 1)),
      clamp(finiteOr(options.pan ?? 0, 0), -1, 1),
    );
    this.lastPlayedAt.set(id, now);
  }

  /**
   * Bir ses zincirini kurar. Düğümler EDİNİLDİĞİ AN sahipliğe alınır: kurulumun
   * hangi adımda kırılırsa kırılsın, scope hepsini ters sırada söküp hatayı
   * yeniden fırlatır. Ses yalnız `start()` geçtiğinde voice sahipliğine geçer.
   */
  private createVoice(
    id: string,
    buffer: AudioBuffer,
    rate: number,
    gainValue: number,
    pan: number,
  ): Voice {
    const staging = new DisposableScope();
    const own = <T extends AudioNode>(node: T): T => {
      staging.add({ dispose: () => this.disconnectQuietly(node) });
      return node;
    };

    try {
      const source = own(this.context.createBufferSource());
      source.buffer = buffer;
      source.playbackRate.value = rate;

      const gain = own(this.context.createGain());
      gain.gain.value = gainValue;
      source.connect(gain);

      const panner =
        pan !== 0 && typeof this.context.createStereoPanner === 'function'
          ? own(this.context.createStereoPanner())
          : null;
      if (panner) {
        panner.pan.value = pan;
        gain.connect(panner);
        panner.connect(this.busGain);
      } else {
        gain.connect(this.busGain);
      }

      // Başlatılamayan bir node bütçeyi sonsuza dek işgal etmemeli. Hata
      // çağırana bırakılır; oyun katmanı sesi isteğe bağlı yan ürün olarak
      // izole edebilir.
      source.start();

      const voice: Voice = { id, source, gain, panner };
      this.voices.add(voice);
      source.onended = () => this.retire(voice);
      return voice;
    } catch (error) {
      staging.dispose();
      throw error;
    }
  }

  /** Çalan tüm sesleri anında durdurur (sahne geçişi, duraklatma). */
  stopAll(): void {
    for (const voice of [...this.voices]) this.retire(voice, true);
  }

  dispose(): void {
    if (this.released) return;
    this.released = true;
    this.loading.abort();
    this.stopAll();
    this.disconnectQuietly(this.busGain);
    this.buffers.clear();
    this.sources.clear();
    this.pending.clear();
    this.lastPlayedAt.clear();
  }

  private async decodeVariants(id: string, urls: readonly string[]): Promise<void> {
    const decoded = await Promise.all(
      urls.map(async (url) => {
        try {
          return await this.loader.loadFromUrl(url, { signal: this.loading.signal });
        } catch (error) {
          if (!this.released)
            console.warn(`[SoundBank] "${id}" varyantı yüklenemedi: ${url}`, error);
          return null;
        }
      }),
    );
    const buffers = decoded.filter((buffer): buffer is AudioBuffer => buffer !== null);
    if (!this.released && buffers.length > 0) this.buffers.set(id, buffers);
  }

  /** Bütçeyi açar: önce aynı kimlikten, gerekirse genelden en eskiyi düşürür. */
  private enforceBudget(id: string): void {
    let sameId = 0;
    for (const voice of this.voices) if (voice.id === id) sameId++;
    while (sameId >= this.options.maxVoicesPerSound) {
      const oldest = [...this.voices].find((voice) => voice.id === id);
      if (!oldest) break;
      this.retire(oldest, true);
      sameId--;
    }
    while (this.voices.size >= this.options.maxVoices) {
      const oldest = this.voices.values().next().value;
      if (!oldest) break;
      this.retire(oldest, true);
    }
  }

  private retire(voice: Voice, stop = false): void {
    if (!this.voices.delete(voice)) return;
    voice.source.onended = null;
    if (stop) this.stopQuietly(voice.source);
    const scope = new DisposableScope();
    scope.add({ dispose: () => this.disconnectQuietly(voice.source) });
    scope.add({ dispose: () => this.disconnectQuietly(voice.gain) });
    if (voice.panner) scope.add({ dispose: () => this.disconnectQuietly(voice.panner!) });
    scope.dispose();
  }

  /**
   * Bir kaynağı susturur. Henüz başlamamış ya da bitmiş bir kaynak `stop()`ta
   * fırlatabilir; temizlik bunun için durmamalı.
   */
  private stopQuietly(source: AudioBufferSourceNode): void {
    try {
      source.stop();
    } catch {
      // Bkz. yukarıdaki açıklama.
    }
  }

  /** Bir düğümü çözer. Bozuk bir düğüm, diğerlerinin temizliğini durdurmaz. */
  private disconnectQuietly(node: AudioNode): void {
    try {
      node.disconnect();
    } catch {
      // Bkz. yukarıdaki açıklama.
    }
  }
}
