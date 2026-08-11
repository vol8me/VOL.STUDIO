/** Ses sentez motoru tipleri. */

export type Waveform =
  | 'sine'
  | 'triangle'
  | 'sawtooth'
  | 'square'
  | 'pulse'
  | 'noise'
  | 'pink'
  | 'brown';

export type Curve = 'linear' | 'exponential' | 'cosine';

/** ADSR benzeri zarf parametreleri. */
export interface EnvelopeParams {
  /** Saniye. Varsayılan 0. */
  attack?: number;
  /** Zirve seviyesinde tutma süresi (saniye). */
  hold?: number;
  /** Sustain seviyesine düşme süresi (saniye). */
  decay?: number;
  /** Sustain seviyesinde kalma süresi (saniye). */
  sustain?: number;
  /** Release süresi (saniye). */
  release?: number;
  /** Sustain seviyesi (0-1). Varsayılan 0.5. */
  sustainLevel?: number;
  /** Zarf eğrisi. */
  curve?: Curve;
  /** Loop modu — ADSH kısmını döngüye al, release'i atla. Ritmik pattern'ler için. */
  loop?: boolean;
}

/** Filtre tipleri. 1-kutuplu basit filtreler veya rezonanslı biquad. */
export type FilterType = 'lowpass' | 'highpass' | 'bandpass' | 'notch';

/** Filtre tanımı. */
export interface FilterParams {
  /** Kesim frekansı (Hz). */
  cutoff: number;
  /** Süre boyunca kesim frekansında ne kadar değişim olacağı (Hz). Varsayılan 0. */
  slide?: number;
  /** Rezonans (0-1 NORMALİZE, Q değeri değil). 0 → Q 0.707 (Butterworth),
   *  1 → Q 20. Eski 1-kutuplu filtrelerde yok sayılır.
   *  Ham Q gerekiyorsa `BiquadFilter` doğrudan kullanılmalıdır. */
  resonance?: number;
  /** Filtre tipi. Varsayılan 'lowpass'. Biquad kullanımı için.
   *  Belirtilmezse ve resonance > 0 ise biquad lowpass kullanılır. */
  type?: FilterType;
  /** Kutup sayısı. 1 = RC (6 dB/oct), 2 = biquad (12 dB/oct), 4 = kaskad (24 dB/oct).
   *  Varsayılan: resonance > 0 ise 2, değilse 1 (geriye dönük uyum). */
  poles?: 1 | 2 | 4;
  /** Filtre zarfı — cutoff zamanla modüle edilir (filter sweep).
   *  Zarf 0→1 arası: cutoff = baseCutoff * (1 - envAmount + envAmount * envValue). */
  envelope?: EnvelopeParams;
  /** Zarfın cutoff'a etkisi (0-1). 0 = etkisiz, 1 = tam kontrol.
   *  Varsayılan 0. */
  envAmount?: number;
}

/** Delay efekti. */
export interface DelayParams {
  /** Gecikme zamanı (saniye). */
  time: number;
  /** Geri besleme (0-1). */
  feedback?: number;
  /** Karışım (0-1). */
  mix?: number;
}

/** Sample kırpma aralığı. */
export interface SampleTrim {
  /** Başlangıç (saniye). */
  start?: number;
  /** Bitiş (saniye); negatifse sondan geriye doğru. */
  end?: number;
}

/** Sample mixing parametreleri. */
export interface SampleParams {
  /** Decode edilmiş mono örnekler veya ham WAV buffer. */
  data: Float32Array | ArrayBuffer | Uint8Array;
  /** `data` ham WAV ise WAV'ın örnek oranı. Float32Array ise orijinal örnek oranı (varsayılan hedef). */
  sampleRate?: number;
  /** Başlangıç ve bitiş kırpma (saniye). */
  trim?: SampleTrim;
  /** Semitone cinsinden pitch shift. */
  pitchShift?: number;
  /** Hedef süreyi aşarsa loop yap. */
  loop?: boolean;
  /** Loop geçişlerinde crossfade uygula. */
  loopCrossfade?: boolean;
  /** Sample kazancı (0-1). */
  gain?: number;
  /** Sample zarfı. */
  envelope?: EnvelopeParams;
}

/** FM / phase modulation parametreleri (2-operator). */
export interface FmParams {
  /** Modulator dalga şekli. Varsayılan 'sine'. */
  modulatorWave?: Exclude<Waveform, 'noise' | 'pink' | 'brown'>;
  /** Modulator frekansı / taşıyıcı frekansı oranı. Varsayılan 1. */
  ratio?: number;
  /** Modülasyon indeksi (beta, radian cinsinden pik faz sapması). 0 = FM kapalı. */
  index?: number;
  /** Modulator seviyesi (opsiyonel ek gain). Varsayılan 1. */
  modulatorLevel?: number;
  /** Modulator geri besleme (radian cinsinden). Varsayılan 0. */
  feedback?: number;
  /** Modulator zarfı; index'i zamanla çarpar. */
  modulatorEnvelope?: EnvelopeParams;
}

