import {
  digestSubstrateCandidate,
  serializeSubstrateCandidate,
  type SubstrateCandidate,
} from '@/config/candidate';
import {
  AUDITION_CATALOG_SCHEMA_VERSION,
  AUDITION_SEED_COUNT,
  validateAuditionCatalog,
  type AuditionCatalog,
  type AuditionCatalogEntry,
} from '@/config/auditionCatalog';
import { particleConfig } from '@/config/particles';
import type { ReasonCode } from './phaseClassifier';
import { selectShortlist, type ShortlistEntry, type ShortlistResult } from './shortlist';

/**
 * Audition kataloğunu yazan taraf (F5). Katalog ARAŞTIRMA ÇIKTISIDIR:
 * `research-out` altına yazılır, üretim derlemesine girmez.
 */
export interface CatalogCandidate {
  readonly index: number;
  readonly candidate: SubstrateCandidate;
  readonly primary: ReasonCode | null;
  readonly phaseDistribution: Readonly<Record<string, number>>;
  readonly metrics: CatalogMetrics;
  readonly risks: readonly string[];
}

export interface CatalogMetrics {
  readonly clusteredFraction: number;
  readonly clusterCount: number;
  readonly clusterCompactness: number;
  readonly clusterAnisotropy: number;
  readonly meanSpeed: number;
  readonly maxSpeed: number;
  readonly retention: number;
  readonly radialStructure: number;
}

/**
 * Davranış AİLESİ yalnız ÖLÇÜLEN metriklerden çıkar.
 *
 * `chasing`, `symbiotic` ve `recovering` bu koşunun ölçmediği şeyleri ister
 * (tipler arası takip, karşılıklı bağımlılık, perturbation sonrası toparlanma);
 * bu yüzden otomatik ATANMAZ. İnsan ön-elemesi (P2) onları kendi gözüyle
 * işaretler. Karşılığı olmayan aday `unclassified` kalır — uydurulmuş etiket,
 * kataloğun taşıdığı en pahalı yalandır.
 */
export const AUTOMATIC_FAMILIES = ['core-like', 'membrane-like', 'mobile', 'fragile'] as const;
export const UNCLASSIFIED_FAMILY = 'unclassified';

export function familyOf(metrics: CatalogMetrics): string {
  if (metrics.retention < 0.5) return 'fragile';
  if (metrics.clusteredFraction < 0.3) return UNCLASSIFIED_FAMILY;
  const speedRatio = metrics.maxSpeed > 0 ? metrics.meanSpeed / metrics.maxSpeed : 0;
  if (speedRatio >= 0.2) return 'mobile';
  if (metrics.clusterCompactness >= 0.6 && metrics.clusterCount <= 3) return 'core-like';
  if (metrics.clusterAnisotropy >= 0.5 || metrics.radialStructure >= 0.5) return 'membrane-like';
  return UNCLASSIFIED_FAMILY;
}

/** Çeşitlilik ölçümünün vektörü; bileşenler [0, 1] aralığına getirilir. */
export function metricVector(metrics: CatalogMetrics): number[] {
  return [
    clamp01(metrics.clusteredFraction),
    clamp01(metrics.maxSpeed > 0 ? metrics.meanSpeed / metrics.maxSpeed : 0),
    clamp01(metrics.clusterCount / 16),
    clamp01(metrics.clusterCompactness),
    clamp01(metrics.clusterAnisotropy),
    clamp01(metrics.retention),
  ];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export interface CatalogBuild {
  readonly catalog: AuditionCatalog;
  readonly shortlist: ShortlistResult;
}

export interface CatalogContext {
  readonly corpusId: string;
  readonly seeds: readonly number[];
  readonly sourceRevision: string;
  readonly sourceDirty: boolean;
  readonly particleRadiusUnits?: number;
}

export function buildAuditionCatalog(
  candidates: readonly CatalogCandidate[],
  context: CatalogContext,
): CatalogBuild {
  if (context.seeds.length !== AUDITION_SEED_COUNT) {
    throw new RangeError(`Audition ${AUDITION_SEED_COUNT} tohumla gösterilir.`);
  }
  const shortlist = selectShortlist(candidates.map(toShortlistEntry));
  const byIndex = new Map(candidates.map((candidate) => [candidate.index, candidate]));
  const entries = shortlist.selected.map((selected) => {
    const source = byIndex.get(selected.index);
    if (!source) throw new Error(`Kısa listede olmayan aday: ${selected.index}`);
    return toCatalogEntry(source);
  });
  const catalog: AuditionCatalog = {
    schemaVersion: AUDITION_CATALOG_SCHEMA_VERSION,
    corpusId: context.corpusId,
    seeds: [...context.seeds],
    sourceRevision: context.sourceRevision,
    sourceDirty: context.sourceDirty,
    entries,
  };
  validateAuditionCatalog(catalog, context.particleRadiusUnits ?? particleConfig.radiusUnits);
  return { catalog, shortlist };
}

function toShortlistEntry(candidate: CatalogCandidate): ShortlistEntry {
  return {
    index: candidate.index,
    digest: digestSubstrateCandidate(candidate.candidate),
    primary: candidate.primary,
    // Skor SIRALAMA içindir, kabul için değil: seçim çeşitliliğe göre yapılır.
    score: candidate.metrics.clusteredFraction * candidate.metrics.retention,
    metrics: metricVector(candidate.metrics),
  };
}

function toCatalogEntry(candidate: CatalogCandidate): AuditionCatalogEntry {
  return {
    digest: digestSubstrateCandidate(candidate.candidate),
    genome: serializeSubstrateCandidate(candidate.candidate),
    family: familyOf(candidate.metrics),
    primaryReason: candidate.primary ?? 'ÇOĞUNLUK_YOK',
    phaseDistribution: { ...candidate.phaseDistribution },
    metrics: { ...candidate.metrics },
    risks: [...candidate.risks],
  };
}
