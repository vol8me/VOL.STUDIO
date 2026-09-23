/**
 * Dinamik işleme — ileri beslemeli kompresör ve transient şekillendirici.
 *
 * Kompresör Giannoulis, Massberg & Reiss (JAES 2012, "Digital Dynamic Range
 * Compressor Design") yapısıdır: kazanç hesaplayıcı log alanında yumuşak
 * dizli statik eğri, düzeltme dB alanında dallanan (atak/bırakma) tek kutup.
 * Detektör sidechain'den beslenebilir; sessiz sidechain (ya da eşik altı)
 * kazancı TAM 1 bırakır — sıfır sidechain'de çıktı girişle bit-eşittir.
 */
export interface CompressorSettings {
  readonly thresholdDb: number;
  readonly ratio: number;
  readonly kneeDb: number;
  readonly attackSeconds: number;
  readonly releaseSeconds: number;
  readonly makeupDb: number;
  readonly detector: 'peak' | 'rms';
  /** RMS penceresinin zaman sabiti (saniye). */
  readonly rmsSeconds: number;
  readonly link: 'linked' | 'independent';
}

/** Statik eğri: giriş seviyesi (dB) → çıkış seviyesi (dB). Testler bunu ölçümle kıyaslar. */
export function compressorCurveDb(input: number, s: CompressorSettings): number {
  const over = input - s.thresholdDb;
  if (2 * over < -s.kneeDb) return input;
  if (s.kneeDb > 0 && 2 * Math.abs(over) <= s.kneeDb) {
    const t = over + s.kneeDb / 2;
    return input + ((1 / s.ratio - 1) * t * t) / (2 * s.kneeDb);
  }
  return s.thresholdDb + over / s.ratio;
}

const coefficient = (seconds: number, sampleRate: number) =>
  seconds > 0 ? Math.exp(-1 / (seconds * sampleRate)) : 0;

/** Seviye bu değerin altındaysa eşiğin altında sayılır (log(0) yok). */
const SILENCE = 1e-12;

/**
 * Kazanç zarfını (doğrusal çarpan) hesaplar. `detect` kanalları detektörün
 * gördüğü sinyaldir: kendi girişi ya da sidechain. Bağlı modda tek zarf
 * bütün kanallara uygulanır (stereo görüntü kaymaz).
 */
export function compressorGains(
  detect: readonly Float32Array[],
  frames: number,
  sampleRate: number,
  s: CompressorSettings,
): Float32Array[] {
  const attack = coefficient(s.attackSeconds, sampleRate);
  const release = coefficient(s.releaseSeconds, sampleRate);
  const rmsCoef = coefficient(s.rmsSeconds, sampleRate);
  const makeup = Math.pow(10, s.makeupDb / 20);
  const lanes = s.link === 'linked' ? [detect] : detect.map((c) => [c]);
  return lanes.map((sources) => {
    const gains = new Float32Array(frames);
    let smoothed = 0;
    let meanSquare = 0;
    for (let i = 0; i < frames; i++) {
      let level = 0;
      for (const source of sources) {
        const v = i < source.length ? Math.abs(source[i]) : 0;
        if (v > level) level = v;
      }
      if (s.detector === 'rms') {
        meanSquare = rmsCoef * meanSquare + (1 - rmsCoef) * level * level;
        level = Math.sqrt(meanSquare);
      }
      let reduction = 0;
      if (level > SILENCE) {
        const x = 20 * Math.log10(level);
        reduction = compressorCurveDb(x, s) - x;
      }
      const coef = reduction < smoothed ? attack : release;
      smoothed = coef * smoothed + (1 - coef) * reduction;
      gains[i] = smoothed === 0 ? makeup : Math.pow(10, smoothed / 20) * makeup;
    }
    return gains;
  });
}

/** Kanalları YERİNDE sıkıştırır; `sidechain` verilirse detektör onu dinler. */
export function compress(
  channels: readonly Float32Array[],
  sampleRate: number,
  s: CompressorSettings,
  sidechain?: readonly Float32Array[],
): Float32Array[] {
  const frames = channels[0].length;
  const detect = sidechain && sidechain.length > 0 ? sidechain : channels;
  const envelopes = compressorGains(detect, frames, sampleRate, s);
  channels.forEach((channel, ch) => {
    const gains = envelopes[Math.min(ch, envelopes.length - 1)];
    for (let i = 0; i < frames; i++) channel[i] *= gains[i];
  });
  return envelopes;
}

export interface TransientSettings {
  /** Atak bölgesine eklenen en büyük kazanç (dB, negatif yumuşatır). */
  readonly attackDb: number;
  /** Sönüm/gövde bölgesine eklenen en büyük kazanç (dB). */
  readonly sustainDb: number;
  /** Hızlı zarfın atak süresi; yavaş zarf ×20 atak, bırakmalar ×20 (hızlı) ve ×100 (yavaş). */
  readonly speedSeconds: number;
}

/** İki zarf farkının tam etkiye ulaştığı eşik (dB). */
const DIFFERENTIAL_RANGE_DB = 6;

/**
 * Diferansiyel zarf transient şekillendiricisi: hızlı ve yavaş tepe
 * izleyicilerinin dB farkı atak (hızlı > yavaş) ve sönüm (yavaş > hızlı)
 * bölgelerini ayırır; kazanç bu farkla orantılı ve seviyeden bağımsızdır.
 * Bırakmalar FARKLI olmalıdır: aynı bırakmada kuyrukta iki zarf aynı oranla
 * iner, yavaş olan hızlıyı hiç geçmez ve sönüm bölgesi oluşmaz (ölçüldü).
 */
export function shapeTransients(
  channels: readonly Float32Array[],
  sampleRate: number,
  s: TransientSettings,
): void {
  const frames = channels[0].length;
  const fastAttack = coefficient(s.speedSeconds, sampleRate);
  const slowAttack = coefficient(s.speedSeconds * 20, sampleRate);
  const fastRelease = coefficient(s.speedSeconds * 20, sampleRate);
  const slowRelease = coefficient(s.speedSeconds * 100, sampleRate);
  let fast = 0;
  let slow = 0;
  for (let i = 0; i < frames; i++) {
    let level = 0;
    for (const channel of channels) level = Math.max(level, Math.abs(channel[i]));
    fast =
      level > fast
        ? fastAttack * fast + (1 - fastAttack) * level
        : fastRelease * fast + (1 - fastRelease) * level;
    slow =
      level > slow
        ? slowAttack * slow + (1 - slowAttack) * level
        : slowRelease * slow + (1 - slowRelease) * level;
    if (fast <= SILENCE || slow <= SILENCE) continue;
    const diff = 20 * Math.log10(fast / slow);
    const amount = Math.min(1, Math.abs(diff) / DIFFERENTIAL_RANGE_DB);
    const gainDb = diff > 0 ? s.attackDb * amount : s.sustainDb * amount;
    if (gainDb === 0) continue;
    const gain = Math.pow(10, gainDb / 20);
    for (const channel of channels) channel[i] *= gain;
  }
}
