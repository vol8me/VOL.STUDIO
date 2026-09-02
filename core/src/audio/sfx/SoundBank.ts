import { StemLoader } from '../music/loader';
import { clamp, clamp01 } from '../../math/interpolation';
import { finiteOr } from '../../math/numeric';
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
}

interface Voice {
  readonly id: string;
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
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
    this.context = context;
    this.loader = new StemLoader(context);
    this.busGain = context.createGain();
    this.busGain.connect(destination);
    this.options = {
      maxVoices: Math.max(1, Math.floor(options.maxVoices ?? DEFAULTS.maxVoices)),
      maxVoicesPerSound: Math.max(
        1,
        Math.floor(options.maxVoicesPerSound ?? DEFAULTS.maxVoicesPerSound),
      ),
      minRetriggerMs: Math.max(0, options.minRetriggerMs ?? DEFAULTS.minRetriggerMs),
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

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;

    const gain = this.context.createGain();
    gain.gain.value = clamp01(finiteOr(options.gain ?? 1, 1));
    source.connect(gain);
    gain.connect(this.busGain);

    const voice: Voice = { id, source, gain };
    this.voices.add(voice);
    source.onended = () => this.retire(voice);
    try {
      source.start();
    } catch (error) {
      // Başlatılamayan bir node bütçeyi sonsuza dek işgal etmemeli. Hata
      // çağırana bırakılır; oyun katmanı sesi isteğe bağlı yan ürün olarak
      // izole edebilir.
      this.retire(voice);
      throw error;
    }
    this.lastPlayedAt.set(id, now);
  }

  /** Çalan tüm sesleri anında durdurur (sahne geçişi, duraklatma). */
  stopAll(): void {
    for (const voice of [...this.voices]) this.retire(voice, true);
  }

  dispose(): void {
    if (this.released) return;
    this.released = true;
    this.stopAll();
    this.busGain.disconnect();
    this.buffers.clear();
    this.sources.clear();
    this.pending.clear();
    this.lastPlayedAt.clear();
  }

  private async decodeVariants(id: string, urls: readonly string[]): Promise<void> {
    const decoded: AudioBuffer[] = [];
    for (const url of urls) {
      try {
        decoded.push(await this.loader.loadFromUrl(url));
      } catch (error) {
        // Bir varyantın düşmesi sesi tamamen susturmamalı; kalanlarla devam.
        console.warn(`[SoundBank] "${id}" varyantı yüklenemedi: ${url}`, error);
      }
    }
    if (!this.released && decoded.length > 0) this.buffers.set(id, decoded);
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
    if (stop) {
      try {
        voice.source.stop();
      } catch {
        // Henüz başlamamış ya da bitmiş bir kaynak `stop()`ta fırlatabilir;
        // temizlik bunun için durmamalı.
      }
    }
    voice.source.disconnect();
    voice.gain.disconnect();
  }
}