/** Additive synthesis harmoniği — sine osilatör başına bir. */
export interface HarmonicParams {
  /** Frekans çarpanı (1 = temel, 2 = oktav, 1.5 = perfect 5th, 3 = oktav+5th). */
  ratio: number;
  /** Kazanç (0-1). Temel genelde 1, üst harmonikler daha düşük. */
  gain: number;
  /** Faz ofset (0-1). Varsayılan 0. Stereo yayılım için kullanışlı. */
  phase?: number;
}

/** Stereo width / enhancer. */
export interface StereoWidthParams {
  /** 0 = mono, 1 = bypass, >1 = genişlet. */
  width: number;
}

/** Chorus efekti. */
export interface ChorusParams {
  /** Modülasyon derinliği (ms). */
  depth?: number;
  /** Modülasyon hızı (Hz). */
  rate?: number;
  /** Karışım (0-1). */
  mix?: number;
}

/** Phaser efekti. */
export interface PhaserParams {
  /** Allpass merkez frekansı minimumu (Hz). Varsayılan 300. */
  minFreq?: number;
  /** Allpass merkez frekansı maksimumu (Hz). Varsayılan 3000. */
  maxFreq?: number;
  /** Modülasyon hızı (Hz). Varsayılan 0.5. */
  rate?: number;
  /** LFO dalga şekli. Varsayılan 'sine'. */
  wave?: 'sine' | 'triangle';
  /** Allpass aşama sayısı. Varsayılan 4. */
  stages?: number;
  /** Geri besleme (-0.95 ile 0.95 arası). Varsayılan 0. */
  feedback?: number;
  /** Karışım (0-1). Varsayılan 0.5. */
  mix?: number;
}

/** Flanger efekti. */
export interface FlangerParams {
  /** Temel gecikme süresi (ms). Varsayılan 1. */
  time?: number;
  /** Modülasyon derinliği (ms). Varsayılan 0.5. */
  depth?: number;
  /** Modülasyon hızı (Hz). Varsayılan 0.5. */
  rate?: number;
  /** Geri besleme (-0.95 ile 0.95 arası). Varsayılan 0. */
  feedback?: number;
  /** Karışım (0-1). Varsayılan 0.5. */
  mix?: number;
}

/** Reverb efekti. */
export interface ReverbParams {
  /** Karışım miktarı (0-1). */
  amount?: number;
  /** Süre boyunca sönüm (saniye). */
  decay?: number;
  /** Oda boyutu (0-1). Comb gecikme uzunluklarını ölçekler — fiziksel oda
   *  büyüklüğü. `decay` sönüm süresini, `roomSize` odanın boyutunu belirler. */
  roomSize?: number;
  /** Yüksek frekans sönümü (0-1). */
  damp?: number;
  /** Reverb öncesi gecikme (saniye). */
  preDelay?: number;
}

/** Distortion / waveshaping efekti. */
export interface DistortionParams {
  /** Drive miktarı (0-1). */
  amount: number;
  /** Distortion tipi. Varsayılan 'soft'. */
  type?: 'soft' | 'hard' | 'foldback';
  /** Wet/dry mix (0-1). Varsayılan 1. */
  mix?: number;
}

/** Frekans zıplaması. */
export interface PitchJumpParams {
  /** Zıplama miktarı (Hz). */
  amount: number;
  /** Zıplamanın ses içindeki konumu (0-1). */
  time: number;
  /** Zıplamanın süresi (saniye). Varsayılan 0.01. */
  duration?: number;
}

/** Sentez parametreleri. */
export interface SynthParams {
  /** Örnek oranı. Varsayılan 44100. */
  sampleRate?: number;

  /**
   * Deterministik gürültü için seed. Verilmezse sabit bir varsayılan kullanılır —
   * yani üretim varsayılan olarak TEKRARLANABİLİR. Aynı parametreler + aynı seed
   * her zaman birebir aynı sesi verir.
   */
  seed?: number;

