import { synthesize } from '../engine';
import { checkNumber, checkSampleRate } from '../guard/read';
import type { SynthParams, SynthesisResult } from '../types';
import type { LoudnessOptions } from './loudness';
import { addVoice, createMix, masterMix, stableJitter } from './mix';
import { noteToHz } from './pitch';

/**
 * Çok sesli, çok enstrümanlı, MUTLAK ZAMANLI düzenleme yüzeyi.
 *
 * `compose` bunu yapamaz ve yapmaya çalışmaz: notaları art arda dizer, tek
 * preset kullanır ve mono döner. Akor kurmak, iki enstrümanı üst üste
 * çalmak ya da bir sesi diğerinin ortasında başlatmak orada mümkün değildir.
 * Bir müzik betiği yazan herkes bu karıştırıcıyı yeniden yazıyordu.
 *
 * Zaman ölçü/vuruş cinsinden verilir ve saniyeye burada çevrilir; nota
 * yerleşimini saniyeyle düşünmek insanın da agent'ın da hata yaptığı yerdir.
 */

/** Bir presetin çağrı imzası: frekans ve süre alır, parametre döner. */
export type InstrumentFn = (frequency?: number, duration?: number) => SynthParams;

export interface NoteEvent {
  /** Hangi enstrüman çalacak. */
  instrument: InstrumentFn;
  /** Nota adı (`'D4'`, `'A#2'`). */
  note: string;
  /** Ölçü numarası, 0 tabanlı. */
  bar: number;
  /** Ölçü içindeki vuruş, 0 tabanlı. Kesirli olabilir (`1.5` = ikinci vuruşun ortası). */
  beat?: number;
  /** Nota süresi, vuruş cinsinden. */
  beats: number;
  /** Şiddet (0-1). Presetin kendi `gain`i ile ÇARPILIR, onun yerine geçmez. */
  gain?: number;
  /** Stereo yerleşim: −1 sol, 0 orta, 1 sağ. */
  pan?: number;
}

export interface TimelineOptions {
  bpm: number;
  /** Ölçüdeki vuruş sayısı. */
  beatsPerBar: number;
  sampleRate?: number;
  /**
   * İnsanlaştırma tohumu.
   *
   * Birebir aynı zamanda ve şiddette çalan notalar mekanik duyulur; küçük
   * sapmalar bunu kırar. Sapma TOHUMLU bir üreteçten gelir, yani çıktı yine
   * deterministiktir — aynı düzenleme her koşuda aynı örnekleri verir.
   */
  humanizeSeed?: number;
  /** Zamanlama sapmasının vuruş cinsinden genliği. 0 = kapalı. */
  timingJitter?: number;
  /** Şiddet sapmasının oransal genliği. 0 = kapalı. */
  velocityJitter?: number;
}

export interface RenderOptions extends LoudnessOptions {
  /** Son notadan sonra bırakılacak pay (saniye). */
  tailSeconds?: number;
  /**
   * Sondaki sessizlik kırpılsın mı? Varsayılan `true`.
   *
   * `tailSeconds` payı en uzun notanın bitişine göre verilir, ama motor her
   * notanın reverb kuyruğunu kendi süresinde keser — pay çoğu zaman tümüyle
   * boş kalır (ölçüldü: bir parçada sonda 4 saniye tam sessizlik). Kırpılan
   * aralık yükseklik ölçümüne GİRMEZ.
   */
  trimSilence?: boolean;
  /**
   * Dikişsiz loop: tampon tam `loopBars` ölçü sürer, sonu aşan kuyruklar
   * başa sarılır; sessizlik kırpılmaz ve son sönüm uygulanmaz.
   */
  loopBars?: number;
}

/** Kırpma eşiği: mix tepesinin −56 dB altı (eski mutlak 0.0015 ≈ 0.95 tavanda). */
const AUDIBLE_FLOOR_RELATIVE = Math.pow(10, -56 / 20);

/** Son duyulur örnekten sonra bırakılan pay (saniye). */
const TRIM_MARGIN_SECONDS = 0.35;

/** Mix'in DC'si son adımda temizlenir (tarihî master kuralı). */
const MASTER_DC_BLOCK_HZ = 20;

/** Tampon sonundaki tıkı önleyen sönüş. */
const END_FADE_SECONDS = 0.04;

export class Timeline {
  private readonly events: NoteEvent[] = [];
  private readonly humanizeSeed: number;
  readonly bpm: number;
  readonly beatsPerBar: number;
  readonly sampleRate: number;
  private readonly timingJitter: number;
  private readonly velocityJitter: number;

  constructor(options: TimelineOptions) {
    if (!Number.isFinite(options.bpm) || options.bpm <= 0) {
      throw new TypeError('bpm pozitif ve sonlu olmalı');
    }
    if (!Number.isFinite(options.beatsPerBar) || options.beatsPerBar <= 0) {
      throw new TypeError('beatsPerBar pozitif ve sonlu olmalı');
    }
    this.bpm = options.bpm;
    this.beatsPerBar = options.beatsPerBar;
    this.sampleRate = checkSampleRate(options.sampleRate ?? 44100, 'sampleRate');
    this.humanizeSeed = checkNumber(options.humanizeSeed ?? 1, 'humanizeSeed');
    this.timingJitter = checkNumber(options.timingJitter ?? 0.012, 'timingJitter', { min: 0 });
    this.velocityJitter = checkNumber(options.velocityJitter ?? 0.1, 'velocityJitter', {
      min: 0,
      max: 1,
    });
  }

  /** Vuruş → saniye. */
  beatsToSeconds(beats: number): number {
    return (beats * 60) / this.bpm;
  }

