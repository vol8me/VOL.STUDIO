import type { DensityLevel } from './terms';

/**
 * Sembolik analizin eşikleri VERİDİR. "Seyrek" ile "yoğun"un nerede
 * ayrıldığı bir dengeleme kararıdır; runtime dosyasına gömülürse her
 * değişiklik kod değişikliği olur ve gerekçesi kaybolur.
 *
 * Sayılar ölçülmüş bir doğa yasası değil, beyan edilmiş bir sözleşmedir:
 * brief "sparse" diyorsa üretilen score ölçü başına 4 notayı aşmamalıdır.
 */
export const MUSIC_ANALYSIS_POLICY = {
  version: 1,
  density: {
    sparse: { min: 0, max: 4 },
    moderate: { min: 3, max: 10 },
    dense: { min: 8, max: 64 },
  } as Readonly<Record<DensityLevel, { readonly min: number; readonly max: number }>>,
  /** Beyan edilen melodik öne çıkma ile ölçülen vekil arasındaki kabul edilen fark. */
  melodicSalienceTolerance: 0.35,
  /** Bölüm enerjisi sıralaması hedeflenen sıralamayla en az bu oranda uyuşmalı. */
  sectionContrastAgreement: 0.75,
  /** Korunan spektral banda düşen temel perde oranı üst sınırı. */
  spectralProtectionMaxRatio: 0.25,
  /** Ölçü başına akor değişimi makul aralığı. */
  harmonicRhythm: { min: 0, max: 8 },
} as const;

export function densityBand(level: DensityLevel): { readonly min: number; readonly max: number } {
  return MUSIC_ANALYSIS_POLICY.density[level];
}
