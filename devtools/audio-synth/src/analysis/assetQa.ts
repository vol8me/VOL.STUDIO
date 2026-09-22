import {
  countClips,
  integratedLoudness,
  maxMomentaryLoudness,
  samplePeakDb,
  truePeakDb,
  type ClipCount,
} from './loudness';

export type AssetClass = 'ui' | 'sfx' | 'ambience' | 'music' | 'music-stem';

export interface AssetClassPolicy {
  /** Uzun, sürekli varlık integrated; kısa olay en yüksek momentary ile ölçülür. */
  readonly loudness: 'integrated' | 'maxMomentary';
  /** Kabul edilen yükseklik aralığı (LUFS). */
  readonly loudnessRange: readonly [number, number];
  /** Kodek SONRASI izin verilen en yüksek true peak (dBTP). */
  readonly truePeakMax: number;
}

/**
 * Varlık sınıfı politikası — makine-okunur.
 *
 * True peak tavanı −1 dBTP: EBU R128, Sony ASWG-R001 ve AES TD1008'in ortak
 * sınırı (kayıplı kodek payı). Yükseklik aralıkları bir yayın standardı
 * DEĞİLDİR (oyun varlığı başına standart yok); frozen VOL.HELL kataloğunun
 * kodek sonrası ölçümünden, gözlenen aralığın iki yanına ~4–6 LU pay
 * bırakılarak kalibre edildi (DESIGN "Varlık QA'sı"). Amaç kaba seviye
 * hatasını (−5 LUFS'lik bir UI tıkı, −40'lık bir müzik) yakalamaktır.
 * Kırpma her sınıfta sıfırdır.
 */
export const ASSET_CLASS_POLICIES = {
  version: 1,
  classes: {
    ui: { loudness: 'maxMomentary', loudnessRange: [-28, -14], truePeakMax: -1 },
    sfx: { loudness: 'maxMomentary', loudnessRange: [-30, -8], truePeakMax: -1 },
    ambience: { loudness: 'integrated', loudnessRange: [-26, -16], truePeakMax: -1 },
    music: { loudness: 'integrated', loudnessRange: [-20, -12], truePeakMax: -1 },
    /*
     * Stem TEK BAŞINA çalınmak için değildir: yalnız ezgi katmanı doğal
     * olarak kısıktır ve mix aralığına zorlanırsa toplamları tavanı aşar.
     * Aralık kaba seviye hatasını yine yakalar; asıl yükseklik kararı
     * kombinasyon QA'sında (`MusicAdaptiveQaV1`) ölçülür.
     */
    'music-stem': { loudness: 'integrated', loudnessRange: [-45, -8], truePeakMax: -1 },
  } satisfies Record<AssetClass, AssetClassPolicy>,
} as const;

export interface AssetMeasurement {
  readonly durationSeconds: number;
  readonly channels: number;
  /** BS.1770 kapılı; 400 ms'den kısa sinyalde `null` (tanımsız). */
  readonly integratedLufs: number | null;
  readonly maxMomentaryLufs: number | null;
  readonly truePeakDbtp: number | null;
  readonly samplePeakDbfs: number | null;
  readonly clips: ClipCount;
}

const finiteOrNull = (value: number): number | null => (Number.isFinite(value) ? value : null);

export function measureAsset(
  channels: readonly Float32Array[],
  sampleRate: number,
): AssetMeasurement {
  return {
    durationSeconds: (channels[0]?.length ?? 0) / sampleRate,
    channels: channels.length,
    integratedLufs: finiteOrNull(integratedLoudness(channels, sampleRate)),
    maxMomentaryLufs: finiteOrNull(maxMomentaryLoudness(channels, sampleRate)),
    truePeakDbtp: finiteOrNull(truePeakDb(channels, sampleRate)),
    samplePeakDbfs: finiteOrNull(samplePeakDb(channels)),
    clips: countClips(channels),
  };
}

/**
 * Yol kuralı: bir klasör adı `music`, `ambience`/`ambient` ya da `ui` ise o
 * sınıf, değilse `sfx`. Oyun adı ya da oyun kavramı bilinmez; tüketici
 * `--class` ile ezebilir.
 */
export function classifyAssetPath(relativePath: string): AssetClass {
  const segments = relativePath.toLowerCase().split(/[\\/]/).slice(0, -1);
  if (segments.includes('music')) return 'music';
  if (segments.includes('ambience') || segments.includes('ambient')) return 'ambience';
  if (segments.includes('ui')) return 'ui';
  return 'sfx';
}

export interface PolicyVerdict {
  readonly assetClass: AssetClass;
  readonly violations: readonly string[];
}

export function evaluateAssetPolicy(
  measurement: AssetMeasurement,
  assetClass: AssetClass,
): PolicyVerdict {
  const policy: AssetClassPolicy = ASSET_CLASS_POLICIES.classes[assetClass];
  const violations: string[] = [];
  const loudness =
    policy.loudness === 'integrated' ? measurement.integratedLufs : measurement.maxMomentaryLufs;
  const [low, high] = policy.loudnessRange;
  if (loudness === null) {
    violations.push(`${policy.loudness} yükseklik ölçülemedi (sessiz ya da çok kısa)`);
  } else if (loudness < low || loudness > high) {
    violations.push(
      `${policy.loudness} ${loudness.toFixed(1)} LUFS, aralık [${low}, ${high}] LUFS`,
    );
  }
  if (measurement.truePeakDbtp !== null && measurement.truePeakDbtp > policy.truePeakMax) {
    violations.push(
      `true peak ${measurement.truePeakDbtp.toFixed(2)} dBTP > ${policy.truePeakMax} dBTP`,
    );
  }
  if (measurement.clips.channelSamples > 0) {
    violations.push(
      `kırpma: ${measurement.clips.channelSamples} kanal örneği ` +
        `(kanal başına ${measurement.clips.perChannel.join('/')})`,
    );
  }
  return { assetClass, violations };
}
