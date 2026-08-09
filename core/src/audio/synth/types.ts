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
}

/** Filtre tanımı. */
export interface FilterParams {
  /** Kesim frekansı (Hz). */
  cutoff: number;
  /** Süre boyunca kesim frekansında ne kadar değişim olacağı (Hz). Varsayılan 0. */
  slide?: number;
  /** Rezonans (0-1). Şu an desteklenmiyor, gelecek için ayrılmış. */
  resonance?: number;
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

/** Distortion / waveshaping efekti. */
export interface DistortionParams {
  /** Drive miktarı (0-1). */
  amount: number;
  /** Distortion tipi. Varsayılan 'soft'. */
  type?: 'soft' | 'hard' | 'foldback';
  /** Wet/dry mix (0-1). Varsayılan 1. */
  mix?: number;
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
  /** Oda boyutu (0-1). */
  roomSize?: number;
  /** Yüksek frekans sönümü (0-1). */
  damp?: number;
  /** Reverb öncesi gecikme (saniye). */
  preDelay?: number;
}

/** Bitcrush / örnekleme frekansı düşürme. */
export interface BitcrushParams {
  /** Bit derinliği (örn. 8). */
  bits?: number;
  /** Örnekleme frekansı düşürme katsayısı (örn. 4). */
  sampleRateFactor?: number;
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
  /** Bitcrush. */
  bitcrush?: BitcrushParams;
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
  /** Stereo width. */
  stereoWidth?: StereoWidthParams;
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
