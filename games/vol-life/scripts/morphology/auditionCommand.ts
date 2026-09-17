import { parseSubstrateCandidate } from '@/config/candidate';
import { particleConfig } from '@/config/particles';
import type { ReasonCode } from './phaseClassifier';
import {
  buildAuditionCatalog,
  familyOf,
  type CatalogBuild,
  type CatalogCandidate,
  type CatalogMetrics,
} from './auditionCatalog';

/**
 * `research:shortlist` ve `research:audition` komutlarının saf kısmı (F5).
 * Dosya okuma/yazma CLI'da kalır; seçim, doğrulama ve rapor burada test edilir.
 */
export interface CandidateRecord {
  readonly index: number;
  readonly genome: string;
  readonly primary: ReasonCode | null;
  readonly structured: boolean;
  readonly phaseDistribution: Record<string, number>;
  readonly metrics: CatalogMetrics;
}

export function parseCandidateRecords(text: string): CandidateRecord[] {
  const records = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as CandidateRecord);
  if (records.length === 0) {
    throw new RangeError('Aday kaydı yok: kısa liste ÜRETİLEMEZ (önce broad koşusu).');
  }
  return records;
}

/**
 * Kısa listeye YALNIZ yapısal adaylar girer. Yapısal aday yoksa katalog
 * üretilmez; boş bir audition oturumu, "eleme yapıldı" görüntüsü verirdi.
 */
export function toCatalogCandidates(
  records: readonly CandidateRecord[],
  particleRadiusUnits = particleConfig.radiusUnits,
): CatalogCandidate[] {
  const structured = records.filter((record) => record.structured);
  if (structured.length === 0) {
    throw new RangeError('Yapısal aday yok: audition kataloğu üretilemez (§8.4 falsification).');
  }
  return structured.map((record) => ({
    index: record.index,
    candidate: parseSubstrateCandidate(record.genome, particleRadiusUnits),
    primary: record.primary,
    phaseDistribution: record.phaseDistribution,
    metrics: record.metrics,
    risks: risksOf(record),
  }));
}

/** Riskler ÖLÇÜLEN sayılardan türer; genel uyarı cümlesi yazılmaz. */
export function risksOf(record: CandidateRecord): string[] {
  const risks: string[] = [];
  const metrics = record.metrics;
  if (metrics.retention < 0.8) {
    risks.push(`madde tutma %${(metrics.retention * 100).toFixed(0)}`);
  }
  if (metrics.clusterCount <= 1) risks.push('tek kümeye çöküyor');
  if (metrics.maxSpeed > 0 && metrics.meanSpeed / metrics.maxSpeed >= 0.5) {
    risks.push('ortalama hız tavanın yarısından yüksek');
  }
  if (metrics.clusteredFraction < 0.5) {
    risks.push(`yapılı madde payı %${(metrics.clusteredFraction * 100).toFixed(0)}`);
  }
  const distinctPhases = Object.keys(record.phaseDistribution).length;
  if (distinctPhases > 1) risks.push(`seed'ler arası faz tutarsız (${distinctPhases} faz)`);
  return risks;
}

export interface AuditionContext {
  readonly corpusId: string;
  readonly seeds: readonly number[];
  readonly sourceRevision: string;
  readonly sourceDirty: boolean;
}

export function buildFromRecords(
  records: readonly CandidateRecord[],
  context: AuditionContext,
): CatalogBuild {
  return buildAuditionCatalog(toCatalogCandidates(records), context);
}

export function formatShortlistReport(build: CatalogBuild): string {
  const lines = [
    `kısa liste: ${build.catalog.entries.length} aday`,
    `korpus: ${build.catalog.corpusId}, tohumlar: ${build.catalog.seeds.join(', ')}`,
    `faz kapsamı: ${build.shortlist.phaseCoverage
      .map((phase) => phase ?? 'ÇOĞUNLUK_YOK')
      .join(', ')}`,
    `en yakın iki aday arası metrik uzaklık: ${build.shortlist.minPairwiseDistance.toFixed(3)}`,
    `kaynak: ${build.catalog.sourceRevision.slice(0, 12)}${
      build.catalog.sourceDirty ? ' (KİRLİ)' : ''
    }`,
  ];
  for (const entry of build.catalog.entries) {
    const risks = entry.risks.length > 0 ? entry.risks.join('; ') : 'ölçülen risk yok';
    lines.push(
      `  ${entry.digest} · ${entry.family} · ${entry.primaryReason} · ` +
        `yapılı %${(entry.metrics.clusteredFraction * 100).toFixed(0)} · ` +
        `tutma %${(entry.metrics.retention * 100).toFixed(0)} · ${risks}`,
    );
  }
  return lines.join('\n');
}

export { familyOf };