  /**
   * Sonucu tepe değerine göre normalize et. Varsayılan `true`.
   *
   * `false` yapıldığında sesin doğal seviyesi korunur. Bir mix içinde birden çok
   * ses üretilirken (bkz. `compose()`) her birini ayrı ayrı normalize etmek
   * aralarındaki dinamik farkı yok eder; o durumda `false` geçilip normalize
   * yalnızca final mix'e bir kez uygulanmalıdır.
   */
  normalize?: boolean;
  /** Dalga şekli veya karışım. */
  wave?: Waveform | Waveform[];
  /** Temel frekans (Hz). */
  frequency?: number;
  /** İkinci osilatör detune (cent). */
  detune?: number;
  /** Frekans kayması (Hz). Son frekans = frequency + slide. */
  slide?: number;
  /** Kayma eğrisi. */
  slideCurve?: Curve;
  /** Pulse dalgası için duty cycle (0-1). */
  pulseWidth?: number;
  /** FM / phase modulation. */
  fm?: FmParams;
  /** Additive synthesis — harmonik serisi ile sıcak timbre.
   *  wave/fm yerine kullanılır. Her harmonik ayrı sine osilatör, tek geçişte toplanır.
   *  Sıcak piyano, yaylı, organ karakteri için ideal. */
  harmonics?: HarmonicParams[];
  /** Sample mixing. */
  sample?: SampleParams;
  /** Frekans zıplaması. */
  pitchJump?: PitchJumpParams;
  /** Zarf. */
  envelope?: EnvelopeParams;
  /** Lowpass filtre. */
  lowpass?: FilterParams;
  /** Highpass filtre. */
  highpass?: FilterParams;
  /** Vibrato derinliği (Hz). */
  vibratoDepth?: number;
  /** Vibrato hızı (Hz). */
  vibratoRate?: number;
  /** Tremolo derinliği (0-1). */
  tremoloDepth?: number;
  /** Tremolo hızı (Hz). */
  tremoloRate?: number;
  /** Distortion. */
  distortion?: DistortionParams;
  /** Stereo width — sayı (width) veya { width: number } objesi. */
  stereoWidth?: StereoWidthParams | number;
  /** Reverb. */
  reverb?: ReverbParams;
  /** Delay. */
  delay?: DelayParams;
  /** Flanger. */
  flanger?: FlangerParams;
  /** Phaser. */
  phaser?: PhaserParams;
  /** Chorus. */
  chorus?: ChorusParams;
  /** Stereo pan (-1 sol, 1 sağ). Sadece stereo çıkışta etkili. */
  pan?: number;
  /** Tekrar sayısı. */
  repeat?: number;
  /** Tekrarlar arası süre (saniye). */
  repeatTime?: number;
  /** Toplam süre (saniye). */
  duration: number;
  /** Genel kazanç (0-1). */
  gain?: number;
  /** LFO'lar — osilatör frekansı, filtre kesimi veya amplitüd'e modülasyon. */
  lfos?: LfoParams[];
}

/** LFO hedef parametreleri. */
export type LfoTarget = 'pitch' | 'filter' | 'amplitude';

/** LFO parametreleri. */
export interface LfoParams {
  /** Hedef parametre. 'pitch' = frekans, 'filter' = lowpass cutoff, 'amplitude' = gain. */
  target: LfoTarget;
  /** LFO hızı (Hz). */
  rate: number;
  /** Derinlik. pitch: Hz, filter: Hz, amplitude: 0-1. */
  depth: number;
  /** LFO dalga şekli. Varsayılan 'sine'. */
  wave?: Exclude<Waveform, 'noise' | 'pink' | 'brown'>;
  /** Faz ofset (0-1). Varsayılan 0. */
  phase?: number;
}

export interface SynthesisResult {
  /** Kanal başına sample dizisi. [0] mono, [0][1] stereo. */
  channels: Float32Array[];
  sampleRate: number;
  duration: number;
}

/** Arp / sequence içindeki tek bir nota. */
export interface SequenceNote {
  /** Mutlak frekans (Hz). `semitone` yerine kullanılır. */
  freq?: number;
  /** Root'a göre yarım ton offset. `freq` yoksa kullanılır. */
  semitone?: number;
  /** Nota süresi (saniye veya beat). */
  duration: number;
  /** Önceki notanın bitiminden sonraki bekleme (saniye veya beat). */
  delay?: number;
  /** Bu nota için override parametreler. */
  params?: Partial<SynthParams>;
}

/** Arp / sequence tanımı. */
export interface SequenceParams {
  /** Nota listesi. */
  notes: SequenceNote[];
  /** Root frekans (Hz). `semitone` kullanılıyorsa referans. */
  rootFreq?: number;
  /** BPM verilirse `duration` ve `delay` beat olarak yorumlanır. */
  bpm?: number;
  /** Dizi kaç kez tekrar edilsin. */
  loop?: number;
  /** Loop'lar arası bekleme (saniye veya beat). */
  loopDelay?: number;
}