  /** Ölçü + vuruş → saniye. */
  positionToSeconds(bar: number, beat = 0): number {
    return this.beatsToSeconds(bar * this.beatsPerBar + beat);
  }

  /** Tek nota ekler. */
  note(event: NoteEvent): this {
    if (typeof event.instrument !== 'function') {
      throw new TypeError(`instrument bir fonksiyon olmalı (${event.note})`);
    }
    if (!Number.isFinite(event.beats) || event.beats <= 0) {
      throw new TypeError(`beats pozitif ve sonlu olmalı (${event.note})`);
    }
    if (!Number.isFinite(event.bar) || !Number.isFinite(event.beat ?? 0)) {
      throw new TypeError(`bar/beat sonlu olmalı (${event.note})`);
    }
    const gain = event.gain ?? 1;
    if (!Number.isFinite(gain) || gain < 0 || gain > 1) {
      throw new TypeError(`gain [0, 1] aralığında olmalı (${event.note})`);
    }
    // Nota adı burada doğrulanır: render sırasında patlarsa hangi olayın
    // bozuk olduğunu bulmak yüzlerce nota arasında aramak demektir.
    noteToHz(event.note);
    this.events.push(event);
    return this;
  }

  /** Aynı anda başlayan birden çok notayı ekler. */
  chord(event: Omit<NoteEvent, 'note'> & { notes: readonly string[]; spread?: number }): this {
    const { notes, spread = 0, ...rest } = event;
    if (notes.length === 0) throw new TypeError('Akor en az bir nota taşır');
    notes.forEach((note, index) => {
      const position = notes.length === 1 ? 0.5 : index / (notes.length - 1);
      this.note({
        ...rest,
        note,
        pan: spread === 0 ? rest.pan : (position - 0.5) * 2 * spread,
      });
    });
    return this;
  }

  /** Şu ana kadar eklenen nota sayısı. */
  get length(): number {
    return this.events.length;
  }

  /**
   * Düzenlemeyi stereo bir tampona indirger.
   *
   * Notalar kanonik mix veriyolunda TOPLANIR (`arrange/mix.ts`); her nota
   * kendi `synthesize` çağrısıyla üretilir. Seviye en sonda bir kez verilir:
   * önce tutulacak aralık bulunur, yükseklik YALNIZ onun üstünde ölçülür,
   * sonra sınırlayıcı ve tavan (`engine/master.ts`).
   *
   * İnsanlaştırma durumsuzdur: aynı nesnede ardışık `render()` çağrıları
   * birebir aynı örnekleri verir.
   */
  render(options: RenderOptions = {}): SynthesisResult {
    if (this.events.length === 0) {
      throw new TypeError('Boş zaman çizelgesi render edilemez');
    }
    const sampleRate = this.sampleRate;
    const tail = checkNumber(options.tailSeconds ?? 3, 'tailSeconds', { min: 0 });
    const loopBars =
      options.loopBars === undefined
        ? undefined
        : checkNumber(options.loopBars, 'loopBars', { min: 1, integer: true });

    let end = 0;
    const placed = this.events.map((event, index) => {
      const jitter = (stableJitter(this.humanizeSeed, index, 0) - 0.5) * this.timingJitter;
      const velocity =
        (event.gain ?? 1) *
        (1 -
          this.velocityJitter / 2 +
          stableJitter(this.humanizeSeed, index, 1) * this.velocityJitter);
      const at = Math.max(
        0,
        this.positionToSeconds(event.bar, event.beat ?? 0) + this.beatsToSeconds(jitter),
      );
      const duration = this.beatsToSeconds(event.beats);
      end = Math.max(end, at + duration);
      return { event, at, duration, velocity: Math.min(1, Math.max(0, velocity)) };
    });

    const length = loopBars === undefined ? end + tail : this.positionToSeconds(loopBars, 0);
    const mix = createMix(length, sampleRate);
    for (const { event, at, duration, velocity } of placed) {
      const params: SynthParams = {
        ...event.instrument(noteToHz(event.note), duration),
        sampleRate,
      };
      if (event.pan !== undefined) params.pan = event.pan;
      addVoice(mix, synthesize(params), at, {
        gain: velocity,
        wrap: loopBars !== undefined,
      });
    }

    const total = mix.channels[0].length;
    let kept = total;
    if (loopBars === undefined && options.trimSilence !== false) {
      const floor = mixPeak(mix.channels) * AUDIBLE_FLOOR_RELATIVE;
      let last = total - 1;
      while (
        last > 0 &&
        Math.abs(mix.channels[0][last]) < floor &&
        Math.abs(mix.channels[1][last]) < floor
      ) {
        last--;
      }
      kept = Math.min(total, last + Math.floor(TRIM_MARGIN_SECONDS * sampleRate));
    }

    const out = { channels: mix.channels.map((ch) => ch.subarray(0, kept)), sampleRate };
    masterMix(out, {
      level: {
        mode: 'rms',
        target: options.targetRms ?? 0.1,
        maxGain: options.maxGain ?? 6,
      },
      limiter: { threshold: options.threshold ?? 0.7, knee: 0.28 },
      ceiling: options.ceiling ?? 0.95,
      dcBlockHz: MASTER_DC_BLOCK_HZ,
      fadeOutSeconds: loopBars === undefined ? END_FADE_SECONDS : 0,
    });
    return { channels: out.channels, sampleRate, duration: kept / sampleRate };
  }
}

function mixPeak(channels: readonly Float32Array[]): number {
  let peak = 0;
  for (const channel of channels) {
    for (const value of channel) peak = Math.max(peak, Math.abs(value));
  }
  return peak;
}
