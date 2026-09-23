/**
 * Registry parametre sözleşmesi: birim, aralık, varsayılan ve otomasyon
 * izni makine-okunur yaşar. Program doğrulaması, context çıktısı ve
 * governance testi AYNI tanımı okur.
 */
export type ParamUnit =
  | 'Hz'
  | 's'
  | 'dB'
  | 'dBFS'
  | 'ratio'
  | 'normalized'
  | 'count'
  | 'Q'
  | 'per-second'
  | 'mm'
  | 'cm'
  | 'cm2'
  | 'm'
  | 'L'
  | 'cents'
  | 'octaves'
  | 'bits'
  | 'kg'
  | 'm/s'
  | 'rpm'
  | 'semitones';

export interface NumberParamSpec {
  readonly type: 'number';
  readonly unit: ParamUnit;
  readonly min: number;
  readonly max: number;
  readonly default: number;
  readonly integer?: boolean;
  /** Gesture/modülasyonla zamanla sürülebilir mi (örnek-doğru eğri). */
  readonly automatable?: boolean;
  /** Değer örnek oranının yarısından küçük kalmalı (frekans alanı). */
  readonly belowNyquist?: boolean;
  readonly description: string;
}

export interface ChoiceParamSpec {
  readonly type: 'choice';
  readonly choices: readonly string[];
  readonly default: string;
  readonly description: string;
}

/**
 * Programın `samples` bildirimindeki bir ada başvuru (sample/IR). Varsayılanı
 * yoktur: bildirilmiş bir ad yazılmalıdır; değer render'da `ctx.sample(ad)`
 * ile çözülür.
 */
export interface SampleParamSpec {
  readonly type: 'sample';
  /** Başvurunun hedefi: `samples` bildirimi (varsayılan) ya da `banks` sampler bankası. */
  readonly of?: 'sample' | 'bank';
  readonly description: string;
}

export type ParamSpec = NumberParamSpec | ChoiceParamSpec | SampleParamSpec;

/**
 * Bir parametre ARTARKEN hangi algısal/akustik boyutun hangi yöne gittiği.
 * `direction: 1` boyut artar, `-1` azalır. Yön ilişkileri property
 * testleriyle kilitlenir; burada yazılı olmayan bir yön iddia edilmez.
 */
export type AcousticDimension =
  | 'pitch'
  | 'brightness'
  | 'decay'
  | 'loudness'
  | 'attack-time'
  | 'release-time'
  | 'density'
  | 'noisiness'
  | 'roughness'
  | 'bandwidth'
  | 'wetness'
  | 'width'
  | 'irregularity'
  | 'duration'
  | 'dynamic-range'
  | 'transient'
  | 'distortion'
  | 'low-end';

export interface CausalEffect {
  readonly param: string;
  readonly dimension: AcousticDimension;
  readonly direction: 1 | -1;
  readonly note: string;
}

/**
 * Çözümlenmiş parametre: sabit sayı, seçenek ya da örnek başına eğri.
 * Eğri yalnız `automatable` alanlarda oluşur ve render tamponu uzunluğundadır.
 */
export type ParamSignal = number | Float32Array;
export type ResolvedParams = Readonly<Record<string, ParamSignal | string>>;

export function signalOf(params: ResolvedParams, key: string): ParamSignal {
  const value = params[key];
  if (typeof value === 'string' || value === undefined) {
    throw new TypeError(`${key}: sayısal parametre değil`);
  }
  return value;
}

export function numberOf(params: ResolvedParams, key: string): number {
  const value = params[key];
  if (typeof value !== 'number') throw new TypeError(`${key}: sabit sayı değil`);
  return value;
}

export function choiceOf(params: ResolvedParams, key: string): string {
  const value = params[key];
  if (typeof value !== 'string') throw new TypeError(`${key}: seçenek değil`);
  return value;
}

/** Eğri ya da sabitin `i`. örneği — sıcak döngüde dal tahmini tek yöne oturur. */
export function sampleAt(signal: ParamSignal, i: number): number {
  return typeof signal === 'number' ? signal : signal[i];
}
