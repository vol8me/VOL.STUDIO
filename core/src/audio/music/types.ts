import type { SynthParams, Waveform } from '../synth/types';

/** Müzik state'indeki bir değer (sayısal veya sembolik). */
export type MusicStateValue = number | string;

/** Müzik state'i; intensity, tension, bossPhase, location gibi boyutları tutar. */
export interface MusicState {
  /** Genel aksiyon / gerilim yoğunluğu (0-1). */
  intensity?: number;
  /** Gerilim / tehdit hissi (0-1). */
  tension?: number;
  /** Boss fazı veya sahne aşaması. */
  bossPhase?: number | string;
  /** Mekan / sahne / track kimliği. */
  location?: string;
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

/** Yoğunluk / gerilim gibi sayısal state için gain eşleme noktası. */
export interface IntensityGainPoint {
  threshold: number;
  gain: number;
}

/** Stem'in farklı state değerlerine göre gain haritası.
 *  Sayısal state'ler (intensity, tension) için `IntensityGainPoint[]`,
 *  sembolik state'ler (bossPhase, location) için `Record<string, number>` kullanılır.
 */
export interface StemGainMap {
  intensity?: IntensityGainPoint[];
  tension?: IntensityGainPoint[];
  bossPhase?: Record<string, number>;
  location?: Record<string, number>;
  [key: string]: IntensityGainPoint[] | Record<string, number> | undefined;
}

/** Muzik track'inin bir katmanı (stem). */
export interface Stem {
  id: string;
  /** Sample / stem kaynak URL'si. */
  src?: string;
  /** Önceden yüklenmiş AudioBuffer. */
  buffer?: AudioBuffer;
  /** Temel gain (0-1). Varsayılan 1. */
  gain?: number;
  /** Bu stem stinger (one-shot) mi? */
  stinger?: boolean;
  /** Loop yapsın mı? Track stem'leri için varsayılan true. */
  loop?: boolean;
  /** Fade in süresi (saniye). */
  fadeIn?: number;
  /** Fade out süresi (saniye). */
  fadeOut?: number;
  /** Stereo pan (-1 sol, 0 merkez, 1 sağ). */
  pan?: number;
  /** Adaptive gain haritası. */
  gainMap?: StemGainMap;
  /** Adaptive gain fonksiyonu; gainMap'ten önceliklidir. */
  gainFn?: (state: MusicState, ctx: MusicContext) => number;
}

/** Müzik parçası tanımı. */
export interface MusicTrack {
  id: string;
  /** Tempo (BPM). */
  bpm: number;
  /** Ölçü vuruş sayısı. Varsayılan [4, 4]. */
  timeSignature?: [number, number];
  /** Parça uzunluğu ölçü sayısı (opsiyonel, scheduling için). */
  bars?: number;
  /** Loop başlangıcı (saniye). */
  loopStart?: number;
  /** Loop bitişi (saniye). */
  loopEnd?: number;
  /** Parçanın stem'leri. */
  stems: Stem[];
  /** Track başladığında kullanılacak varsayılan state. */
  defaultState?: MusicState;
}

/** Müzik motoru yapılandırması. */
export interface MusicEngineOptions {
  /** Dışarıdan sağlanan AudioContext. */
  audioContext?: AudioContext;
  /** Master ses seviyesi (0-1). */
  masterVolume?: number;
  /** Master kompresör / limiter açılsın mı? Varsayılan true. */
  compressor?: boolean;
  /** Scheduling için lookahead (saniye). Varsayılan 0.1. */
  lookaheadSeconds?: number;
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

/** Stinger çalma seçenekleri. */
export interface StingerOptions {
  /** Stinger gain'i (0-1). */
  volume?: number;
  /** Ne zaman çalınacağı (AudioContext zamanı). */
  when?: number;
}

/** Procedural stem üretim seçenekleri. */
export interface ProceduralStemOptions {
  /** Süre (saniye). */
  duration: number;
  /** Kök frekans (Hz). */
  frequency?: number;
  /** Dalga şekli. */
  wave?: Waveform | Waveform[];
  /** Zarf. */
  envelope?: SynthParams['envelope'];
  /** Lowpass filtre. */
  lowpass?: SynthParams['lowpass'];
  /** Highpass filtre. */
  highpass?: SynthParams['highpass'];
  /** Reverb. */
  reverb?: SynthParams['reverb'];
  /** Chorus. */
  chorus?: SynthParams['chorus'];
  /** Delay. */
  delay?: SynthParams['delay'];
  /** Genel gain. */
  gain?: number;
  /** Örnek oranı. */
  sampleRate?: number;
  /** Buffer döngüye girecekse attack/release tamponlu envelope hesapla. */
  loop?: boolean;
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
}
