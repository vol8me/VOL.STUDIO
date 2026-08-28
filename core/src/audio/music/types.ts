/**
 * Müzik motoru tipleri.
 *
 * **Mimari karar: çalma zamanında beste YOKTUR.** Runtime yalnızca önceden
 * üretilmiş stem'leri (OGG/MP3) çalar; nota/melodi üretimi build-time'da
 * `@volstudio/audio-synth` ile yapılır ve sonuç repoya asset olarak girer.
 *
 * Kazancı: bir parçayı render etmek saniyeler sürebilir, kimse fark etmez —
 * kalite ile kare bütçesi arasındaki takas tamamen kalkar. `synthesize()`
 * senkron ve offline'dır; bir karede çağrılamaz.
 *
 * Bedeli ve SINIRI: uyarlanabilirlik yalnızca DİKEY KATMANLAMA ile sağlanır.
 * `Stem.gainMap` sayesinde "yoğunluk artınca davul katmanı girer" ifade
 * edilebilir; "oyuncunun hamlesine göre armoni değişsin" ya da "melodi
 * gerçek zamanda üretilsin" EDİLEMEZ. Böyle bir ihtiyaç doğarsa bu motor
 * genişletilerek değil, yanına ayrı bir çalma-zamanı sentez yolu (Web Audio
 * düğüm grafiği ya da AudioWorklet) konarak çözülmelidir — `synthesize()`in
 * offline tasarımı oraya taşınmaz.
 */

/** Müzik state'indeki bir değer (sayısal veya sembolik). */
export type MusicStateValue = number | string;

/** Müzik state'i; intensity gibi boyutları tutar. */
export interface MusicState {
  /** Genel aksiyon / gerilim yoğunluğu (0-1). */
  intensity?: number;
  /** Ekstra kullanıcı state'i. */
  [key: string]: MusicStateValue | undefined;
}

/** Müzik çalma bağlamı. */
export interface MusicContext {
  /** Tempo (beats per minute). */
  bpm: number;
  /** Vuruş sayısı / ölçü, örn. [4, 4]. */
  timeSignature: [number, number];
  /** Şu anki ölçü (1-based). */
  bar: number;
  /** Şu anki vuruş (1-based, float). */
  beat: number;
  /** Track başladığından beri geçen süre (saniye). */
  time: number;
}

/** Yoğunluk gibi sayısal state için gain eşleme noktası. */
export interface IntensityGainPoint {
  threshold: number;
  gain: number;
}

/** Stem'in farklı state değerlerine göre gain haritası. */
export interface StemGainMap {
  [key: string]: IntensityGainPoint[] | Record<string, number> | undefined;
}

/** Müzik track'inin bir katmanı (stem). */
export interface Stem {
  id: string;
  /** Sample / stem kaynak URL'si. */
  src?: string;
  /** Önceden yüklenmiş AudioBuffer. */
  buffer?: AudioBuffer;
  /** Temel gain (0-1). Varsayılan 1. */
  gain?: number;
  /** Loop yapsın mı? Track stem'leri için varsayılan true. */
  loop?: boolean;
  /** Adaptive gain haritası. */
  gainMap?: StemGainMap;
}

/** Müzik parçası tanımı. */
export interface MusicTrack {
  id: string;
  /** Tempo (BPM). */
  bpm: number;
  /** Ölçü vuruş sayısı. Varsayılan [4, 4]. */
  timeSignature?: [number, number];
  /** Loop başlangıcı (saniye). */
  loopStart?: number;
  /** Loop bitişi (saniye). */
  loopEnd?: number;
  /** Parçanın stem'leri. */
  stems: Stem[];
  /** Track başladığında kullanılacak varsayılan state. */
  defaultState?: MusicState;
}

/** `loopEnd` ile dosyanın gerçek süresi ayrıştığında bildirilen bilgi. */
export interface LoopTimingMismatch {
  trackId: string;
  stemId: string;
  /** Config'te yazan loop sonu (saniye). */
  configuredEnd: number;
  /** Decode edilmiş buffer'ın gerçek süresi (saniye). */
  actualDuration: number;
}

/** Müzik motoru yapılandırması. */
export interface MusicEngineOptions {
  /**
   * `loopEnd` dosyanın gerçek uzunluğuyla ayrıştığında çağrılır. Verilmezse
   * konsola uyarı yazılır — sessiz kalmaz, çünkü bu ayrışma duyulmadan fark
   * edilmez.
   */
  onTimingMismatch?: (info: LoopTimingMismatch) => void;
  /** Dışarıdan sağlanan AudioContext. */
  audioContext?: AudioContext;
  /** Master ses seviyesi (0-1). */
  masterVolume?: number;
  /** Master kompresör / limiter açılsın mı? Varsayılan true. */
  compressor?: boolean;
  /** Scheduling için lookahead (saniye). Varsayılan 0.1. */
  lookaheadSeconds?: number;
  /**
   * Motorun bağlanacağı çıkış düğümü. Verilmezse `context.destination`.
   *
   * Bir ducker/analiz zinciri araya girecekse burada verilmelidir; tüketicinin
   * `mixer.output`'u sonradan koparıp yeniden bağlaması motorun kapsüllemesini
   * dışarıdan deler.
   */
  destination?: AudioNode;
}

/** `play()` çağrısı seçenekleri. */
export interface PlayOptions {
  /** Track başlarken uygulanacak fade in (saniye). */
  fadeIn?: number;
  /** Başlangıç state'i. */
  state?: MusicState;
}

/** `stop()` çağrısı seçenekleri. */
export interface StopOptions {
  /** Durdurmadan önceki fade out (saniye). */
  fadeOut?: number;
}

/** `crossfadeTo()` çağrısı seçenekleri. */
export interface CrossfadeOptions {
  /** Yeni track için başlangıç state'i. */
  state?: MusicState;
  /** Geçişin bar sınırında başlamasını sağlar; kaç bar atlanacağı (>=1). */
  bars?: number;
}

/** Aktif stem kaynağı ve gain node'unu tutan iç yapı. */
export interface ActiveStem {
  stem: Stem;
  channelId: string;
  source?: AudioBufferSourceNode;
  gain: GainNode;
  buffer: AudioBuffer;
  startTime: number;
  /** `crossfadeTo`/`stop` gibi geçişlerde bu stem gain değişikliklerinden muaf tutulur. */
  fadingOut?: boolean;
  /**
   * Motor bu stem'i bilerek durdurdu (stop/crossfade). Doğal bitişten ayırt
   * edilmesi şart: `onended` her iki durumda da ateşlenir, ama "parça bitti"
   * bildirimi yalnızca doğal bitişte verilmelidir.
   */
  stoppedByEngine?: boolean;
  /** Bu stem'in ait olduğu track — doğal bitiş bildirimi doğru parçaya yazılsın diye. */
  trackId?: string;
}
