import { synthesize } from '../engine';
import type { SynthParams, SynthesisResult } from '../types';
import { matchLoudness, type LoudnessOptions } from './loudness';
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
   * boş kalır (ölçüldü: bir parçada sonda 4 saniye tam sessizlik).
   */
  trimSilence?: boolean;
}

/** Deterministik doğrusal eşleşmeli üreteç. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Kırpma yapılırken duyulur sayılan en küçük genlik. */
const AUDIBLE_FLOOR = 0.0015;

/** Tampon sonundaki tıkı önleyen sönüş. */
const END_FADE_SECONDS = 0.04;

export class Timeline {
  private readonly events: NoteEvent[] = [];
  private readonly random: () => number;
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
    this.sampleRate = options.sampleRate ?? 44100;
    this.random = createRandom(options.humanizeSeed ?? 1);
    this.timingJitter = options.timingJitter ?? 0.012;
    this.velocityJitter = options.velocityJitter ?? 0.1;
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
   * Notalar TOPLANIR; her nota kendi `synthesize` çağrısıyla üretilir ve
   * mutlak örnek ofsetine eklenir. Toplama kırpabilir, o yüzden sonunda
   * yükseklik eşitleme ve sınırlayıcı çalışır (bkz. `loudness.ts`).
   */
  render(options: RenderOptions = {}): SynthesisResult {
    if (this.events.length === 0) {
      throw new TypeError('Boş zaman çizelgesi render edilemez');
    }
    const sampleRate = this.sampleRate;
    const tail = options.tailSeconds ?? 3;

    let end = 0;
    const placed = this.events.map((event) => {
      const jitter = (this.random() - 0.5) * this.timingJitter;
      const velocity =
        (event.gain ?? 1) * (1 - this.velocityJitter / 2 + this.random() * this.velocityJitter);
      const at = Math.max(
        0,
        this.positionToSeconds(event.bar, event.beat ?? 0) + this.beatsToSeconds(jitter),
      );
      const duration = this.beatsToSeconds(event.beats);
      end = Math.max(end, at + duration);
      return { event, at, duration, velocity: Math.min(1, Math.max(0, velocity)) };
    });

    const total = Math.ceil((end + tail) * sampleRate);
    const left = new Float32Array(total);
    const right = new Float32Array(total);

    for (const { event, at, duration, velocity } of placed) {
      const params: SynthParams = {
        ...event.instrument(noteToHz(event.note), duration),
        sampleRate,
      };
      if (event.pan !== undefined) params.pan = event.pan;

      const rendered = synthesize(params);
      const sourceLeft = rendered.channels[0];
      if (!sourceLeft) continue;
      const sourceRight = rendered.channels[1] ?? sourceLeft;
      const offset = Math.floor(at * sampleRate);
      const count = Math.min(sourceLeft.length, total - offset);
      for (let i = 0; i < count; i++) {
        left[offset + i] += sourceLeft[i] * velocity;
        right[offset + i] += sourceRight[i] * velocity;
      }
    }

    matchLoudness([left, right], options);

    let kept = total;
    if (options.trimSilence !== false) {
      let last = total - 1;
      while (
        last > 0 &&
        Math.abs(left[last]) < AUDIBLE_FLOOR &&
        Math.abs(right[last]) < AUDIBLE_FLOOR
      ) {
        last--;
      }
      kept = Math.min(total, last + Math.floor(0.35 * sampleRate));
    }

    const outLeft = left.subarray(0, kept);
    const outRight = right.subarray(0, kept);
    const fade = Math.min(kept, Math.floor(END_FADE_SECONDS * sampleRate));
    for (let i = 0; i < fade; i++) {
      const scale = i / fade;
      outLeft[kept - 1 - i] *= scale;
      outRight[kept - 1 - i] *= scale;
    }

    return { channels: [outLeft, outRight], sampleRate, duration: kept / sampleRate };
  }
}
